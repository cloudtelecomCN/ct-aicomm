import { randomUUID } from "node:crypto";
import { fingerprint } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateHash(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value ?? "")) fail(`${field}_invalid`, `${field} must be a SHA-256 fingerprint`);
}

function recordBody({ sequence, eventId, recordedAt, receipt, policy, environmentFingerprint, credentialClaims, previousHash }) {
  if (receipt?.message_type !== "receipt") fail("audit_receipt_invalid", "a control-protocol receipt is required");
  if (credentialClaims?.sub !== receipt.agent_id) fail("audit_agent_identity_mismatch", "credential and receipt Agent identities differ");
  if (!credentialClaims?.jti) fail("audit_credential_id_missing", "credential ID is required");
  validateHash(environmentFingerprint, "environment_fingerprint");
  validateHash(policy?.policy_fingerprint, "policy_fingerprint");
  if (receipt.payload.active_policy_revision !== policy.policy_revision) fail("audit_policy_revision_mismatch", "receipt and policy revisions differ");
  const timestamp = Date.parse(recordedAt);
  if (!Number.isFinite(timestamp)) fail("audit_time_invalid", "recorded_at must be an ISO timestamp");
  const agentTime = Date.parse(receipt.payload.agent_time);
  if (!Number.isFinite(agentTime) || Math.abs(timestamp - agentTime) > 300_000) fail("audit_agent_time_invalid", "Agent and recorder clocks differ by more than five minutes");
  return {
    schema_version: "1.0.0",
    sequence,
    event_id: eventId,
    recorded_at: new Date(timestamp).toISOString(),
    previous_hash: previousHash,
    agent: { agent_id: receipt.agent_id, credential_id: credentialClaims.jti, credential_audience: credentialClaims.aud },
    environment_fingerprint: environmentFingerprint,
    policy: {
      policy_id: policy.policy_id,
      policy_revision: policy.policy_revision,
      policy_fingerprint: policy.policy_fingerprint
    },
    receipt: {
      message_id: receipt.message_id,
      correlation_id: receipt.correlation_id,
      receipt_id: receipt.payload.receipt_id,
      status: receipt.payload.status,
      operation: receipt.payload.operation,
      agent_time: receipt.payload.agent_time,
      state_fingerprint: receipt.payload.state_fingerprint
    }
  };
}

export class ImmutableAuditLog {
  #records = [];

  append({ receipt, policy, environmentFingerprint, credentialClaims, recordedAt = new Date(), eventId = randomUUID() }) {
    const sequence = this.#records.length + 1;
    const previousHash = this.#records.at(-1)?.record_hash ?? null;
    const body = recordBody({ sequence, eventId, recordedAt, receipt, policy, environmentFingerprint, credentialClaims, previousHash });
    const record = deepFreeze({ ...body, record_hash: fingerprint(body) });
    this.#records.push(record);
    return record;
  }

  export() {
    const records = structuredClone(this.#records);
    return deepFreeze({ schema_version: "1.0.0", record_count: records.length, terminal_hash: records.at(-1)?.record_hash ?? null, records });
  }
}

export function verifyAuditExport(audit) {
  if (audit?.schema_version !== "1.0.0" || !Array.isArray(audit.records)) fail("audit_export_invalid", "audit export v1 is required");
  let previousHash = null;
  for (let index = 0; index < audit.records.length; index += 1) {
    const record = audit.records[index];
    if (record.sequence !== index + 1) fail("audit_sequence_broken", "audit sequence is not contiguous");
    if (record.previous_hash !== previousHash) fail("audit_chain_broken", "audit previous hash does not match");
    const { record_hash: recordHash, ...body } = record;
    if (fingerprint(body) !== recordHash) fail("audit_record_tampered", "audit record hash does not match");
    previousHash = recordHash;
  }
  if (audit.record_count !== audit.records.length) fail("audit_count_mismatch", "audit record count does not match");
  if (audit.terminal_hash !== previousHash) fail("audit_terminal_hash_mismatch", "audit terminal hash does not match");
  return Object.freeze({ valid: true, record_count: audit.records.length, terminal_hash: previousHash });
}
