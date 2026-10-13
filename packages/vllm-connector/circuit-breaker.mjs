const STATES = Object.freeze({ CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" });

function freezeAlert(alert) {
  return Object.freeze({ ...alert, details: Object.freeze({ ...alert.details }) });
}

export class ConnectorCircuitBreaker {
  #state = STATES.CLOSED;
  #failures = 0;
  #openedAt = null;
  #alerts = [];

  constructor({ instanceId, failureThreshold = 3, cooldownMs = 30_000, now = () => Date.now() }) {
    if (!instanceId) throw new Error("instanceId is required");
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1) throw new Error("failureThreshold must be a positive integer");
    if (!Number.isFinite(cooldownMs) || cooldownMs < 1) throw new Error("cooldownMs must be positive");
    this.instanceId = instanceId;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  #alert(type, details = {}) {
    const alert = freezeAlert({
      schema_version: "1.0.0",
      type,
      instance_id: this.instanceId,
      state: this.#state,
      route_action: "preserve_original_route",
      automatic_route_change_allowed: false,
      occurred_at_ms: this.now(),
      details
    });
    this.#alerts.push(alert);
    return alert;
  }

  beforeProbe() {
    const now = this.now();
    if (this.#state === STATES.OPEN && now - this.#openedAt >= this.cooldownMs) {
      this.#state = STATES.HALF_OPEN;
      return Object.freeze({ allowed: true, state: this.#state, probe_only: true });
    }
    if (this.#state === STATES.OPEN) return Object.freeze({ allowed: false, state: this.#state, probe_only: false, retry_after_ms: this.cooldownMs - (now - this.#openedAt) });
    return Object.freeze({ allowed: true, state: this.#state, probe_only: this.#state === STATES.HALF_OPEN });
  }

  recordSnapshot(snapshot) {
    if (!snapshot || snapshot.instance !== this.instanceId) throw new Error("snapshot instance mismatch");
    if (snapshot.health !== "ready" || snapshot.missing_required_metrics?.length) {
      return this.recordFailure("metrics_degraded", { missing_required_metrics: snapshot.missing_required_metrics ?? [] });
    }
    return this.recordSuccess();
  }

  recordFailure(reason, details = {}) {
    this.#failures += 1;
    const shouldOpen = this.#state === STATES.HALF_OPEN || this.#failures >= this.failureThreshold;
    if (shouldOpen) {
      this.#state = STATES.OPEN;
      this.#openedAt = this.now();
      this.#alert("connector_circuit_opened", { reason, consecutive_failures: this.#failures, ...details });
    } else {
      this.#alert("connector_degraded", { reason, consecutive_failures: this.#failures, ...details });
    }
    return this.status();
  }

  recordSuccess() {
    const recovered = this.#state !== STATES.CLOSED || this.#failures > 0;
    this.#state = STATES.CLOSED;
    this.#failures = 0;
    this.#openedAt = null;
    if (recovered) this.#alert("connector_recovered", {});
    return this.status();
  }

  status() {
    return Object.freeze({
      instance_id: this.instanceId,
      state: this.#state,
      consecutive_failures: this.#failures,
      opened_at_ms: this.#openedAt,
      preserve_original_route: this.#state !== STATES.CLOSED || this.#failures > 0,
      automatic_route_change_allowed: this.#state === STATES.CLOSED && this.#failures === 0
    });
  }

  alerts() {
    return Object.freeze([...this.#alerts]);
  }
}

export { STATES as CONNECTOR_CIRCUIT_STATES };
