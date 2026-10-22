#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSoakManifest } from "../packages/qa/soak-gate.mjs";
import { validateSoakLoadProfile, workloadFromSoakLoadProfile } from "../packages/qa/soak-load-profile.mjs";
import { freezeEnvironment } from "../packages/poc/environment-freeze.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_MINIMUM_FREE_BYTES = 10 * 1024 * 1024 * 1024;
const MAXIMUM_READINESS_LEAD_SECONDS = 60 * 60;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function values(argv, name) {
  return argv.filter((entry) => entry.startsWith(`${name}=`)).map((entry) => entry.slice(name.length + 1));
}

function value(argv, name, fallback = "") {
  return values(argv, name).at(-1) ?? fallback;
}

function required(argv, name) {
  const result = value(argv, name);
  if (!result) fail("soak_readiness_argument_missing", `${name} is required`);
  return result;
}

function aliasValue(entry, option) {
  const separator = entry.indexOf("=");
  if (separator < 1 || separator === entry.length - 1) fail("soak_readiness_argument_invalid", `${option} must use alias=value`);
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}

function exactAliasMap(entries, aliases, option) {
  const pairs = entries.map((entry) => aliasValue(entry, option));
  const map = new Map(pairs);
  if (map.size !== pairs.length || map.size !== aliases.length || aliases.some((alias) => !map.has(alias))) {
    fail("soak_readiness_alias_mismatch", `${option} aliases must exactly match the manifest`);
  }
  return map;
}

async function sha256File(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function endpointFingerprint(address) {
  return `sha256:${createHash("sha256").update(address).digest("hex")}`;
}

function nonNegativeFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function timestamp(value, field) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail("soak_readiness_timestamp_invalid", `${field} must be an ISO timestamp`);
  return parsed;
}

function checkFreshness(observedAt, nowMs, maximumAgeSeconds, field) {
  const ageSeconds = (nowMs - timestamp(observedAt, field)) / 1000;
  if (ageSeconds < -5 || ageSeconds > maximumAgeSeconds) fail("soak_readiness_observation_stale", `${field} is outside the readiness freshness window`);
  return ageSeconds;
}

function checkNodeObservation(observation, alias, manifest, nowMs) {
  if (observation?.schema_version !== "1.0.0" || observation?.task !== "CT-581" || observation?.data_origin !== "measured") fail("soak_readiness_node_invalid", `node observation is invalid for ${alias}`);
  if (observation.node_alias !== alias || observation.manifest_fingerprint !== manifest.manifest_fingerprint) fail("soak_readiness_node_binding_invalid", `node observation is not bound to ${alias}`);
  const observationAgeSeconds = checkFreshness(observation.observed_at, nowMs, manifest.thresholds.maximum_observation_gap_seconds, `${alias} observation`);
  const agent = observation.services?.agent;
  const vllm = observation.services?.vllm;
  for (const [serviceName, service] of [["Agent", agent], ["vLLM", vllm]]) {
    if (service?.active_state !== "active" || service?.sub_state !== "running" || !Number.isSafeInteger(service?.main_pid) || service.main_pid < 1 || service.restart_count !== 0) {
      fail("soak_readiness_service_invalid", `${serviceName} service is not launch-ready on ${alias}`);
    }
  }
  if (observation.processes?.agent?.pid !== agent.main_pid || !nonNegativeFinite(observation.processes?.agent?.rss_kib) || observation.processes?.vllm?.pid !== vllm.main_pid || !nonNegativeFinite(observation.processes?.vllm?.rss_kib)) {
    fail("soak_readiness_process_invalid", `process evidence is incomplete on ${alias}`);
  }
  const heartbeat = observation.agent_heartbeat;
  if (heartbeat?.status !== "running" || heartbeat?.pid !== agent.main_pid || !Number.isSafeInteger(heartbeat?.sequence) || heartbeat.sequence < 1 || !nonNegativeFinite(heartbeat?.uptime_seconds)) {
    fail("soak_readiness_heartbeat_invalid", `Agent heartbeat is invalid on ${alias}`);
  }
  const heartbeatAgeSeconds = checkFreshness(heartbeat.observed_at, nowMs, manifest.thresholds.maximum_observation_gap_seconds, `${alias} Agent heartbeat`);
  if (!nonNegativeFinite(observation.gpu?.memory_used_mib) || typeof observation.boot_id !== "string" || !observation.boot_id) fail("soak_readiness_resource_invalid", `GPU or boot evidence is missing on ${alias}`);
  if (observation.artifacts?.agent_sha256 !== manifest.artifacts.agent_sha256 || observation.artifacts?.bpf_sha256 !== manifest.artifacts.bpf_sha256 || observation.artifacts?.monitor_sha256 !== manifest.artifacts.monitor_sha256) {
    fail("soak_readiness_artifact_drift", `runtime artifact drift detected on ${alias}`);
  }
  return Object.freeze({
    node_alias: alias,
    boot_id: observation.boot_id,
    agent_pid: agent.main_pid,
    vllm_pid: vllm.main_pid,
    agent_rss_kib: observation.processes.agent.rss_kib,
    vllm_rss_kib: observation.processes.vllm.rss_kib,
    gpu_memory_used_mib: observation.gpu.memory_used_mib,
    observation_age_seconds: observationAgeSeconds,
    heartbeat_age_seconds: heartbeatAgeSeconds,
  });
}

