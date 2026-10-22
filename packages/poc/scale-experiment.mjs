import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
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

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * probability) - 1)];
}

function validateAlias(value, field) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value ?? "")) fail("scale_alias_invalid", `${field} must be a stable lowercase alias`);
  return value;
}

export function buildScalePlan({ environment, prompts, topologies, concurrencyLevels, samplesPerStratum = 32, repetitions = 2 }) {
  const frozen = freezeEnvironment(environment);
  if (environment.evidence_origin !== "measured") fail("measured_environment_required", "scale collection requires a measured frozen environment");
  if (!Array.isArray(prompts) || !prompts.length || prompts.some((prompt) => !prompt?.id || !prompt?.class || !prompt?.prompt)) {
    fail("scale_prompts_invalid", "at least one versioned prompt with id, class, and prompt is required");
  }
  if (!Array.isArray(topologies) || topologies.length < 2) fail("scale_topologies_invalid", "at least two endpoint topologies are required");
  if (!Array.isArray(concurrencyLevels) || !concurrencyLevels.length || concurrencyLevels.some((value) => !Number.isInteger(value) || value < 1 || value > 256)) {
    fail("scale_concurrency_invalid", "concurrency levels must be integers between 1 and 256");
  }
  if (!Number.isInteger(samplesPerStratum) || samplesPerStratum < Math.max(...concurrencyLevels)) {
    fail("scale_sample_policy_invalid", "samples per stratum must cover the highest concurrency level");
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) fail("scale_repetitions_invalid", "repetitions must be between 1 and 20");

  const topologyIds = new Set();
  const normalizedTopologies = topologies.map((topology) => {
    const id = validateAlias(topology?.id, "topology id");
    if (topologyIds.has(id)) fail("scale_topology_duplicate", `duplicate topology: ${id}`);
    topologyIds.add(id);
    if (!Array.isArray(topology.endpoint_ids) || !topology.endpoint_ids.length) fail("scale_endpoints_invalid", `${id} requires endpoint aliases`);
    const endpointIds = topology.endpoint_ids.map((endpointId) => validateAlias(endpointId, "endpoint id"));
    if (new Set(endpointIds).size !== endpointIds.length) fail("scale_endpoint_duplicate", `${id} contains duplicate endpoint aliases`);
    return Object.freeze({ id, endpoint_ids: endpointIds });
  });

  const requests = [];
  let sequence = 0;
  for (const topology of normalizedTopologies) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const concurrency of concurrencyLevels) {
        for (let offset = 0; offset < samplesPerStratum; offset += 1) {
          sequence += 1;
          const prompt = prompts[(sequence - 1) % prompts.length];
          requests.push(Object.freeze({
            sequence,
            sample_id: `scale-${String(sequence).padStart(6, "0")}`,
            topology_id: topology.id,
            endpoint_id: topology.endpoint_ids[offset % topology.endpoint_ids.length],
            repetition,
            concurrency,
            prompt_id: prompt.id,
            prompt_class: prompt.class,
            prompt: prompt.prompt
          }));
        }
      }
    }
  }

  const body = {
    schema_version: "1.0.0",
    experiment: "multi_endpoint_saturation_v1",
    data_origin: "measured",
    environment_fingerprint: frozen.environment_fingerprint,
    prompt_dataset_sha256: environment.prompt_dataset.sha256,
    topologies: normalizedTopologies,
    concurrency_levels: [...concurrencyLevels],
    samples_per_stratum: samplesPerStratum,
    repetitions,
    requests
  };
  return Object.freeze({ ...body, plan_sha256: digest(body) });
}

