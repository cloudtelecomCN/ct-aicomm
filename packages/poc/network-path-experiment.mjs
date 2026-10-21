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

export function buildNetworkPathPlan({ environment, prompts, fixedInstanceId, baselineRouteId, candidateRouteId, policyRevision, minimumSamples = 200, repetitions = 3 }) {
  const frozen = freezeEnvironment(environment);
  if (environment.evidence_origin !== "measured") fail("measured_environment_required", "network-path collection requires a measured frozen environment");
  if (!Array.isArray(prompts) || !prompts.length) fail("prompt_dataset_empty", "at least one versioned prompt is required");
  if (![fixedInstanceId, baselineRouteId, candidateRouteId].every((value) => typeof value === "string" && value.length)) fail("network_control_missing", "fixed instance and both route identities are required");
  if (baselineRouteId === candidateRouteId) fail("network_route_unchanged", "baseline and candidate routes must differ");
  if (!Number.isInteger(policyRevision) || policyRevision < 1) fail("policy_revision_invalid", "a positive applied policy revision is required");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1 || !Number.isInteger(repetitions) || repetitions < 1) fail("sample_policy_invalid", "sample counts must be positive integers");
  for (const prompt of prompts) if (!prompt?.id || !prompt?.prompt || !prompt?.class) fail("prompt_invalid", "every prompt requires id, class, and prompt");

  const concurrencyLevels = environment.load_profile.concurrency;
  const requests = [];
  while (requests.length < minimumSamples) {
    const sequence = requests.length;
    const prompt = prompts[sequence % prompts.length];
    const stratum = Math.floor(sequence / prompts.length);
    requests.push(Object.freeze({
      sequence: sequence + 1,
      repetition: Math.floor(stratum / concurrencyLevels.length) % repetitions + 1,
      concurrency: concurrencyLevels[stratum % concurrencyLevels.length],
      prompt_id: prompt.id,
      prompt_class: prompt.class,
      prompt: prompt.prompt
    }));
  }
  const body = {
    schema_version: "1.0.0",
    group: "network_only",
    route_policy: "ebpf_redirect_fixed_instance",
    environment_fingerprint: frozen.environment_fingerprint,
    prompt_dataset_sha256: environment.prompt_dataset.sha256,
    fixed_instance_id: fixedInstanceId,
    baseline_route_id: baselineRouteId,
    candidate_route_id: candidateRouteId,
    policy_revision: policyRevision,
    minimum_samples: minimumSamples,
    repetitions,
    concurrency_levels: concurrencyLevels,
    requests
  };
  return Object.freeze({ ...body, plan_sha256: digest(body) });
}

export async function runNetworkPathPlan({ plan, endpoint, model, apiKey, fetchImpl, collect = collectTtft }) {
  if (!plan || plan.group !== "network_only" || plan.route_policy !== "ebpf_redirect_fixed_instance") fail("network_plan_invalid", "only a fixed-instance eBPF network plan may run");
  if (!/^sha256:[a-f0-9]{64}$/.test(plan.environment_fingerprint ?? "")) fail("environment_fingerprint_invalid", "a frozen environment fingerprint is required");
  const samplesBySequence = new Map();
  for (let repetition = 1; repetition <= plan.repetitions; repetition++) {
    for (const concurrency of plan.concurrency_levels) {
      const stratum = plan.requests.filter((request) => request.repetition === repetition && request.concurrency === concurrency);
      for (let offset = 0; offset < stratum.length; offset += concurrency) {
        const window = stratum.slice(offset, offset + concurrency);
        const measured = await Promise.all(window.map(async (request) => ({
          sequence: request.sequence,
          sample: await collect({ endpoint, model, prompt: request.prompt, environmentFingerprint: plan.environment_fingerprint, apiKey, fetchImpl, sampleId: `network-only-${String(request.sequence).padStart(6, "0")}` })
        })));
        for (const result of measured) samplesBySequence.set(result.sequence, result.sample);
      }
    }
  }
  const samples = plan.requests.map(({ sequence }) => samplesBySequence.get(sequence));
  const failures = samples.filter((sample) => !sample.outcome.success);
  const body = {
    schema_version: "1.0.0",
    status: samples.length >= plan.minimum_samples ? "collected" : "incomplete",
    data_origin: "measured",
    group: "network_only",
    route_policy: plan.route_policy,
    fixed_instance_id: plan.fixed_instance_id,
    baseline_route_id: plan.baseline_route_id,
    candidate_route_id: plan.candidate_route_id,
    policy_revision: plan.policy_revision,
    plan_sha256: plan.plan_sha256,
    environment_fingerprint: plan.environment_fingerprint,
    sample_count: samples.length,
    success_count: samples.length - failures.length,
    failure_count: failures.length,
    failure_sample_ids: failures.map((sample) => sample.sample_id),
    assignments: plan.requests.map(({ sequence, repetition, concurrency, prompt_id, prompt_class }) => ({ sample_id: `network-only-${String(sequence).padStart(6, "0")}`, repetition, concurrency, prompt_id, prompt_class, fixed_instance_id: plan.fixed_instance_id, route_id: plan.candidate_route_id, policy_revision: plan.policy_revision })),
    samples
  };
  return Object.freeze({ ...body, batch_sha256: digest(body) });
}
