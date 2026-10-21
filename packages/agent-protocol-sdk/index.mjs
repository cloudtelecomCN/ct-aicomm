import { randomBytes } from "node:crypto";
import { createReceipt, fingerprint, validateControlMessage } from "../agent-control/protocol.mjs";

export const AGENT_PROTOCOL_VERSION = "1.0.0";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CAPABILITIES = new Set(["observe", "tc_classify", "tc_redirect", "cgroup_connect", "route_restore"]);
const REVOKE_REASONS = new Set(["operator", "health_threshold", "lease_expired", "kill_switch", "superseded"]);
const SUCCESS_STATUS = Object.freeze({ register: "accepted", heartbeat: "accepted", prepare_policy: "accepted", apply_policy: "applied", revoke_policy: "revoked" });
const PAYLOAD_FIELDS = Object.freeze({
  register: ["agent_version", "host_fingerprint", "artifact_fingerprint", "capabilities", "observe_only"],
  heartbeat: ["sequence", "agent_time", "health", "active_policy_revision", "last_known_good_revision"],
  prepare_policy: ["policy_id", "policy_revision", "policy_fingerprint", "expires_at", "target_route", "previous_route"],
  apply_policy: ["policy_id", "policy_revision", "policy_fingerprint", "prepare_receipt_id"],
  revoke_policy: ["policy_id", "policy_revision", "reason", "restore_revision"],
  receipt: ["receipt_id", "status", "operation", "agent_time", "state_fingerprint", "failure_code", "active_policy_revision"]
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function knownFields(value, allowed, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name}_invalid`, `${name} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`${name}_field_unknown`, `${name} contains unsupported field: ${unknown.sort()[0]}`);
  return value;
}

function id(value, name) {
  if (typeof value !== "string" || !ID.test(value)) fail(`${name}_invalid`, `${name} must be a stable protocol identifier`);
  return value;
}

function sha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${name}_invalid`, `${name} must be a sha256 fingerprint`);
  return value;
}

function revision(value, name, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name}_invalid`, `${name} must be a positive safe integer${nullable ? " or null" : ""}`);
  return value;
}

function timestamp(value, name) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(`${name}_invalid`, `${name} must be an ISO-8601 timestamp`);
  return value;
}

function normalizeNow(value) {
  const now = value === undefined ? new Date() : value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(now.getTime())) fail("message_time_invalid", "message time must be valid");
  return now;
}

function assertClosedMessage(message, name) {
  const envelopeFields = ["protocol_version", "message_id", "message_type", "agent_id", "sent_at", "nonce", "payload"];
  if (message.message_type === "receipt") envelopeFields.push("correlation_id");
  knownFields(message, envelopeFields, name);
  knownFields(message.payload, PAYLOAD_FIELDS[message.message_type] ?? [], `${name}_payload`);
}

function envelope(messageType, agentId, payload, options = {}) {
  knownFields(options, ["messageId", "nonce", "now"], "message_options");
  const now = normalizeNow(options.now);
  const message = {
    protocol_version: AGENT_PROTOCOL_VERSION,
    message_id: id(options.messageId ?? `message-${randomBytes(12).toString("hex")}`, "message_id"),
    message_type: messageType,
    agent_id: id(agentId, "agent_id"),
    sent_at: now.toISOString(),
    nonce: options.nonce ?? randomBytes(24).toString("base64url"),
    payload
  };
  return validateControlMessage(message, { now: now.getTime() }).message;
}

export function createRegistrationMessage(input, options = {}) {
  knownFields(input, ["agentId", "agentVersion", "hostFingerprint", "artifactFingerprint", "capabilities", "observeOnly"], "registration_input");
  if (typeof input.agentVersion !== "string" || !SEMVER.test(input.agentVersion)) fail("agent_version_invalid", "agentVersion must use SemVer");
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) fail("capabilities_invalid", "at least one capability is required");
  const capabilities = input.capabilities.map((capability) => {
    if (!CAPABILITIES.has(capability)) fail("capability_unsupported", `unsupported capability: ${capability}`);
    return capability;
  });
  if (new Set(capabilities).size !== capabilities.length) fail("capability_duplicate", "capabilities must be unique");
  if (typeof input.observeOnly !== "boolean") fail("observe_only_invalid", "observeOnly must be a boolean");
  const payload = {
    agent_version: input.agentVersion,
    host_fingerprint: sha256(input.hostFingerprint, "host_fingerprint"),
    capabilities: capabilities.sort(),
    observe_only: input.observeOnly
  };
  if (input.artifactFingerprint !== undefined) payload.artifact_fingerprint = sha256(input.artifactFingerprint, "artifact_fingerprint");
  return envelope("register", input.agentId, payload, options);
}

