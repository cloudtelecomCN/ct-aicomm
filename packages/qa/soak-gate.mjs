import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const STAGES = Object.freeze({
  preflight: Object.freeze({ minimum_duration_seconds: 240 }),
  seven_day: Object.freeze({ minimum_duration_seconds: 7 * 24 * 60 * 60 }),
  thirty_day: Object.freeze({ minimum_duration_seconds: 30 * 24 * 60 * 60 })
});

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function hash(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) fail("soak_hash_invalid", `${field} must be a SHA-256 fingerprint`);
  return value;
}

function timestamp(value, field) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail("soak_timestamp_invalid", `${field} must be an ISO timestamp`);
  return parsed;
}

function alias(value, field) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value ?? "")) fail("soak_alias_invalid", `${field} must be a stable lowercase alias`);
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail("soak_integer_invalid", `${field} must be a positive integer`);
  return value;
}

function finiteNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) fail("soak_number_invalid", `${field} must be a non-negative number`);
  return value;
}

function recordEnvelope(value, field) {
  if (value?.schema_version !== "1.0.0" || value?.task !== "CT-581" || value?.data_origin !== "measured") {
    fail("soak_record_invalid", `${field} must be a measured CT-581 record`);
  }
}

function exactHash(value, expected, field) {
  if (value !== expected) fail("soak_artifact_mismatch", `${field} does not match the frozen manifest`);
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * probability) - 1)];
}

function windowMedian(values, side) {
  const width = Math.max(1, Math.ceil(values.length * 0.1));
  return percentile(side === "first" ? values.slice(0, width) : values.slice(-width), 0.5);
}

function growth(values) {
  if (!values.length) return { first_median: null, last_median: null, absolute: null, ratio: null, peak: null };
  const first = windowMedian(values, "first");
  const last = windowMedian(values, "last");
  return {
    first_median: first,
    last_median: last,
    absolute: last - first,
    ratio: first > 0 ? (last - first) / first : null,
    peak: Math.max(...values)
  };
}

function maxGapSeconds(records, timeField, startedAt = null, finishedAt = null) {
  let maximum = startedAt === null || !records.length ? 0 : (timestamp(records[0][timeField], timeField) - startedAt) / 1000;
  for (let index = 1; index < records.length; index += 1) {
    maximum = Math.max(maximum, (timestamp(records[index][timeField], timeField) - timestamp(records[index - 1][timeField], timeField)) / 1000);
  }
  if (finishedAt !== null && records.length) maximum = Math.max(maximum, (finishedAt - timestamp(records.at(-1)[timeField], timeField)) / 1000);
  return maximum;
}

