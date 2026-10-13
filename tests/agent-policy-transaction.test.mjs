import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { PolicyTransactionCoordinator } from "../packages/agent-control/policy-transaction.mjs";

const now = new Date("2026-10-13T09:00:00Z");
const policy = { target_route: "inference-b", previous_route: "inference-a", map_entry: { revision: 8 } };
function command(type, payload, minute = 0) {
  const sentAt = new Date(now.getTime() + minute * 60_000);
  return { protocol_version: "1.0.0", message_id: `message-${type}-${minute}`, message_type: type, agent_id: "agent-01", sent_at: sentAt.toISOString(), nonce: `${type}-${minute}`.padEnd(22, "x"), payload };
}
function preparePayload(overrides = {}) {
  return { policy_id: "policy-east", policy_revision: 8, policy_fingerprint: fingerprint(policy), expires_at: "2026-10-13T09:05:00Z", target_route: "inference-b", previous_route: "inference-a", ...overrides };
}

test("executes only an applied command bound to the prepared policy", () => {
  const executions = [];
  const coordinator = new PolicyTransactionCoordinator({ activeRevision: 7, execute: (value) => { executions.push(value); return { changed: true }; } });
  const prepareReceipt = coordinator.prepare(command("prepare_policy", preparePayload()), policy, { now });
  assert.equal(executions.length, 0);
  const apply = command("apply_policy", { policy_id: "policy-east", policy_revision: 8, policy_fingerprint: fingerprint(policy), prepare_receipt_id: prepareReceipt.payload.receipt_id });
  const applyReceipt = coordinator.apply(apply, { now });
  assert.equal(applyReceipt.payload.status, "applied");
  assert.equal(applyReceipt.payload.active_policy_revision, 8);
  assert.deepEqual(executions, [policy]);
  assert.deepEqual(coordinator.snapshot(), { active_revision: 8, prepared: null });
});

test("rejects unprepared, mismatched, stale, and expired apply operations", () => {
  const coordinator = new PolicyTransactionCoordinator({ activeRevision: 7, execute: () => assert.fail("must not execute") });
  const apply = command("apply_policy", { policy_id: "policy-east", policy_revision: 8, policy_fingerprint: fingerprint(policy), prepare_receipt_id: "receipt-missing" });
  assert.throws(() => coordinator.apply(apply, { now }), (error) => error.code === "policy_not_prepared");
  const receipt = coordinator.prepare(command("prepare_policy", preparePayload()), policy, { now });
  assert.throws(() => coordinator.apply({ ...apply, payload: { ...apply.payload, policy_revision: 9, prepare_receipt_id: receipt.payload.receipt_id } }, { now }), (error) => error.code === "prepared_policy_mismatch");
  const freshExpiredApply = command("apply_policy", { ...apply.payload, prepare_receipt_id: receipt.payload.receipt_id }, 5);
  assert.throws(() => coordinator.apply(freshExpiredApply, { now: new Date("2026-10-13T09:06:00Z") }), (error) => error.code === "prepared_policy_expired");
  assert.throws(() => coordinator.prepare(command("prepare_policy", preparePayload({ policy_revision: 7 })), policy, { now }), (error) => error.code === "policy_revision_stale");
});