async function probeEndpoint(alias, address, model, apiKey, fetchImpl) {
  let parsed;
  try {
    parsed = new URL(address);
  } catch {
    fail("soak_readiness_endpoint_invalid", `runtime endpoint is invalid for ${alias}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) fail("soak_readiness_endpoint_invalid", `runtime endpoint is invalid for ${alias}`);
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  let response;
  try {
    response = await fetchImpl(new URL("/v1/models", parsed), { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch {
    fail("soak_readiness_endpoint_unreachable", `model discovery failed for ${alias}`);
  }
  if (!response.ok) fail("soak_readiness_endpoint_unhealthy", `model discovery returned a non-success status for ${alias}`);
  let body;
  try {
    body = await response.json();
  } catch {
    fail("soak_readiness_endpoint_response_invalid", `model discovery returned invalid JSON for ${alias}`);
  }
  const modelIds = Array.isArray(body?.data) ? body.data.map((entry) => entry?.id).filter((entry) => typeof entry === "string") : [];
  if (!modelIds.includes(model)) fail("soak_readiness_model_missing", `frozen model is unavailable on ${alias}`);
  return Object.freeze({ endpoint_alias: alias, endpoint_fingerprint: endpointFingerprint(address), model_available: true });
}

export async function checkSoakReadiness({
  manifestPath,
  environmentPath,
  loadProfilePath,
  promptsPath,
  agentPath,
  bpfPath,
  collectorPath,
  runnerPath,
  monitorPath,
  endpoints,
  nodeObservationPaths,
  outputRoot,
  minimumFreeBytes = DEFAULT_MINIMUM_FREE_BYTES,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  statfsImpl = statfs,
  apiKey = process.env.VLLM_API_KEY,
}) {
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  validateSoakManifest(manifest);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) fail("soak_readiness_now_invalid", "readiness time is invalid");
  const startedAt = timestamp(manifest.started_at, "manifest started_at");
  const leadSeconds = (startedAt - nowMs) / 1000;
  if (leadSeconds < 0 || leadSeconds > MAXIMUM_READINESS_LEAD_SECONDS) fail("soak_readiness_window_invalid", "readiness must run during the hour before the stage starts");

  const environment = JSON.parse(await readFile(resolve(environmentPath), "utf8"));
  const frozenEnvironment = freezeEnvironment(environment);
  if (frozenEnvironment.environment_fingerprint !== manifest.environment_fingerprint || environment.model?.identifier !== manifest.model) fail("soak_readiness_environment_mismatch", "environment does not match the soak manifest");
  if (startedAt < timestamp(environment.experiment_window_start, "environment experiment_window_start") || timestamp(manifest.planned_finish_at, "manifest planned_finish_at") > timestamp(environment.experiment_window_end, "environment experiment_window_end")) {
    fail("soak_readiness_environment_window_invalid", "soak stage is outside the frozen experiment window");
  }

  const loadProfileBytes = await readFile(resolve(loadProfilePath));
  const loadProfile = JSON.parse(loadProfileBytes.toString("utf8"));
  validateSoakLoadProfile(loadProfile, manifest.stage);
  const loadProfileSha256 = createHash("sha256").update(loadProfileBytes).digest("hex");
  if (loadProfileSha256 !== environment.load_profile?.sha256 || loadProfile.id !== environment.load_profile?.id || JSON.stringify(loadProfile.concurrency) !== JSON.stringify(environment.load_profile?.concurrency)) {
    fail("soak_readiness_profile_mismatch", "load profile does not match the frozen environment");
  }
  if (JSON.stringify(workloadFromSoakLoadProfile(loadProfile, manifest.stage)) !== JSON.stringify(manifest.workload)) fail("soak_readiness_workload_mismatch", "manifest workload does not match the frozen load profile");

  const actualArtifacts = {
    agent_sha256: await sha256File(resolve(agentPath)),
    bpf_sha256: await sha256File(resolve(bpfPath)),
    prompt_dataset_sha256: await sha256File(resolve(promptsPath)),
    collector_sha256: await sha256File(resolve(collectorPath)),
    runner_sha256: await sha256File(resolve(runnerPath)),
    monitor_sha256: await sha256File(resolve(monitorPath)),
  };
  for (const [name, digest] of Object.entries(actualArtifacts)) {
    if (digest !== manifest.artifacts[name]) fail("soak_readiness_artifact_mismatch", `${name} does not match the soak manifest`);
  }

  if (!(endpoints instanceof Map) || endpoints.size !== manifest.endpoint_aliases.length || manifest.endpoint_aliases.some((alias) => !endpoints.has(alias))) fail("soak_readiness_endpoint_alias_mismatch", "runtime endpoint aliases must exactly match the manifest");
  const endpointChecks = [];
  for (const alias of manifest.endpoint_aliases) endpointChecks.push(await probeEndpoint(alias, endpoints.get(alias), manifest.model, apiKey, fetchImpl));

  if (!(nodeObservationPaths instanceof Map) || nodeObservationPaths.size !== manifest.node_aliases.length || manifest.node_aliases.some((alias) => !nodeObservationPaths.has(alias))) fail("soak_readiness_node_alias_mismatch", "node observation aliases must exactly match the manifest");
  const nodeChecks = [];
  for (const alias of manifest.node_aliases) {
    const observation = JSON.parse(await readFile(resolve(nodeObservationPaths.get(alias)), "utf8"));
    nodeChecks.push(checkNodeObservation(observation, alias, manifest, nowMs));
  }

  if (!Number.isSafeInteger(minimumFreeBytes) || minimumFreeBytes < 1) fail("soak_readiness_disk_policy_invalid", "minimum free bytes must be a positive integer");
  const filesystem = await statfsImpl(resolve(outputRoot), { bigint: true });
  const availableBytesBigInt = filesystem.bavail * filesystem.bsize;
  if (availableBytesBigInt < BigInt(minimumFreeBytes)) fail("soak_readiness_disk_insufficient", "output filesystem does not meet the free-space gate");
  const availableBytes = Number(availableBytesBigInt);

  const body = {
    schema_version: "1.0.0",
    task: "CT-581",
    stage: manifest.stage,
    status: "ready",
    checked_at: new Date(nowMs).toISOString(),
    starts_in_seconds: leadSeconds,
    manifest_fingerprint: manifest.manifest_fingerprint,
    environment_fingerprint: manifest.environment_fingerprint,
    source_commit: manifest.source_commit,
    load_profile: { id: loadProfile.id, sha256: `sha256:${loadProfileSha256}` },
    workload: manifest.workload,
    endpoints: endpointChecks,
    nodes: nodeChecks,
    output_filesystem: { available_bytes: availableBytes, minimum_required_bytes: minimumFreeBytes },
    evidence_boundary: { runtime_endpoints_disclosed: false, credentials_disclosed: false, raw_observations_visibility: "restricted" },
  };
  return Object.freeze({ ...body, readiness_fingerprint: `sha256:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}` });
}

export async function writeSoakReadiness(outputPath, result) {
  const resolvedOutputPath = resolve(outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true, mode: 0o700 });
  await writeFile(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return resolvedOutputPath;
}

async function main() {
  const argv = process.argv.slice(2);
  const manifestPath = resolve(required(argv, "--manifest"));
  const outputPath = resolve(required(argv, "--output"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateSoakManifest(manifest);
  const endpoints = exactAliasMap(values(argv, "--endpoint"), manifest.endpoint_aliases, "--endpoint");
  const nodeObservationPaths = new Map([...exactAliasMap(values(argv, "--node-observation"), manifest.node_aliases, "--node-observation")].map(([alias, path]) => [alias, resolve(path)]));
  const result = await checkSoakReadiness({
    manifestPath,
    environmentPath: resolve(required(argv, "--environment")),
    loadProfilePath: resolve(required(argv, "--load-profile")),
    promptsPath: resolve(required(argv, "--prompts")),
    agentPath: resolve(required(argv, "--agent")),
    bpfPath: resolve(required(argv, "--bpf")),
    collectorPath: resolve(required(argv, "--collector")),
    runnerPath: resolve(required(argv, "--runner")),
    monitorPath: resolve(required(argv, "--monitor")),
    endpoints,
    nodeObservationPaths,
    outputRoot: resolve(required(argv, "--output-root")),
    minimumFreeBytes: Number.parseInt(value(argv, "--minimum-free-bytes", String(DEFAULT_MINIMUM_FREE_BYTES)), 10),
  });
  await writeSoakReadiness(outputPath, result);
  process.stdout.write(`${JSON.stringify({ output: outputPath, status: result.status, readiness_fingerprint: result.readiness_fingerprint })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "blocked", code: error.code ?? "soak_readiness_failed", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