export function createSoakManifest(input) {
  const stage = input?.stage;
  if (!Object.hasOwn(STAGES, stage)) fail("soak_stage_invalid", `unsupported soak stage: ${stage}`);
  const nodeAliases = [...(input.node_aliases ?? [])].map((value) => alias(value, "node alias"));
  const endpointAliases = [...(input.endpoint_aliases ?? [])].map((value) => alias(value, "endpoint alias"));
  if (new Set(nodeAliases).size !== nodeAliases.length || nodeAliases.length < 2) fail("soak_nodes_invalid", "at least two unique node aliases are required");
  if (new Set(endpointAliases).size !== endpointAliases.length || endpointAliases.length < 2) fail("soak_endpoints_invalid", "at least two unique endpoint aliases are required");
  const startedAt = new Date(timestamp(input.started_at, "started_at")).toISOString();
  const plannedFinishAt = new Date(Date.parse(startedAt) + STAGES[stage].minimum_duration_seconds * 1000).toISOString();
  const workload = {
    cadence_seconds: positiveInteger(input.workload?.cadence_seconds, "workload cadence"),
    concurrency_levels: [...(input.workload?.concurrency_levels ?? [])],
    samples_per_stratum: positiveInteger(input.workload?.samples_per_stratum, "samples per stratum"),
    repetitions: positiveInteger(input.workload?.repetitions, "repetitions")
  };
  if (!workload.concurrency_levels.length || workload.concurrency_levels.some((value) => !Number.isInteger(value) || value < 1 || value > 256)) {
    fail("soak_concurrency_invalid", "concurrency levels must be integers between 1 and 256");
  }
  if (workload.samples_per_stratum < Math.max(...workload.concurrency_levels)) fail("soak_samples_invalid", "samples per stratum must cover the highest concurrency");
  const thresholds = {
    observation_interval_seconds: positiveInteger(input.thresholds?.observation_interval_seconds, "observation interval"),
    maximum_observation_gap_seconds: positiveInteger(input.thresholds?.maximum_observation_gap_seconds, "maximum observation gap"),
    maximum_workload_gap_seconds: positiveInteger(input.thresholds?.maximum_workload_gap_seconds, "maximum workload gap"),
    maximum_failure_ratio: finiteNonNegative(input.thresholds?.maximum_failure_ratio, "maximum failure ratio"),
    maximum_ttft_p95_drift_ratio: finiteNonNegative(input.thresholds?.maximum_ttft_p95_drift_ratio, "maximum TTFT drift ratio"),
    maximum_agent_rss_growth_kib: finiteNonNegative(input.thresholds?.maximum_agent_rss_growth_kib, "maximum Agent RSS growth"),
    maximum_agent_rss_growth_ratio: finiteNonNegative(input.thresholds?.maximum_agent_rss_growth_ratio, "maximum Agent RSS growth ratio"),
    maximum_vllm_rss_growth_kib: finiteNonNegative(input.thresholds?.maximum_vllm_rss_growth_kib, "maximum vLLM RSS growth"),
    maximum_gpu_memory_growth_mib: finiteNonNegative(input.thresholds?.maximum_gpu_memory_growth_mib, "maximum GPU memory growth")
  };
  if (thresholds.maximum_failure_ratio > 1 || thresholds.maximum_ttft_p95_drift_ratio > 10 || thresholds.maximum_agent_rss_growth_ratio > 10) {
    fail("soak_ratio_invalid", "ratio thresholds are outside the supported range");
  }
  if (thresholds.maximum_observation_gap_seconds < thresholds.observation_interval_seconds) {
    fail("soak_gap_invalid", "maximum observation gap cannot be shorter than the sampling interval");
  }

  const body = {
    schema_version: "1.0.0",
    task: "CT-581",
    stage,
    started_at: startedAt,
    planned_finish_at: plannedFinishAt,
    minimum_duration_seconds: STAGES[stage].minimum_duration_seconds,
    environment_fingerprint: hash(input.environment_fingerprint, "environment_fingerprint"),
    source_commit: String(input.source_commit ?? ""),
    artifacts: {
      agent_sha256: hash(input.artifacts?.agent_sha256, "agent_sha256"),
      bpf_sha256: hash(input.artifacts?.bpf_sha256, "bpf_sha256"),
      prompt_dataset_sha256: hash(input.artifacts?.prompt_dataset_sha256, "prompt_dataset_sha256"),
      collector_sha256: hash(input.artifacts?.collector_sha256, "collector_sha256"),
      runner_sha256: hash(input.artifacts?.runner_sha256, "runner_sha256"),
      monitor_sha256: hash(input.artifacts?.monitor_sha256, "monitor_sha256")
    },
    model: String(input.model ?? ""),
    node_aliases: nodeAliases,
    endpoint_aliases: endpointAliases,
    workload,
    thresholds,
    evidence_boundary: {
      raw_evidence_visibility: "restricted",
      public_receipt_contains_runtime_endpoints: false,
      performance_claim_scope: "frozen_environment_only"
    }
  };
  if (!/^[a-f0-9]{40}$/u.test(body.source_commit)) fail("soak_commit_invalid", "source_commit must be a full Git commit");
  if (!body.model.trim()) fail("soak_model_invalid", "model is required");
  return Object.freeze({ ...body, manifest_fingerprint: digest(body) });
}

export function validateSoakManifest(input) {
  const expected = createSoakManifest(input);
  if (!isDeepStrictEqual(input, expected)) fail("soak_manifest_tampered", "manifest body or fingerprint does not match its canonical form");
  return expected;
}

