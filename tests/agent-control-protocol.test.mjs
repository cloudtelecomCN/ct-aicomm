import assert from "node:assert/strict";
import test from "node:test";
import { NonceReplayGuard, createReceipt, fingerprint, validateControlMessage } from "../packages/agent-control/protocol.mjs";

const now = new Date("2026-10-13T07:00:00Z");
function message(type, payload) {
  return { protocol_version: "1.0.0", message_id: `msg-${type}`, message_type: type, agent_id: "agent-01", sent_at: now.toISOString(), nonce: `${type.padEnd(22, "x")}`, payload };
}

const cases = {
  register: { agent_version: "0.1.0", host_fingerprint: `sha256:${"a".repeat(64)}`, capabilities: ["observe"], observe_only: true },
  heartbeat: { sequence: 1, agent_time: now.toISOString(), health: "healthy", active_policy_revision: null, last_known_good_revision: null },
  prepare_policy: { policy_id: "policy-a", policy_revision: 1, policy_fingerprint: `sha256:${"b".repeat(64)}`, expires_at: "2026-10-13T07:05:00Z", target_route: "route-b", previous_route: "route-a" },
  apply_policy: { policy_id: "policy-a", policy_revision: 1, policy_fingerprint: `sha256:${"b".repeat(64)}`, prepare_receipt_id: "receipt-prepare" },
  revoke_policy: { policy_id: "policy-a", policy_revision: 1, reason: "operator", restore_revision: null }
};

test("validates every command type and creates correlated receipts", () => {
  for (const [type, payload] of Object.entries(cases)) {
    const request = message(type, payload);
    const result = validateControlMessage(request, { now: now.getTime() });
    assert.match(result.message_fingerprint, /^sha256:[a-f0-9]{64}$/);
    const receipt = createReceipt(request, { status: "accepted", state: { mode: "observe_only" }, now });
    assert.equal(receipt.correlation_id, request.message_id);
    assert.equal(receipt.payload.operation, type);
  }
});

test("canonical fingerprints ignore object key order", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
});

test("rejects stale, future, malformed, and replayed messages", () => {
  assert.throws(() => validateControlMessage({ ...message("heartbeat", cases.heartbeat), sent_at: "2026-10-13T06:00:00Z" }, { now: now.getTime() }), /message_stale/);
  assert.throws(() => validateControlMessage({ ...message("heartbeat", cases.heartbeat), sent_at: "2026-10-13T08:00:00Z" }, { now: now.getTime() }), /message_from_future/);
  assert.throws(() => validateControlMessage({ ...message("apply_policy", cases.apply_policy), payload: { ...cases.apply_policy, policy_fingerprint: "bad" } }, { now: now.getTime() }), /policy_fingerprint_invalid/);
  const guard = new NonceReplayGuard();
  const heartbeat = message("heartbeat", cases.heartbeat);
  guard.accept(heartbeat, now.getTime());
  assert.throws(() => guard.accept(heartbeat, now.getTime()), /nonce_replayed/);
});

test("requires failure codes on rejected receipts", () => {
  const receipt = { ...message("receipt", { receipt_id: "r1", status: "rejected", operation: "prepare_policy", agent_time: now.toISOString(), state_fingerprint: `sha256:${"c".repeat(64)}` }), correlation_id: "msg-prepare" };
  assert.throws(() => validateControlMessage(receipt, { now: now.getTime() }), /receipt_failure_code_missing/);
});
