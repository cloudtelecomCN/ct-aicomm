import { createHash } from "node:crypto";
import { collectTtft } from "../ttft-collector/collector.mjs";
import { freezeEnvironment } from "./environment-freeze.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildBaselinePlan({ environment, prompts, minimumSamples = 200, repetitions = 3 }) {
  const frozen = freezeEnvironment(environment);
  if (environment.evidence_origin !== "measured") fail("measured_environment_required", "baseline collection requires a measured frozen environment");
  if (!Array.isArray(prompts) || !prompts.length) fail("prompt_dataset_empty", "at least one versioned prompt is required");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1 || !Number.isInteger(repetitions) || repetitions < 1) fail("sample_policy_invalid", "sample counts must be positive integers");
  for (const prompt of prompts) if (!prompt?.id || !prompt?.prompt || !prompt?.class) fail("prompt_invalid", "every prompt requires id, class, and prompt");

  const requests = [];
  for (let repetition = 1; requests.length < minimumSamples; repetition = repetition % repetitions + 1) {
    const prompt = prompts[requests.length % prompts.length];
    requests.push(Object.freeze({ sequence: requests.length + 1, repetition, prompt_id: prompt.id, prompt_class: prompt.class, prompt: prompt.prompt }));
  }
  const body = {
    schema_version: "1.0.0",
    group: "baseline",
    route_policy: "existing_route_unchanged",
    environment_fingerprint: frozen.environment_fingerprint,
    prompt_dataset_sha256: environment.prompt_dataset.sha256,
    minimum_samples: minimumSamples,
    repetitions,
    requests
  };
  return Object.freeze({ ...body, plan_sha256: digest(body) });
}

export async function runBaselinePlan({ plan, endpoint, model, apiKey, fetchImpl, collect = collectTtft }) {
  if (!plan || plan.group !== "baseline" || plan.route_policy !== "existing_route_unchanged") fail("baseline_plan_invalid", "only an unchanged-route baseline plan may run");
  if (!/^sha256:[a-f0-9]{64}$/.test(plan.environment_fingerprint ?? "")) fail("environment_fingerprint_invalid", "a frozen environment fingerprint is required");
  const samples = [];
  for (const request of plan.requests) {
    samples.push(await collect({
      endpoint,
      model,
      prompt: request.prompt,
      environmentFingerprint: plan.environment_fingerprint,
      apiKey,
      fetchImpl,
      sampleId: `baseline-${String(request.sequence).padStart(6, "0")}`
    }));
  }
  const failures = samples.filter((sample) => !sample.outcome.success);
  const body = {
    schema_version: "1.0.0",
    status: samples.length >= plan.minimum_samples ? "collected" : "incomplete",
    data_origin: "measured",
    group: "baseline",
    plan_sha256: plan.plan_sha256,
    environment_fingerprint: plan.environment_fingerprint,
    sample_count: samples.length,
    success_count: samples.length - failures.length,
    failure_count: failures.length,
    failure_sample_ids: failures.map((sample) => sample.sample_id),
    samples
  };
  return Object.freeze({ ...body, batch_sha256: digest(body) });
}
