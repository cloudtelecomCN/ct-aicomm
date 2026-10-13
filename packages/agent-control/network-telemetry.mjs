import { fingerprint } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function endpointKey(endpoint) {
  if (!endpoint || typeof endpoint.ipv4 !== "string" || !Number.isInteger(endpoint.port)) fail("telemetry_endpoint_invalid", "endpoint is invalid");
  return `${endpoint.ipv4}:${endpoint.port}`;
}

export function routeIdentity({ source, effective_target: target, policy_revision: revision }) {
  if (!Number.isSafeInteger(revision) || revision < 0) fail("telemetry_revision_invalid", "policy revision must be non-negative");
  const descriptor = { source: endpointKey(source), effective_target: endpointKey(target), policy_revision: revision };
  return `route-${fingerprint(descriptor).slice("sha256:".length, "sha256:".length + 24)}`;
}

export function normalizeNetworkTelemetry(sample) {
  if (sample?.schema_version !== "1.0.0") fail("telemetry_schema_invalid", "network telemetry v1 is required");
  const observedAt = Date.parse(sample.observed_at);
  if (!Number.isFinite(observedAt)) fail("telemetry_time_invalid", "observed_at must be an ISO timestamp");
  const routeId = routeIdentity(sample.route);
  if (sample.route_id !== undefined && sample.route_id !== routeId) fail("telemetry_route_id_mismatch", "route id does not match route evidence");
  for (const field of ["rtt_us", "retransmits_delta", "connection_errors_delta"]) {
    if (sample[field] !== null && (!Number.isSafeInteger(sample[field]) || sample[field] < 0)) fail(`telemetry_${field}_invalid`, `${field} must be null or non-negative`);
  }
  if ([sample.rtt_us, sample.retransmits_delta, sample.connection_errors_delta].every((value) => value === null)) {
    fail("telemetry_empty", "at least one measured metric is required");
  }
  return Object.freeze({
    schema_version: "1.0.0",
    agent_id: String(sample.agent_id),
    socket_cookie: String(sample.socket_cookie),
    observed_at: new Date(observedAt).toISOString(),
    route_id: routeId,
    route: Object.freeze(structuredClone(sample.route)),
    rtt_us: sample.rtt_us,
    retransmits_delta: sample.retransmits_delta,
    connection_errors_delta: sample.connection_errors_delta,
    source: sample.source ?? "kernel"
  });
}

export class NetworkTelemetryReporter {
  #routes = new Map();

  record(sample) {
    const event = normalizeNetworkTelemetry(sample);
    const current = this.#routes.get(event.route_id) ?? {
      route_id: event.route_id,
      route: event.route,
      samples: 0,
      latest_rtt_us: null,
      retransmits: 0,
      connection_errors: 0,
      last_observed_at: null
    };
    current.samples += 1;
    if (event.rtt_us !== null) current.latest_rtt_us = event.rtt_us;
    if (event.retransmits_delta !== null) current.retransmits += event.retransmits_delta;
    if (event.connection_errors_delta !== null) current.connection_errors += event.connection_errors_delta;
    current.last_observed_at = event.observed_at;
    this.#routes.set(event.route_id, current);
    return event;
  }

  report() {
    const routes = [...this.#routes.values()].sort((a, b) => a.route_id.localeCompare(b.route_id)).map((route) => Object.freeze(structuredClone(route)));
    return Object.freeze({ schema_version: "1.0.0", routes: Object.freeze(routes) });
  }
}
