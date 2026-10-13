import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { RollbackStack } from "../packages/agent-control/rollback-stack.mjs";

function confirmed(revision, target) {
  const routeState = { source: "service:8000", target, policy_revision: revision };
  return { policy_id: "policy-east", policy_revision: revision, policy_fingerprint: fingerprint({ revision, target }), route_state: routeState, state_fingerprint: fingerprint(routeState), receipt_id: `receipt-${revision}`, receipt_status: "applied" };
}

test("restores only the immediately previous confirmed route state", () => {
  const executions = [];
  const stack = new RollbackStack({ execute: (state) => { executions.push(state); return { restored: true }; } });
  stack.confirmApplied(confirmed(7, "inference-a"));
  stack.confirmApplied(confirmed(8, "inference-b"));
  const event = stack.rollback({ expectedActiveRevision: 8, reason: "health threshold exceeded", occurredAt: new Date("2026-10-13T12:00:00Z") });
  assert.equal(event.from_revision, 8);
  assert.equal(event.to_revision, 7);
  assert.match(event.rollback_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(executions, [confirmed(7, "inference-a").route_state]);
  assert.deepEqual(stack.snapshot(), { active: confirmed(7, "inference-a"), depth: 1, retired_revisions: [8] });
});

test("rejects unconfirmed, altered, stale, and non-previous rollback states", () => {
  const stack = new RollbackStack({ execute: () => assert.fail("must not execute") });
  assert.throws(() => stack.confirmApplied({ ...confirmed(7, "inference-a"), receipt_status: "accepted" }), (error) => error.code === "rollback_receipt_unconfirmed");
  assert.throws(() => stack.confirmApplied({ ...confirmed(7, "inference-a"), route_state: { altered: true } }), (error) => error.code === "rollback_state_mismatch");
  stack.confirmApplied(confirmed(7, "inference-a"));
  assert.throws(() => stack.rollback({ expectedActiveRevision: 7, reason: "operator request" }), (error) => error.code === "rollback_previous_missing");
  stack.confirmApplied(confirmed(8, "inference-b"));
  assert.throws(() => stack.rollback({ expectedActiveRevision: 9, reason: "operator request" }), (error) => error.code === "rollback_active_revision_mismatch");
  assert.throws(() => stack.confirmApplied(confirmed(6, "inference-old")), (error) => error.code === "rollback_revision_not_monotonic");
});
