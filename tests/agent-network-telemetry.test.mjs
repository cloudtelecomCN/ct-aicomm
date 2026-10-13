import assert from "node:assert/strict";
import test from "node:test";
import { NetworkTelemetryReporter, normalizeNetworkTelemetry, routeIdentity } from "../packages/agent-control/network-telemetry.mjs";

const route = {
  source: { ipv4: "10.10.0.10", port: 8000 },
  effective_target: { ipv4: "10.20.0.12", port: 8000 },
  policy_revision: 8
};

function sample(overrides = {}) {
  return {
    schema_version: "1.0.0",
    agent_id: "agent-01",
    socket_cookie: "8732",
    observed_at: "2026-10-13T08:05:00Z",
    route,
    rtt_us: 1450,
    retransmits_delta: 0,
    connection_errors_delta: 0,
    ...overrides
  };
}

test("reports RTT, retransmits, connection errors, and a stable route identity", () => {
  const reporter = new NetworkTelemetryReporter();
  const first = reporter.record(sample());
  reporter.record(sample({ observed_at: "2026-10-13T08:05:01Z", rtt_us: null, retransmits_delta: 2, connection_errors_delta: 1 }));
  assert.equal(first.route_id, routeIdentity(route));
  assert.deepEqual(reporter.report().routes[0], {
    route_id: first.route_id,
    route,
    samples: 2,
    latest_rtt_us: 1450,
    retransmits: 2,
    connection_errors: 1,
    last_observed_at: "2026-10-13T08:05:01.000Z"
  });
});

test("rejects empty, invented, negative, and mismatched telemetry", () => {
  assert.throws(() => normalizeNetworkTelemetry(sample({ rtt_us: null, retransmits_delta: null, connection_errors_delta: null })), (error) => error.code === "telemetry_empty");
  assert.throws(() => normalizeNetworkTelemetry(sample({ retransmits_delta: -1 })), (error) => error.code === "telemetry_retransmits_delta_invalid");
  assert.throws(() => normalizeNetworkTelemetry(sample({ route_id: "route-wrong" })), (error) => error.code === "telemetry_route_id_mismatch");
});
