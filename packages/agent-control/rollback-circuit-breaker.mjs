import { fingerprint } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function rate(value, field) {
  if (typeof value !== "number" || value < 0 || value > 1) fail(`${field}_invalid`, `${field} must be between zero and one`);
  return value;
}

export class RollbackCircuitBreaker {
  #rollbackStack;
  #config;
  #samples = [];
  #healthFailures = 0;
  #state = "closed";
  #trip = null;
  #lastObservedAt = 0;

  constructor({ rollbackStack, windowSize = 20, minimumSamples = 5, timeoutRate = 0.2, errorRate = 0.1, consecutiveHealthFailures = 3 }) {
    if (!rollbackStack || typeof rollbackStack.rollback !== "function") fail("circuit_rollback_stack_required", "rollback stack is required");
    if (!Number.isSafeInteger(windowSize) || windowSize < 2) fail("circuit_window_invalid", "window size must be at least two");
    if (!Number.isSafeInteger(minimumSamples) || minimumSamples < 1 || minimumSamples > windowSize) fail("circuit_minimum_samples_invalid", "minimum samples must fit the window");
    if (!Number.isSafeInteger(consecutiveHealthFailures) || consecutiveHealthFailures < 1) fail("circuit_health_threshold_invalid", "health threshold must be positive");
    this.#rollbackStack = rollbackStack;
    this.#config = Object.freeze({ windowSize, minimumSamples, timeoutRate: rate(timeoutRate, "timeout_rate"), errorRate: rate(errorRate, "error_rate"), consecutiveHealthFailures });
  }

  observe({ outcome, healthy, observedAt = new Date(), activeRevision }) {
    if (this.#state === "open") return Object.freeze({ state: "open", tripped: false, trip: this.#trip });
    if (!["success", "error", "timeout"].includes(outcome)) fail("circuit_outcome_invalid", "outcome is invalid");
    if (typeof healthy !== "boolean") fail("circuit_health_invalid", "healthy must be boolean");
    if (!Number.isSafeInteger(activeRevision) || activeRevision < 1) fail("circuit_revision_invalid", "active revision must be positive");
    const timestamp = observedAt instanceof Date ? observedAt.getTime() : NaN;
    if (!Number.isFinite(timestamp)) fail("circuit_time_invalid", "observation time is invalid");
    if (timestamp < this.#lastObservedAt) fail("circuit_time_not_monotonic", "observations must be time ordered");
    this.#lastObservedAt = timestamp;

    this.#samples.push(outcome);
    if (this.#samples.length > this.#config.windowSize) this.#samples.shift();
    this.#healthFailures = healthy ? 0 : this.#healthFailures + 1;
    const timeoutCount = this.#samples.filter((value) => value === "timeout").length;
    const errorCount = this.#samples.filter((value) => value === "error").length;
    const enoughSamples = this.#samples.length >= this.#config.minimumSamples;
    const timeoutRate = timeoutCount / this.#samples.length;
    const errorRate = errorCount / this.#samples.length;
    let reason = null;
    if (this.#healthFailures >= this.#config.consecutiveHealthFailures) reason = "consecutive_health_failures";
    else if (enoughSamples && timeoutRate >= this.#config.timeoutRate) reason = "timeout_rate_exceeded";
    else if (enoughSamples && errorRate >= this.#config.errorRate) reason = "error_rate_exceeded";

    if (!reason) return Object.freeze({ state: "closed", tripped: false, sample_count: this.#samples.length, timeout_rate: timeoutRate, error_rate: errorRate, health_failures: this.#healthFailures });
    const rollback = this.#rollbackStack.rollback({ expectedActiveRevision: activeRevision, reason, occurredAt: observedAt });
    const trip = {
      event_type: "rollback_circuit_opened",
      occurred_at: observedAt.toISOString(),
      reason,
      sample_count: this.#samples.length,
      timeout_rate: timeoutRate,
      error_rate: errorRate,
      health_failures: this.#healthFailures,
      rollback
    };
    this.#state = "open";
    this.#trip = Object.freeze({ ...trip, event_fingerprint: fingerprint(trip) });
    return Object.freeze({ state: "open", tripped: true, trip: this.#trip });
  }

  snapshot() {
    return Object.freeze({ state: this.#state, sample_count: this.#samples.length, health_failures: this.#healthFailures, trip: this.#trip });
  }
}
