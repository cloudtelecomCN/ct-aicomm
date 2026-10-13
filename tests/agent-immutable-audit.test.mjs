import assert from "node:assert/strict";
import test from "node:test";
import { ImmutableAuditLog, verifyAuditExport } from "../packages/agent-control/immutable-audit.mjs";

const environmentFingerprint = `sha256:${"e".repeat(64)}`;
const policyFingerprint = `sha256:${"p".repeat(64)}`.replaceAll("p", "a");
function receipt(revision, id) {
  return {
    protocol_version: "1.0.0",
    message_id: `message-${id}`,
    message_type: "receipt",
    agent_id: "agent-01",
    sent_at: "2026-10-13T11:00:00Z",
    nonce: "receipt-nonce-xxxxxxxx",
    correlation_id: `apply-${id}`,
    payload: { receipt_id: id, status: "applied", operation: "apply_policy", agent_time: "2026-10-13T11:00:00Z", state_fingerprint: `sha256:${"b".repeat(64)}`, active_policy_revision: revision }
  };
}

test("binds policy, Agent, environment, receipt, and timestamp in an immutable chain", () => {
  const log = new ImmutableAuditLog();
  const context = { environmentFingerprint, credentialClaims: { sub: "agent-01", jti: "credential-1", aud: "orchestrator" }, recordedAt: new Date("2026-10-13T11:00:01Z") };
  const first = log.append({ ...context, receipt: receipt(8, "receipt-8"), policy: { policy_id: "policy-east", policy_revision: 8, policy_fingerprint: policyFingerprint }, eventId: "event-8" });
  const second = log.append({ ...context, receipt: receipt(9, "receipt-9"), policy: { policy_id: "policy-east", policy_revision: 9, policy_fingerprint: policyFingerprint }, eventId: "event-9" });
  assert.equal(second.previous_hash, first.record_hash);
  assert.equal(first.agent.agent_id, "agent-01");
  assert.equal(first.environment_fingerprint, environmentFingerprint);
  assert.deepEqual(verifyAuditExport(log.export()), { valid: true, record_count: 2, terminal_hash: second.record_hash });
  assert.throws(() => { first.policy.policy_revision = 10; }, TypeError);
});

test("detects modification, deletion, reorder, and identity mismatch", () => {
  const log = new ImmutableAuditLog();
  const context = { environmentFingerprint, credentialClaims: { sub: "agent-01", jti: "credential-1", aud: "orchestrator" }, recordedAt: new Date("2026-10-13T11:00:01Z") };
  log.append({ ...context, receipt: receipt(8, "receipt-8"), policy: { policy_id: "policy-east", policy_revision: 8, policy_fingerprint: policyFingerprint }, eventId: "event-8" });
  log.append({ ...context, receipt: receipt(9, "receipt-9"), policy: { policy_id: "policy-east", policy_revision: 9, policy_fingerprint: policyFingerprint }, eventId: "event-9" });
  const modified = structuredClone(log.export());
  modified.records[0].receipt.status = "failed";
  assert.throws(() => verifyAuditExport(modified), (error) => error.code === "audit_record_tampered");
  const deleted = structuredClone(log.export());
  deleted.records.shift();
  assert.throws(() => verifyAuditExport(deleted), (error) => error.code === "audit_sequence_broken");
  assert.throws(() => log.append({ ...context, credentialClaims: { ...context.credentialClaims, sub: "agent-02" }, receipt: receipt(10, "receipt-10"), policy: { policy_id: "policy-east", policy_revision: 10, policy_fingerprint: policyFingerprint } }), (error) => error.code === "audit_agent_identity_mismatch");
});