export function createPreparePolicyMessage(input, options = {}) {
  knownFields(input, ["agentId", "policyId", "policyRevision", "policyFingerprint", "expiresAt", "targetRoute", "previousRoute"], "prepare_input");
  knownFields(options, ["messageId", "nonce", "now"], "message_options");
  const now = normalizeNow(options.now);
  const expiresAt = timestamp(input.expiresAt, "expires_at");
  if (Date.parse(expiresAt) <= now.getTime()) fail("prepare_expired", "expiresAt must be later than the message time");
  return envelope("prepare_policy", input.agentId, {
    policy_id: id(input.policyId, "policy_id"),
    policy_revision: revision(input.policyRevision, "policy_revision"),
    policy_fingerprint: sha256(input.policyFingerprint, "policy_fingerprint"),
    expires_at: expiresAt,
    target_route: id(input.targetRoute, "target_route"),
    previous_route: id(input.previousRoute, "previous_route")
  }, { ...options, now });
}

export function createApplyPolicyMessage(input, options = {}) {
  knownFields(input, ["agentId", "policyId", "policyRevision", "policyFingerprint", "prepareReceiptId"], "apply_input");
  return envelope("apply_policy", input.agentId, {
    policy_id: id(input.policyId, "policy_id"),
    policy_revision: revision(input.policyRevision, "policy_revision"),
    policy_fingerprint: sha256(input.policyFingerprint, "policy_fingerprint"),
    prepare_receipt_id: id(input.prepareReceiptId, "prepare_receipt_id")
  }, options);
}

export function createRevokePolicyMessage(input, options = {}) {
  knownFields(input, ["agentId", "policyId", "policyRevision", "reason", "restoreRevision"], "revoke_input");
  if (!REVOKE_REASONS.has(input.reason)) fail("revoke_reason_invalid", "reason is not supported by protocol v1");
  return envelope("revoke_policy", input.agentId, {
    policy_id: id(input.policyId, "policy_id"),
    policy_revision: revision(input.policyRevision, "policy_revision"),
    reason: input.reason,
    restore_revision: revision(input.restoreRevision, "restore_revision", { nullable: true })
  }, options);
}

function validateReceiptStatus(operation, status, failureCode) {
  if (!(operation in SUCCESS_STATUS)) fail("receipt_operation_invalid", "receipt operation is not supported");
  const allowed = new Set([SUCCESS_STATUS[operation], "rejected", "failed"]);
  if (!allowed.has(status)) fail("receipt_status_invalid", `status ${status} is invalid for ${operation}`);
  if (["rejected", "failed"].includes(status) && (typeof failureCode !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(failureCode))) {
    fail("receipt_failure_code_invalid", "rejected and failed receipts require a machine-readable failure code");
  }
  if (!["rejected", "failed"].includes(status) && failureCode !== undefined && failureCode !== null) {
    fail("receipt_failure_code_unexpected", "successful receipts must not carry a failure code");
  }
}

export function createAgentReceipt(request, input) {
  knownFields(input, ["status", "state", "failureCode", "activePolicyRevision", "now"], "receipt_input");
  const now = normalizeNow(input.now);
  const validatedRequest = validateControlMessage(request, { now: now.getTime() }).message;
  assertClosedMessage(validatedRequest, "request_message");
  if (validatedRequest.message_type === "receipt") fail("receipt_cannot_acknowledge_receipt", "a receipt cannot acknowledge another receipt");
  if (!input.state || typeof input.state !== "object" || Array.isArray(input.state)) fail("receipt_state_invalid", "state must be an object");
  validateReceiptStatus(validatedRequest.message_type, input.status, input.failureCode);
  const activePolicyRevision = input.activePolicyRevision === undefined || input.activePolicyRevision === null
    ? null
    : revision(input.activePolicyRevision, "active_policy_revision");
  return createReceipt(validatedRequest, {
    status: input.status,
    state: input.state,
    failureCode: input.failureCode ?? null,
    activePolicyRevision,
    now
  });
}

export function verifyAgentReceipt(receipt, { request, now = new Date() } = {}) {
  if (!request) fail("receipt_request_required", "the triggering request is required");
  const verifiedAt = normalizeNow(now);
  const validatedRequest = validateControlMessage(request, { now: verifiedAt.getTime() }).message;
  const result = validateControlMessage(receipt, { now: verifiedAt.getTime() });
  const validatedReceipt = result.message;
  assertClosedMessage(validatedRequest, "request_message");
  assertClosedMessage(validatedReceipt, "receipt_message");
  if (validatedReceipt.message_type !== "receipt") fail("receipt_type_invalid", "message must be a receipt");
  if (validatedReceipt.correlation_id !== validatedRequest.message_id) fail("receipt_correlation_mismatch", "receipt does not correlate to the request");
  if (validatedReceipt.agent_id !== validatedRequest.agent_id) fail("receipt_agent_mismatch", "receipt belongs to another Agent");
  if (validatedReceipt.payload.operation !== validatedRequest.message_type) fail("receipt_operation_mismatch", "receipt operation does not match the request");
  validateReceiptStatus(validatedReceipt.payload.operation, validatedReceipt.payload.status, validatedReceipt.payload.failure_code);
  return Object.freeze({ receipt: validatedReceipt, receipt_fingerprint: result.message_fingerprint, request_fingerprint: fingerprint(validatedRequest) });
}
