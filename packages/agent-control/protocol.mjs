import { createHash, randomBytes } from "node:crypto";

const MESSAGE_TYPES = new Set(["register", "heartbeat", "prepare_policy", "apply_policy", "revoke_policy", "receipt"]);
const REQUIRED_PAYLOAD = Object.freeze({
  register: ["agent_version", "host_fingerprint", "capabilities", "observe_only"],
  heartbeat: ["sequence", "agent_time", "health", "active_policy_revision", "last_known_good_revision"],
  prepare_policy: ["policy_id", "policy_revision", "policy_fingerprint", "expires_at", "target_route", "previous_route"],
  apply_policy: ["policy_id", "policy_revision", "policy_fingerprint", "prepare_receipt_id"],
  revoke_policy: ["policy_id", "policy_revision", "reason", "restore_revision"],
  receipt: ["receipt_id", "status", "operation", "agent_time", "state_fingerprint"]
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

export function validateControlMessage(message, { now = Date.now(), maxAgeMs = 300_000, maxFutureSkewMs = 30_000 } = {}) {
  if (message?.protocol_version !== "1.0.0") throw new Error("protocol_version_unsupported");
  for (const field of ["message_id", "message_type", "agent_id", "sent_at", "nonce", "payload"]) {
    if (!(field in message)) throw new Error(`missing_${field}`);
  }
  if (!MESSAGE_TYPES.has(message.message_type)) throw new Error("message_type_invalid");
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(message.nonce)) throw new Error("nonce_invalid");
  const sentAt = Date.parse(message.sent_at);
  if (!Number.isFinite(sentAt)) throw new Error("sent_at_invalid");
  if (now - sentAt > maxAgeMs) throw new Error("message_stale");
  if (sentAt - now > maxFutureSkewMs) throw new Error("message_from_future");
  if (message.message_type === "receipt" && !message.correlation_id) throw new Error("receipt_correlation_missing");
  for (const field of REQUIRED_PAYLOAD[message.message_type]) {
    if (!(field in message.payload)) throw new Error(`payload_missing_${field}`);
  }
  if (["prepare_policy", "apply_policy"].includes(message.message_type) && !/^sha256:[a-f0-9]{64}$/.test(message.payload.policy_fingerprint)) throw new Error("policy_fingerprint_invalid");
  if (message.message_type === "receipt" && ["rejected", "failed"].includes(message.payload.status) && !message.payload.failure_code) throw new Error("receipt_failure_code_missing");
  return Object.freeze({ message: structuredClone(message), message_fingerprint: fingerprint(message) });
}

export function createReceipt(request, { status, state, failureCode = null, activePolicyRevision = null, now = new Date() }) {
  if (request.message_type === "receipt") throw new Error("receipt_cannot_acknowledge_receipt");
  const payload = {
    receipt_id: `receipt-${randomBytes(12).toString("hex")}`,
    status,
    operation: request.message_type,
    agent_time: now.toISOString(),
    state_fingerprint: fingerprint(state),
    active_policy_revision: activePolicyRevision
  };
  if (failureCode) payload.failure_code = failureCode;
  const receipt = {
    protocol_version: "1.0.0",
    message_id: `message-${randomBytes(12).toString("hex")}`,
    message_type: "receipt",
    agent_id: request.agent_id,
    sent_at: now.toISOString(),
    nonce: randomBytes(24).toString("base64url"),
    correlation_id: request.message_id,
    payload
  };
  return validateControlMessage(receipt, { now: now.getTime() }).message;
}

export class NonceReplayGuard {
  #seen = new Map();

  accept(message, now = Date.now(), ttlMs = 300_000) {
    for (const [nonce, expires] of this.#seen) if (expires <= now) this.#seen.delete(nonce);
    if (this.#seen.has(message.nonce)) throw new Error("nonce_replayed");
    this.#seen.set(message.nonce, now + ttlMs);
  }
}
