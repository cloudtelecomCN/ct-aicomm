import { fingerprint } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function endpointKey(endpoint) {
  return `${endpoint.ipv4}:${endpoint.port}`;
}

function validateEndpoint(endpoint, field) {
  if (!endpoint || typeof endpoint !== "object") fail(`${field}_invalid`, `${field} is required`);
  const octets = String(endpoint.ipv4 ?? "").split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    fail(`${field}_ipv4_invalid`, `${field} must contain an IPv4 address`);
  }
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) {
    fail(`${field}_port_invalid`, `${field} must contain a valid port`);
  }
  return Object.freeze({ ipv4: octets.join("."), port: endpoint.port });
}

export function validateRedirectPolicy(policy) {
  if (policy?.schema_version !== "1.0.0") fail("redirect_schema_invalid", "redirect policy v1 is required");
  if (!Array.isArray(policy.allowed_targets) || policy.allowed_targets.length < 2) {
    fail("redirect_allowlist_too_small", "at least two allowed targets are required");
  }
  const targets = policy.allowed_targets.map((entry) => {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(entry?.id ?? "")) fail("target_id_invalid", "target id is invalid");
    return Object.freeze({ id: entry.id, endpoint: validateEndpoint(entry.endpoint, "target") });
  });
  if (new Set(targets.map(({ id }) => id)).size !== targets.length) fail("target_id_duplicate", "target ids must be unique");
  if (new Set(targets.map(({ endpoint }) => endpointKey(endpoint))).size !== targets.length) {
    fail("target_endpoint_duplicate", "target endpoints must be unique");
  }
  const source = validateEndpoint(policy.source, "source");
  return Object.freeze({ schema_version: "1.0.0", source, allowed_targets: Object.freeze(targets) });
}

export function redirectMapEntry(policy, targetId, revision) {
  const validated = validateRedirectPolicy(policy);
  if (!Number.isSafeInteger(revision) || revision < 1) fail("revision_invalid", "revision must be a positive integer");
  const target = validated.allowed_targets.find(({ id }) => id === targetId);
  if (!target) fail("target_not_allowlisted", `target is not allowlisted: ${targetId}`);
  return Object.freeze({
    key: validated.source,
    value: Object.freeze({ ...target.endpoint, revision }),
    target_id: target.id
  });
}

export class ControlledRedirector {
  #policy;
  #activeTargetId;
  #revision;
  #audit = [];

  constructor(policy, { activeTargetId, revision = 0 } = {}) {
    this.#policy = validateRedirectPolicy(policy);
    if (!this.#policy.allowed_targets.some(({ id }) => id === activeTargetId)) fail("active_target_not_allowlisted", "active target must be allowlisted");
    if (!Number.isSafeInteger(revision) || revision < 0) fail("revision_invalid", "revision must be a non-negative integer");
    this.#activeTargetId = activeTargetId;
    this.#revision = revision;
  }

  switchTo(targetId, { revision, policyId, occurredAt = new Date() }) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(policyId ?? "")) fail("policy_id_invalid", "policy id is invalid");
    if (!Number.isSafeInteger(revision) || revision <= this.#revision) fail("revision_not_monotonic", "revision must increase");
    const oldTarget = this.#policy.allowed_targets.find(({ id }) => id === this.#activeTargetId);
    const newTarget = this.#policy.allowed_targets.find(({ id }) => id === targetId);
    if (!newTarget) fail("target_not_allowlisted", `target is not allowlisted: ${targetId}`);
    if (newTarget.id === oldTarget.id) fail("target_unchanged", "new target must differ from the active target");
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) fail("occurred_at_invalid", "occurredAt must be a valid Date");

    const entry = {
      event_type: "redirect_applied",
      policy_id: policyId,
      revision,
      occurred_at: occurredAt.toISOString(),
      source: this.#policy.source,
      old_target: oldTarget,
      new_target: newTarget
    };
    const record = Object.freeze({ ...entry, audit_fingerprint: fingerprint(entry) });
    this.#activeTargetId = newTarget.id;
    this.#revision = revision;
    this.#audit.push(record);
    return Object.freeze({ map_entry: redirectMapEntry(this.#policy, targetId, revision), audit_record: record });
  }

  snapshot() {
    return Object.freeze({ active_target_id: this.#activeTargetId, revision: this.#revision, audit_records: Object.freeze([...this.#audit]) });
  }
}