export async function runScalePlan({ plan, endpoints, model, apiKey, collect = collectTtft, now = () => performance.now() }) {
  if (plan?.experiment !== "multi_endpoint_saturation_v1" || plan?.data_origin !== "measured") fail("scale_plan_invalid", "a measured scale plan is required");
  if (!(endpoints instanceof Map)) fail("scale_endpoint_map_invalid", "endpoints must be a Map keyed by aliases");
  const requiredEndpointIds = new Set(plan.topologies.flatMap((topology) => topology.endpoint_ids));
  for (const endpointId of requiredEndpointIds) {
    const endpoint = endpoints.get(endpointId);
    if (!endpoint || !/^https?:\/\//u.test(endpoint)) fail("scale_endpoint_missing", `runtime endpoint missing for ${endpointId}`);
  }

  const samples = [];
  const strata = [];
  for (const topology of plan.topologies) {
    for (let repetition = 1; repetition <= plan.repetitions; repetition += 1) {
      for (const concurrency of plan.concurrency_levels) {
        const requests = plan.requests.filter((request) => request.topology_id === topology.id && request.repetition === repetition && request.concurrency === concurrency);
        const started = now();
        for (let offset = 0; offset < requests.length; offset += concurrency) {
          const window = requests.slice(offset, offset + concurrency);
          samples.push(...await Promise.all(window.map((request) => collect({
            endpoint: endpoints.get(request.endpoint_id),
            model,
            prompt: request.prompt,
            environmentFingerprint: plan.environment_fingerprint,
            apiKey,
            sampleId: request.sample_id
          }))));
        }
        const durationMs = Math.max(0.001, now() - started);
        strata.push(Object.freeze({ topology_id: topology.id, repetition, concurrency, attempt_count: requests.length, duration_ms: durationMs }));
      }
    }
  }

  const failureSampleIds = samples.filter((sample) => !sample.outcome?.success).map((sample) => sample.sample_id);
  const body = {
    schema_version: "1.0.0",
    experiment: plan.experiment,
    data_origin: "measured",
    environment_fingerprint: plan.environment_fingerprint,
    plan_sha256: plan.plan_sha256,
    sample_count: samples.length,
    success_count: samples.length - failureSampleIds.length,
    failure_count: failureSampleIds.length,
    failure_sample_ids: failureSampleIds,
    assignments: plan.requests.map(({ prompt, ...assignment }) => assignment),
    strata,
    samples
  };
  return Object.freeze({ ...body, batch_sha256: digest(body) });
}

export function summarizeScaleBatch(batch) {
  if (batch?.experiment !== "multi_endpoint_saturation_v1" || !Array.isArray(batch.samples) || !Array.isArray(batch.assignments) || !Array.isArray(batch.strata)) {
    fail("scale_batch_invalid", "a complete scale batch is required");
  }
  const samples = new Map(batch.samples.map((sample) => [sample.sample_id, sample]));
  if (samples.size !== batch.samples.length) fail("scale_batch_duplicate_sample", "sample ids must be unique");
  const rows = [];
  const keys = [...new Set(batch.assignments.map((assignment) => `${assignment.topology_id}|${assignment.concurrency}`))]
    .sort((left, right) => {
      const [leftTopology, leftConcurrency] = left.split("|");
      const [rightTopology, rightConcurrency] = right.split("|");
      return leftTopology.localeCompare(rightTopology) || Number(leftConcurrency) - Number(rightConcurrency);
    });
  for (const key of keys) {
    const [topologyId, concurrencyText] = key.split("|");
    const assignments = batch.assignments.filter((assignment) => assignment.topology_id === topologyId && assignment.concurrency === Number(concurrencyText));
    const selected = assignments.map((assignment) => samples.get(assignment.sample_id));
    const observed = selected.filter(Boolean);
    const successful = observed.filter((sample) => sample.outcome?.success && Number.isFinite(sample.segments?.ttft_ms));
    const values = successful.map((sample) => sample.segments.ttft_ms);
    const durations = batch.strata.filter((stratum) => stratum.topology_id === topologyId && stratum.concurrency === Number(concurrencyText));
    const totalDurationSeconds = durations.reduce((sum, stratum) => sum + stratum.duration_ms, 0) / 1000;
    rows.push(Object.freeze({
      topology_id: topologyId,
      endpoint_count: new Set(assignments.map((assignment) => assignment.endpoint_id)).size,
      concurrency: Number(concurrencyText),
      attempt_count: assignments.length,
      observed_count: observed.length,
      missing_count: assignments.length - observed.length,
      success_count: successful.length,
      failure_count: assignments.length - successful.length,
      success_rate: assignments.length ? successful.length / assignments.length : 0,
      throughput_requests_per_second: totalDurationSeconds ? successful.length / totalDurationSeconds : 0,
      ttft_ms: { p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99) }
    }));
  }
  const body = {
    schema_version: "1.0.0",
    experiment: batch.experiment,
    data_origin: batch.data_origin,
    environment_fingerprint: batch.environment_fingerprint,
    plan_sha256: batch.plan_sha256,
    batch_sha256: batch.batch_sha256,
    rows,
    claim_boundary: "Results apply only to the frozen endpoint topology, model, load profile, and network. They do not establish production capacity or a universal scaling claim."
  };
  return Object.freeze({ ...body, summary_sha256: digest(body) });
}
