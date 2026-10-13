import { createReceipt, fingerprint, validateControlMessage } from "./protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertCommand(request, expected, now) {
  validateControlMessage(request, { now: now.getTime() });
  if (request.message_type !== expected) fail("operation_invalid", `expected ${expected}`);
}

export class PolicyTransactionCoordinator {
  #activeRevision;
  #prepared = null;
  #execute;

  constructor({ activeRevision = 0, execute }) {
    if (!Number.isSafeInteger(activeRevision) || activeRevision < 0) fail("active_revision_invalid", "active revision must be non-negative");
    if (typeof execute !== "function") fail("execute_required", "an execution callback is required");
    this.#activeRevision = activeRevision;
    this.#execute = execute;
  }

  prepare(request, policy, { now = new Date() } = {}) {
    assertCommand(request, "prepare_policy", now);
    const payload = request.payload;
    if (!Number.isSafeInteger(payload.policy_revision) || payload.policy_revision <= this.#activeRevision) fail("policy_revision_stale", "policy revision must exceed the active revision");
    if (payload.policy_fingerprint !== fingerprint(policy)) fail("policy_fingerprint_mismatch", "policy content does not match the declared fingerprint");
    if (Date.parse(payload.expires_at) <= now.getTime()) fail("policy_expired", "prepared policy has expired");
    if (policy.target_route !== payload.target_route || policy.previous_route !== payload.previous_route) fail("policy_route_mismatch", "policy routes do not match the command");

    const state = { phase: "prepared", policy_id: payload.policy_id, policy_revision: payload.policy_revision, policy_fingerprint: payload.policy_fingerprint };
    const receipt = createReceipt(request, { status: "accepted", state, activePolicyRevision: this.#activeRevision, now });
    this.#prepared = Object.freeze({
      policy: structuredClone(policy),
      policy_id: payload.policy_id,
      policy_revision: payload.policy_revision,
      policy_fingerprint: payload.policy_fingerprint,
      expires_at: payload.expires_at,
      receipt_id: receipt.payload.receipt_id
    });
    return receipt;
  }

  apply(request, { now = new Date() } = {}) {
    assertCommand(request, "apply_policy", now);
    if (!this.#prepared) fail("policy_not_prepared", "policy must be prepared before apply");
    const payload = request.payload;
    if (Date.parse(this.#prepared.expires_at) <= now.getTime()) {
      this.#prepared = null;
      fail("prepared_policy_expired", "prepared policy has expired");
    }
    for (const field of ["policy_id", "policy_revision", "policy_fingerprint"]) {
      if (payload[field] !== this.#prepared[field]) fail("prepared_policy_mismatch", `${field} does not match the prepared policy`);
    }
    if (payload.prepare_receipt_id !== this.#prepared.receipt_id) fail("prepare_receipt_mismatch", "apply is not bound to the prepare receipt");

    const prepared = this.#prepared;
    const result = this.#execute(structuredClone(prepared.policy));
    this.#activeRevision = prepared.policy_revision;
    this.#prepared = null;
    return createReceipt(request, {
      status: "applied",
      state: { phase: "active", policy_id: prepared.policy_id, policy_revision: prepared.policy_revision, execution_result: result },
      activePolicyRevision: this.#activeRevision,
      now
    });
  }

  snapshot() {
    return Object.freeze({ active_revision: this.#activeRevision, prepared: this.#prepared && Object.freeze(structuredClone(this.#prepared)) });
  }
}
