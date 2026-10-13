import { fingerprint } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateConfirmed(entry) {
  if (!Number.isSafeInteger(entry?.policy_revision) || entry.policy_revision < 1) fail("rollback_revision_invalid", "policy revision must be positive");
  if (!/^sha256:[a-f0-9]{64}$/.test(entry.policy_fingerprint ?? "")) fail("rollback_policy_fingerprint_invalid", "policy fingerprint is invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(entry.state_fingerprint ?? "")) fail("rollback_state_fingerprint_invalid", "state fingerprint is invalid");
  if (!entry.receipt_id || entry.receipt_status !== "applied") fail("rollback_receipt_unconfirmed", "an applied execution receipt is required");
  if (!entry.route_state || fingerprint(entry.route_state) !== entry.state_fingerprint) fail("rollback_state_mismatch", "route state does not match its fingerprint");
  return deepFreeze(structuredClone(entry));
}

export class RollbackStack {
  #confirmed = [];
  #retired = [];
  #execute;

  constructor({ execute }) {
    if (typeof execute !== "function") fail("rollback_execute_required", "a rollback execution callback is required");
    this.#execute = execute;
  }

  confirmApplied(entry) {
    const confirmed = validateConfirmed(entry);
    const active = this.#confirmed.at(-1);
    if (active && confirmed.policy_revision <= active.policy_revision) fail("rollback_revision_not_monotonic", "confirmed revisions must increase");
    this.#confirmed.push(confirmed);
    return confirmed;
  }

  rollback({ expectedActiveRevision, reason, occurredAt = new Date() }) {
    const active = this.#confirmed.at(-1);
    const previous = this.#confirmed.at(-2);
    if (!active) fail("rollback_active_missing", "there is no active confirmed policy");
    if (active.policy_revision !== expectedActiveRevision) fail("rollback_active_revision_mismatch", "active revision changed before rollback");
    if (!previous) fail("rollback_previous_missing", "there is no previous confirmed policy");
    if (typeof reason !== "string" || reason.trim().length < 3) fail("rollback_reason_invalid", "rollback reason is required");
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) fail("rollback_time_invalid", "rollback time is invalid");

    const executionResult = this.#execute(structuredClone(previous.route_state));
    this.#confirmed.pop();
    this.#retired.push(active);
    const event = {
      event_type: "policy_rolled_back",
      occurred_at: occurredAt.toISOString(),
      reason,
      from_revision: active.policy_revision,
      from_policy_fingerprint: active.policy_fingerprint,
      to_revision: previous.policy_revision,
      to_policy_fingerprint: previous.policy_fingerprint,
      restored_state_fingerprint: previous.state_fingerprint,
      source_receipt_id: previous.receipt_id,
      execution_result: executionResult
    };
    return deepFreeze({ ...event, rollback_fingerprint: fingerprint(event) });
  }

  snapshot() {
    return deepFreeze({ active: structuredClone(this.#confirmed.at(-1) ?? null), depth: this.#confirmed.length, retired_revisions: this.#retired.map(({ policy_revision }) => policy_revision) });
  }
}