export function verifySoakStage({ manifest, workloadWindows, nodeObservations, finishedAt }) {
  validateSoakManifest(manifest);
  if (!Array.isArray(workloadWindows) || !workloadWindows.length) fail("soak_workload_missing", "workload windows are required");
  if (!Array.isArray(nodeObservations) || !nodeObservations.length) fail("soak_observations_missing", "node observations are required");
  const finished = timestamp(finishedAt, "finished_at");
  const started = timestamp(manifest.started_at, "started_at");
  const durationSeconds = (finished - started) / 1000;
  const failures = [];
  if (durationSeconds < manifest.minimum_duration_seconds) failures.push("duration_incomplete");

  const sortedWindows = [...workloadWindows].sort((left, right) => timestamp(left.started_at, "workload started_at") - timestamp(right.started_at, "workload started_at"));
  if (new Set(sortedWindows.map((window) => window.window_id)).size !== sortedWindows.length) fail("soak_window_duplicate", "workload window IDs must be unique");
  let attempts = 0;
  let successes = 0;
  const p95Values = [];
  for (const [index, window] of sortedWindows.entries()) {
    recordEnvelope(window, `workload window ${index + 1}`);
    const expectedWindowId = `window-${String(index + 1).padStart(6, "0")}`;
    if (window.window_id !== expectedWindowId) failures.push("workload_window_sequence_gap");
    positiveInteger(window.attempt_count, "workload attempt_count");
    if (window.manifest_fingerprint !== manifest.manifest_fingerprint) fail("soak_window_manifest_mismatch", "workload window is not bound to the soak manifest");
    const windowStarted = timestamp(window.started_at, "workload started_at");
    const windowFinished = timestamp(window.finished_at, "workload finished_at");
    if (windowStarted < started || windowStarted > finished || windowFinished < windowStarted || windowFinished > finished) failures.push("workload_window_outside_stage");
    if (!Number.isSafeInteger(window.success_count) || window.success_count < 0 || window.success_count > window.attempt_count) fail("soak_success_count_invalid", "success_count is invalid");
    if (!Number.isSafeInteger(window.failure_count) || window.failure_count !== window.attempt_count - window.success_count) fail("soak_failure_count_invalid", "failure_count is invalid");
    hash(window.plan_sha256, "workload plan_sha256");
    hash(window.batch_sha256, "workload batch_sha256");
    exactHash(window.artifacts?.collector_sha256, manifest.artifacts.collector_sha256, "workload collector");
    exactHash(window.artifacts?.runner_sha256, manifest.artifacts.runner_sha256, "workload runner");
    exactHash(window.artifacts?.prompt_dataset_sha256, manifest.artifacts.prompt_dataset_sha256, "workload prompt dataset");
    attempts += window.attempt_count;
    successes += window.success_count;
    if (window.success_count > 0 && !Number.isFinite(window.ttft_ms?.p95)) failures.push("workload_ttft_missing");
    if (Number.isFinite(window.ttft_ms?.p95)) {
      finiteNonNegative(window.ttft_ms.p95, "workload TTFT p95");
      p95Values.push(window.ttft_ms.p95);
    }
  }
  const failureRatio = attempts ? (attempts - successes) / attempts : 1;
  if (failureRatio > manifest.thresholds.maximum_failure_ratio) failures.push("failure_ratio_exceeded");
  const workloadGap = maxGapSeconds(sortedWindows, "started_at", started, finished);
  if (workloadGap > manifest.thresholds.maximum_workload_gap_seconds) failures.push("workload_gap_exceeded");
  const ttftGrowth = growth(p95Values);
  if (ttftGrowth.ratio !== null && ttftGrowth.ratio > manifest.thresholds.maximum_ttft_p95_drift_ratio) failures.push("ttft_drift_exceeded");

  const unexpectedNode = nodeObservations.find((entry) => !manifest.node_aliases.includes(entry.node_alias));
  if (unexpectedNode) fail("soak_node_alias_invalid", `unexpected node observation alias: ${unexpectedNode.node_alias}`);
  const nodeResults = [];
  for (const nodeAlias of manifest.node_aliases) {
    const observations = nodeObservations
      .filter((entry) => entry.node_alias === nodeAlias)
      .sort((left, right) => timestamp(left.observed_at, "observed_at") - timestamp(right.observed_at, "observed_at"));
    if (!observations.length) {
      failures.push(`node_observations_missing:${nodeAlias}`);
      continue;
    }
    let previousHeartbeatSequence = null;
    let previousHeartbeatUptime = null;
    let previousHeartbeatAt = null;
    let maximumHeartbeatAge = 0;
    let resourceMissing = false;
    let artifactChanged = false;
    let inactive = false;
    let heartbeatInvalid = false;
    for (const [index, observation] of observations.entries()) {
      recordEnvelope(observation, `${nodeAlias} observation ${index + 1}`);
      if (observation.manifest_fingerprint !== manifest.manifest_fingerprint) fail("soak_observation_manifest_mismatch", `${nodeAlias} observation is not bound to the soak manifest`);
      if (observation.sequence !== index + 1) failures.push(`observation_sequence_gap:${nodeAlias}`);
      const observedAt = timestamp(observation.observed_at, "observed_at");
      if (observedAt < started || observedAt > finished) failures.push(`observation_outside_stage:${nodeAlias}`);
      const agentService = observation.services?.agent;
      const vllmService = observation.services?.vllm;
      if (agentService?.active_state !== "active" || agentService?.sub_state !== "running" || vllmService?.active_state !== "active" || vllmService?.sub_state !== "running") inactive = true;
      for (const service of [agentService, vllmService]) {
        if (!Number.isSafeInteger(service?.main_pid) || service.main_pid < 1 || !Number.isSafeInteger(service?.restart_count) || service.restart_count < 0) resourceMissing = true;
      }
      const agentProcess = observation.processes?.agent;
      const vllmProcess = observation.processes?.vllm;
      if (!Number.isFinite(agentProcess?.rss_kib) || !Number.isFinite(vllmProcess?.rss_kib) || !Number.isFinite(observation.gpu?.memory_used_mib)) resourceMissing = true;
      if (agentProcess?.pid !== agentService?.main_pid || vllmProcess?.pid !== vllmService?.main_pid) resourceMissing = true;
      if (observation.artifacts?.agent_sha256 !== manifest.artifacts.agent_sha256 || observation.artifacts?.bpf_sha256 !== manifest.artifacts.bpf_sha256 || observation.artifacts?.monitor_sha256 !== manifest.artifacts.monitor_sha256) artifactChanged = true;

      const heartbeat = observation.agent_heartbeat;
      if (heartbeat?.status !== "running" || heartbeat?.pid !== agentService?.main_pid || !Number.isSafeInteger(heartbeat?.sequence) || heartbeat.sequence < 1 || !Number.isFinite(heartbeat?.uptime_seconds) || heartbeat.uptime_seconds < 0) {
        heartbeatInvalid = true;
      } else {
        const heartbeatAt = timestamp(heartbeat.observed_at, "agent heartbeat observed_at");
        const heartbeatAge = (observedAt - heartbeatAt) / 1000;
        maximumHeartbeatAge = Math.max(maximumHeartbeatAge, heartbeatAge);
        if (heartbeatAge < 0 || heartbeatAge > manifest.thresholds.maximum_observation_gap_seconds) heartbeatInvalid = true;
        if ((previousHeartbeatSequence !== null && heartbeat.sequence < previousHeartbeatSequence) || (previousHeartbeatUptime !== null && heartbeat.uptime_seconds < previousHeartbeatUptime) || (previousHeartbeatAt !== null && heartbeatAt < previousHeartbeatAt)) heartbeatInvalid = true;
        previousHeartbeatSequence = heartbeat.sequence;
        previousHeartbeatUptime = heartbeat.uptime_seconds;
        previousHeartbeatAt = heartbeatAt;
      }
    }
    const observationGap = maxGapSeconds(observations, "observed_at", started, finished);
    const agentRss = observations.map((entry) => entry.processes?.agent?.rss_kib).filter(Number.isFinite);
    const vllmRss = observations.map((entry) => entry.processes?.vllm?.rss_kib).filter(Number.isFinite);
    const gpuMemory = observations.map((entry) => entry.gpu?.memory_used_mib).filter(Number.isFinite);
    const agentGrowth = growth(agentRss);
    const vllmGrowth = growth(vllmRss);
    const gpuGrowth = growth(gpuMemory);
    const restartCount = Math.max(...observations.flatMap((entry) => [entry.services?.agent?.restart_count ?? 0, entry.services?.vllm?.restart_count ?? 0]));
    const agentPids = new Set(observations.map((entry) => entry.services?.agent?.main_pid).filter((value) => Number.isInteger(value) && value > 0));
    const vllmPids = new Set(observations.map((entry) => entry.services?.vllm?.main_pid).filter((value) => Number.isInteger(value) && value > 0));
    const bootIds = new Set(observations.map((entry) => entry.boot_id).filter(Boolean));
    if (observationGap > manifest.thresholds.maximum_observation_gap_seconds) failures.push(`observation_gap_exceeded:${nodeAlias}`);
    if (resourceMissing || agentRss.length !== observations.length || vllmRss.length !== observations.length || gpuMemory.length !== observations.length) failures.push(`resource_observation_missing:${nodeAlias}`);
    if (restartCount > 0 || agentPids.size !== 1 || vllmPids.size !== 1 || bootIds.size !== 1) failures.push(`unexplained_restart:${nodeAlias}`);
    if (artifactChanged) failures.push(`artifact_drift:${nodeAlias}`);
    if (inactive) failures.push(`service_inactive:${nodeAlias}`);
    if (heartbeatInvalid) failures.push(`agent_heartbeat_invalid:${nodeAlias}`);
    if (agentGrowth.absolute !== null && (agentGrowth.absolute > manifest.thresholds.maximum_agent_rss_growth_kib || (agentGrowth.ratio ?? 0) > manifest.thresholds.maximum_agent_rss_growth_ratio)) failures.push(`agent_rss_growth_exceeded:${nodeAlias}`);
    if (vllmGrowth.absolute !== null && vllmGrowth.absolute > manifest.thresholds.maximum_vllm_rss_growth_kib) failures.push(`vllm_rss_growth_exceeded:${nodeAlias}`);
    if (gpuGrowth.absolute !== null && gpuGrowth.absolute > manifest.thresholds.maximum_gpu_memory_growth_mib) failures.push(`gpu_memory_growth_exceeded:${nodeAlias}`);
    nodeResults.push(Object.freeze({ node_alias: nodeAlias, observation_count: observations.length, maximum_gap_seconds: observationGap, maximum_heartbeat_age_seconds: maximumHeartbeatAge, restart_count: restartCount, agent_rss_kib: agentGrowth, vllm_rss_kib: vllmGrowth, gpu_memory_mib: gpuGrowth, artifact_changed: artifactChanged }));
  }

  const uniqueFailures = [...new Set(failures)].sort();
  const body = {
    schema_version: "1.0.0",
    task: "CT-581",
    stage: manifest.stage,
    data_origin: "measured",
    status: uniqueFailures.length ? "failed" : "passed",
    started_at: manifest.started_at,
    planned_finish_at: manifest.planned_finish_at,
    finished_at: new Date(finished).toISOString(),
    duration_seconds: durationSeconds,
    source_commit: manifest.source_commit,
    model: manifest.model,
    environment_fingerprint: manifest.environment_fingerprint,
    manifest_fingerprint: manifest.manifest_fingerprint,
    artifacts: manifest.artifacts,
    workload: { window_count: sortedWindows.length, attempt_count: attempts, success_count: successes, failure_count: attempts - successes, failure_ratio: failureRatio, maximum_gap_seconds: workloadGap, ttft_p95_ms: ttftGrowth },
    nodes: nodeResults,
    failure_codes: uniqueFailures,
    raw_evidence_visibility: "restricted",
    runtime_endpoints_published: false,
    claim_gate: uniqueFailures.length ? "not_passed" : `${manifest.stage}_passed`
  };
  return Object.freeze({ ...body, receipt_fingerprint: digest(body) });
}

export { STAGES as SOAK_STAGES };
