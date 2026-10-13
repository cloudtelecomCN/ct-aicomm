import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorCircuitBreaker } from "../packages/vllm-connector/circuit-breaker.mjs";

test("preserves the original route immediately on degraded evidence", () => {
  const breaker = new ConnectorCircuitBreaker({ instanceId: "vllm-a" });
  const status = breaker.recordSnapshot({ instance: "vllm-a", health: "degraded", missing_required_metrics: ["vllm:num_requests_waiting"] });
  assert.equal(status.state, "closed");
  assert.equal(status.preserve_original_route, true);
  assert.equal(status.automatic_route_change_allowed, false);
  assert.equal(breaker.alerts()[0].type, "connector_degraded");
  assert.deepEqual(breaker.alerts()[0].details.missing_required_metrics, ["vllm:num_requests_waiting"]);
});

test("opens after threshold and allows only a half-open probe after cooldown", () => {
  let now = 1_000;
  const breaker = new ConnectorCircuitBreaker({ instanceId: "vllm-a", failureThreshold: 2, cooldownMs: 500, now: () => now });
  breaker.recordFailure("fetch_failed");
  breaker.recordFailure("fetch_failed");
  assert.equal(breaker.status().state, "open");
  assert.equal(breaker.beforeProbe().allowed, false);
  now += 500;
  assert.deepEqual(breaker.beforeProbe(), { allowed: true, state: "half_open", probe_only: true });
  breaker.recordSuccess();
  assert.equal(breaker.status().state, "closed");
  assert.equal(breaker.status().automatic_route_change_allowed, true);
  assert.equal(breaker.alerts().at(-1).type, "connector_recovered");
});

test("reopens immediately when a half-open probe fails", () => {
  let now = 0;
  const breaker = new ConnectorCircuitBreaker({ instanceId: "vllm-a", failureThreshold: 1, cooldownMs: 100, now: () => now });
  breaker.recordFailure("fetch_failed");
  now = 100;
  breaker.beforeProbe();
  breaker.recordFailure("probe_failed");
  assert.equal(breaker.status().state, "open");
  assert.equal(breaker.alerts().at(-1).details.reason, "probe_failed");
});

test("rejects metrics from a different instance", () => {
  const breaker = new ConnectorCircuitBreaker({ instanceId: "vllm-a" });
  assert.throws(() => breaker.recordSnapshot({ instance: "vllm-b", health: "ready", missing_required_metrics: [] }), /instance mismatch/);
});
