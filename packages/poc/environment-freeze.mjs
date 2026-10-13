import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLACEHOLDER = /^(unknown|unset|todo|tbd|example|latest|main|master|demo)$/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function locked(value, field) {
  if (typeof value !== "string" || !value.trim() || PLACEHOLDER.test(value.trim())) fail("environment_not_frozen", `${field} must contain a pinned value`);
}

function hash(value, field) {
  if (!HASH.test(value ?? "")) fail("environment_hash_invalid", `${field} must be a lowercase SHA-256 digest`);
}

export function validateEnvironmentFreeze(input) {
  if (!input || input.schema_version !== "1.0.0") fail("environment_schema_invalid", "schema_version must be 1.0.0");
  if (input.evidence_origin !== "measured" && input.evidence_origin !== "synthetic") fail("environment_origin_invalid", "evidence_origin must be measured or synthetic");
  if (input.status !== "frozen") fail("environment_not_frozen", "status must be frozen");
  for (const field of ["freeze_id", "frozen_at", "experiment_window_start", "experiment_window_end"]) locked(input[field], field);
  if (!(Date.parse(input.experiment_window_start) < Date.parse(input.experiment_window_end))) fail("environment_window_invalid", "experiment window must be ordered");

  const requiredObjects = ["model", "compute", "software", "network", "prompt_dataset", "load_profile", "artifacts"];
  for (const field of requiredObjects) if (!input[field] || typeof input[field] !== "object") fail("environment_field_missing", `${field} is required`);
  for (const [field, value] of Object.entries({
    "model.identifier": input.model.identifier,
    "model.revision": input.model.revision,
    "compute.accelerator_model": input.compute.accelerator_model,
    "software.kernel": input.software.kernel,
    "software.driver": input.software.driver,
    "software.runtime": input.software.runtime,
    "software.vllm": input.software.vllm,
    "network.topology": input.network.topology,
    "network.baseline_route": input.network.baseline_route,
    "network.candidate_route": input.network.candidate_route,
    "prompt_dataset.id": input.prompt_dataset.id,
    "load_profile.id": input.load_profile.id
  })) locked(value, field);
  if (!Number.isInteger(input.compute.accelerator_count) || input.compute.accelerator_count < 1) fail("environment_compute_invalid", "accelerator_count must be positive");
  if (!Array.isArray(input.load_profile.concurrency) || !input.load_profile.concurrency.length || input.load_profile.concurrency.some((value) => !Number.isInteger(value) || value < 1)) fail("environment_load_invalid", "concurrency must contain positive integers");
  for (const [field, value] of Object.entries({
    "model.artifact_sha256": input.model.artifact_sha256,
    "prompt_dataset.sha256": input.prompt_dataset.sha256,
    "load_profile.sha256": input.load_profile.sha256,
    "artifacts.collector_sha256": input.artifacts.collector_sha256,
    "artifacts.agent_sha256": input.artifacts.agent_sha256,
    "artifacts.orchestrator_sha256": input.artifacts.orchestrator_sha256
  })) hash(value, field);
  if (input.approval?.state !== "approved" || !input.approval?.approved_by || !input.approval?.approved_at) fail("environment_approval_missing", "an explicit environment approval is required");
  return true;
}

export function freezeEnvironment(input) {
  validateEnvironmentFreeze(input);
  const manifest = stable(structuredClone(input));
  const environment_fingerprint = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return Object.freeze({ manifest: Object.freeze(manifest), environment_fingerprint: `sha256:${environment_fingerprint}` });
}
