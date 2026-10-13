import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { RollbackStack } from "../packages/agent-control/rollback-stack.mjs";
import { RollbackCircuitBreaker } from "../packages/agent-control/rollback-circuit-breaker.mjs";

function confirmed(revision, target) {
  const routeState = { target, policy_revision: revision };
  return { policy_id: "policy-east", policy_revision: revision, policy_fingerprint: fingerprint({ revision, target }), route_state: routeState, state_fingerprint: fingerprint(routeState), receipt_id: `receipt-${revision}`, receipt_status: "applied" };
}
function fixture(config = {}) {
  const restored = [];
  const stack = new RollbackStack({ execute: (state) => { restored.push(state); return { restored: true }; } });
  stack.confirmApplied(confirmed(7, "inference-a"));
  stack.confirmApplied(confirmed(8, "inference-b"));
  return { restored, stack, breaker: new RollbackCircuitBreaker({ rollbackStack: stack, windowSize: 5, minimumSamples: 5, timeoutRate: 0.4, errorRate: 0.4, consecutiveHealthFailures: 3, ...config }) };
}

test("automatically rolls back once when timeout rate reaches the threshold", () => {
  const { breaker, restored, stack } = fixture();
  const outcomes = ["success", "timeout", "success", "timeout"];
  for (let index = 0; index < outcomes.length; index += 1) {
    assert.equal(breaker.observe({ outcome: outcomes[index], healthy: true, activeRevision: 8, observedAt: new Date(1000 + index) }).tripped, false);
  }
  const result = breaker.observe({ outcome: "success", healthy: true, activeRevision: 8, observedAt: new Date(1004) });
  assert.equal(result.tripped, true);
  assert.equal(result.trip.reason, "timeout_rate_exceeded");
  assert.equal(result.trip.rollback.to_revision, 7);
  assert.deepEqual(restored, [confirmed(7, "inference-a").route_state]);
  assert.equal(stack.snapshot().active.policy_revision, 7);
  assert.equal(breaker.observe({ outcome: "timeout", healthy: false, activeRevision: 7, observedAt: new Date(1005) }).tripped, false);
  assert.equal(restored.length, 1);
});

test("health failures can trip before the rate window and invalid evidence is rejected", () => {
  const { breaker, restored } = fixture();
  breaker.observe({ outcome: "success", healthy: false, activeRevision: 8, observedAt: new Date(2000) });
  breaker.observe({ outcome: "success", healthy: false, activeRevision: 8, observedAt: new Date(2001) });
  const result = breaker.observe({ outcome: "success", healthy: false, activeRevision: 8, observedAt: new Date(2002) });
  assert.equal(result.trip.reason, "consecutive_health_failures");
  assert.equal(restored.length, 1);
  const another = fixture().breaker;
  assert.throws(() => another.observe({ outcome: "invented", healthy: true, activeRevision: 8 }), (error) => error.code === "circuit_outcome_invalid");
});
