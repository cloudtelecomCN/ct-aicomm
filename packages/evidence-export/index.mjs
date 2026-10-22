import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const EVIDENCE_EXPORT_AUTHORIZATION_VERSION = "1.0.0";

export const EVIDENCE_EXPORT_ERROR_CODES = Object.freeze({
  inputInvalid: "evidence_export_input_invalid",
  fieldUnknown: "evidence_export_field_unknown",
  fieldMissing: "evidence_export_field_missing",
  ledgerInvalid: "evidence_export_ledger_invalid",
  ledgerFingerprintMismatch: "evidence_export_ledger_fingerprint_mismatch",
  eventIdConflict: "evidence_export_event_id_conflict",
  grantInvalid: "evidence_export_grant_invalid",
  grantInactive: "evidence_export_grant_inactive",
  grantExpired: "evidence_export_grant_expired",
  grantNotYetValid: "evidence_export_grant_not_yet_valid",
  grantScopeInvalid: "evidence_export_grant_scope_invalid",
  authContextUnverified: "evidence_export_auth_context_unverified",
  tenantMismatch: "evidence_export_tenant_mismatch",
  recipientMismatch: "evidence_export_recipient_mismatch",
  purposeMismatch: "evidence_export_purpose_mismatch",
  resourceDenied: "evidence_export_resource_denied",
  fieldDenied: "evidence_export_field_denied",
  authorizationMissing: "evidence_export_authorization_missing",
  deliveryDuplicate: "evidence_export_delivery_duplicate",
  deliveryTimeInvalid: "evidence_export_delivery_time_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const JSON_POINTER = /^\/(?:[^~/]|~0|~1)+(?:\/(?:[^~/]|~0|~1)+)*$/;
const OBJECT_TYPES = new Set(["scope", "method", "run", "observation", "artifact", "evidence_version", "review", "policy_decision", "export_grant"]);
const POLICY_DENIAL_CODES = new Set([
  EVIDENCE_EXPORT_ERROR_CODES.grantInactive,
  EVIDENCE_EXPORT_ERROR_CODES.grantExpired,
  EVIDENCE_EXPORT_ERROR_CODES.grantNotYetValid,
  EVIDENCE_EXPORT_ERROR_CODES.grantScopeInvalid,
  EVIDENCE_EXPORT_ERROR_CODES.authContextUnverified,
  EVIDENCE_EXPORT_ERROR_CODES.tenantMismatch,
  EVIDENCE_EXPORT_ERROR_CODES.recipientMismatch,
  EVIDENCE_EXPORT_ERROR_CODES.purposeMismatch,
  EVIDENCE_EXPORT_ERROR_CODES.resourceDenied,
  EVIDENCE_EXPORT_ERROR_CODES.fieldDenied
]);
const DECISION_BODY_FIELDS = Object.freeze([
  "schema_version",
  "event_type",
  "event_id",
  "request_fingerprint",
  "tenant_id",
  "request_tenant_id",
  "occurred_at",
  "grant_ref",
  "grant_fingerprint",
  "principal",
  "auth_context_fingerprint",
  "auth_context_anchor_verified",
  "purpose",
  "resource_ref",
  "requested_field_scope",
  "denied_field_scope",
  "decision",
  "reason_codes",
  "authorization_expires_at",
  "download_performed",
  "principal_authentication_verified",
  "authorization_enforced_by_transport",
  "previous_event_fingerprint"
]);
const DELIVERY_BODY_FIELDS = Object.freeze([
  "schema_version",
  "event_type",
  "event_id",
  "request_fingerprint",
  "tenant_id",
  "occurred_at",
  "authorization_event_fingerprint",
  "grant_ref",
  "resource_ref",
  "recipient",
  "outcome",
  "bytes_sent",
  "content_fingerprint",
  "error_code",
  "transport_delivery_reported",
  "transport_attestation_verified",
  "previous_event_fingerprint"
]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label, code = EVIDENCE_EXPORT_ERROR_CODES.inputInvalid) {
  if (!isObject(value)) fail(code, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(EVIDENCE_EXPORT_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_EXPORT_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !HASH.test(value)) fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} must be a sha256 fingerprint`);
  return value;
}

function requireSemver(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} must be a strict semantic version`);
  return value;
}

function canonicalInstant(value, label) {
  if (typeof value !== "string") fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function normalizeReference(value, label, expectedType) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], [], label);
  if (!OBJECT_TYPES.has(value.object_type) || (expectedType && value.object_type !== expectedType)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label}.object_type is invalid`);
  }
  return {
    object_type: value.object_type,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`)
  };
}

function referenceKey(value) {
  return `${value.tenant_id}\u0000${value.object_type}\u0000${value.object_id}\u0000${value.version}`;
}

function normalizePrincipal(value, label) {
  exactObject(value, ["principal_id", "organization_id"], [], label);
  return {
    principal_id: requireId(value.principal_id, `${label}.principal_id`),
    organization_id: requireId(value.organization_id, `${label}.organization_id`)
  };
}

function normalizePointers(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} must contain 1-256 JSON Pointers`);
  }
  const normalized = value.map((pointer, index) => {
    if (typeof pointer !== "string" || !JSON_POINTER.test(pointer)) {
      fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label}[${index}] must be a non-root JSON Pointer`);
    }
    return pointer;
  }).sort();
  if (new Set(normalized).size !== normalized.length) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, `${label} contains duplicate pointers`);
  }
  return normalized;
}

function normalizeAuthorizationScope(value, label) {
  exactObject(value, ["visibility", "purpose", "recipients", "expires_at"], [], label);
  if (!["private", "shared", "public"].includes(value.visibility)) fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, `${label}.visibility is invalid`);
  if (typeof value.purpose !== "string" || value.purpose.length < 3 || value.purpose.length > 240) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, `${label}.purpose is invalid`);
  }
  if (!Array.isArray(value.recipients)
    || value.recipients.length > 64
    || value.recipients.some((recipient) => typeof recipient !== "string" || !ID.test(recipient))
    || new Set(value.recipients).size !== value.recipients.length) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, `${label}.recipients is invalid`);
  }
  if (value.expires_at !== null) canonicalInstant(value.expires_at, `${label}.expires_at`);
  return value;
}

function normalizeGrant(value) {
  const fields = [
    "schema_version",
    "object_type",
    "grant_id",
    "version",
    "tenant_id",
    "created_by",
    "created_at",
    "authorization_scope",
    "resource_refs",
    "recipient",
    "purpose",
    "field_scope",
    "expires_at",
    "watermark",
    "status"
  ];
  exactObject(value, fields, [], "command.grant", EVIDENCE_EXPORT_ERROR_CODES.grantInvalid);
  if (value.schema_version !== EVIDENCE_EXPORT_AUTHORIZATION_VERSION || value.object_type !== "export_grant") {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant must be an Evidence Core ExportGrant v1");
  }
  requireId(value.grant_id, "command.grant.grant_id");
  requireSemver(value.version, "command.grant.version");
  requireId(value.tenant_id, "command.grant.tenant_id");
  requireId(value.created_by, "command.grant.created_by");
  canonicalInstant(value.created_at, "command.grant.created_at");
  normalizeAuthorizationScope(value.authorization_scope, "command.grant.authorization_scope");
  if (!Array.isArray(value.resource_refs) || value.resource_refs.length < 1 || value.resource_refs.length > 128) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant.resource_refs is invalid");
  }
  const resourceRefs = value.resource_refs.map((reference, index) => normalizeReference(reference, `command.grant.resource_refs[${index}]`));
  if (new Set(resourceRefs.map(referenceKey)).size !== resourceRefs.length) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant.resource_refs contains duplicates");
  }
  normalizePrincipal(value.recipient, "command.grant.recipient");
  if (typeof value.purpose !== "string" || value.purpose.length < 3 || value.purpose.length > 500) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant.purpose is invalid");
  }
  normalizePointers(value.field_scope, "command.grant.field_scope");
  canonicalInstant(value.expires_at, "command.grant.expires_at");
  if (typeof value.watermark !== "string" || value.watermark.length < 3 || value.watermark.length > 240) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant.watermark is invalid");
  }
  if (!["active", "revoked", "expired"].includes(value.status)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.grantInvalid, "command.grant.status is invalid");
  }
  return value;
}

function grantReference(grant) {
  return {
    object_type: "export_grant",
    object_id: grant.grant_id,
    version: grant.version,
    tenant_id: grant.tenant_id
  };
}

function effectiveExpiry(grant) {
  const values = [grant.expires_at];
  if (grant.authorization_scope.expires_at !== null) values.push(grant.authorization_scope.expires_at);
  return values.sort()[0];
}

function fieldAllowed(pointer, allowedPointers) {
  return allowedPointers.some((allowed) => pointer === allowed || pointer.startsWith(`${allowed}/`));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function decisionRequestFingerprint(command, grantFingerprint) {
  return digestEvidenceBytes(canonicalizeEvidenceValue({
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    event_id: command.eventId,
    requested_at: command.requestedAt,
    request_tenant_id: command.requestTenantId,
    principal: command.principal,
    auth_context_fingerprint: command.authContextFingerprint,
    purpose: command.purpose,
    resource_ref: command.resourceRef,
    requested_field_scope: command.requestedFieldScope,
    grant_fingerprint: grantFingerprint
  }));
}

function decisionEventRequestFingerprint(event) {
  return decisionRequestFingerprint({
    eventId: event.event_id,
    requestedAt: event.occurred_at,
    requestTenantId: event.request_tenant_id,
    principal: event.principal,
    authContextFingerprint: event.auth_context_fingerprint,
    purpose: event.purpose,
    resourceRef: event.resource_ref,
    requestedFieldScope: event.requested_field_scope
  }, event.grant_fingerprint);
}

function deliveryRequestFingerprint(command) {
  return digestEvidenceBytes(canonicalizeEvidenceValue({
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    event_id: command.eventId,
    authorization_event_fingerprint: command.authorizationEventFingerprint,
    reported_at: command.reportedAt,
    outcome: command.outcome,
    bytes_sent: command.bytesSent,
    content_fingerprint: command.contentFingerprint,
    error_code: command.errorCode
  }));
}

function normalizeDecisionCommand(value) {
  exactObject(value, [
    "eventId",
    "requestedAt",
    "requestTenantId",
    "principalId",
    "organizationId",
    "authContextFingerprint",
    "purpose",
    "resourceRef",
    "requestedFieldScope",
    "grant"
  ], [], "command");
  const grant = normalizeGrant(value.grant);
  const command = {
    eventId: requireId(value.eventId, "command.eventId"),
    requestedAt: canonicalInstant(value.requestedAt, "command.requestedAt"),
    requestTenantId: requireId(value.requestTenantId, "command.requestTenantId"),
    principal: {
      principal_id: requireId(value.principalId, "command.principalId"),
      organization_id: requireId(value.organizationId, "command.organizationId")
    },
    authContextFingerprint: requireHash(value.authContextFingerprint, "command.authContextFingerprint"),
    purpose: value.purpose,
    resourceRef: normalizeReference(value.resourceRef, "command.resourceRef"),
    requestedFieldScope: normalizePointers(value.requestedFieldScope, "command.requestedFieldScope"),
    grant
  };
  if (typeof command.purpose !== "string" || command.purpose.length < 3 || command.purpose.length > 500) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, "command.purpose is invalid");
  }
  const grantFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(grant));
  return { ...command, grantFingerprint, requestFingerprint: decisionRequestFingerprint(command, grantFingerprint) };
}

function eventWithFingerprint(body) {
  return deepFreeze({ ...body, event_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(body)) });
}

function appendEvent(ledger, body) {
  const event = eventWithFingerprint({
    ...body,
    previous_event_fingerprint: ledger.events.at(-1)?.event_fingerprint ?? null
  });
  return { event, ledger: deepFreeze({ ...ledger, events: [...ledger.events, event] }) };
}

function eventBody(event, fields) {
  return Object.fromEntries(fields.map((field) => [field, event[field]]));
}

function assertCanonicalList(actual, normalized, label) {
  if (canonicalizeEvidenceValue(actual) !== canonicalizeEvidenceValue(normalized)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, `${label} is not canonically ordered`);
  }
}

function verifyDecisionEvent(event, ledger, expectedPrevious) {
  exactObject(event, [...DECISION_BODY_FIELDS, "event_fingerprint"], [], "ledger decision event", EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid);
  if (event.schema_version !== EVIDENCE_EXPORT_AUTHORIZATION_VERSION || event.event_type !== "export_authorization_decision") {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision event type is invalid");
  }
  requireId(event.event_id, "ledger decision event.event_id");
  requireHash(event.request_fingerprint, "ledger decision event.request_fingerprint");
  if (event.tenant_id !== ledger.tenant_id) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision tenant is invalid");
  requireId(event.request_tenant_id, "ledger decision event.request_tenant_id");
  canonicalInstant(event.occurred_at, "ledger decision event.occurred_at");
  normalizeReference(event.grant_ref, "ledger decision event.grant_ref", "export_grant");
  requireHash(event.grant_fingerprint, "ledger decision event.grant_fingerprint");
  normalizePrincipal(event.principal, "ledger decision event.principal");
  requireHash(event.auth_context_fingerprint, "ledger decision event.auth_context_fingerprint");
  if (typeof event.auth_context_anchor_verified !== "boolean") fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision auth context flag is invalid");
  if (typeof event.purpose !== "string" || event.purpose.length < 3 || event.purpose.length > 500) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision purpose is invalid");
  normalizeReference(event.resource_ref, "ledger decision event.resource_ref");
  assertCanonicalList(event.requested_field_scope, normalizePointers(event.requested_field_scope, "ledger decision event.requested_field_scope"), "ledger decision requested fields");
  if (!Array.isArray(event.denied_field_scope)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision denied fields are invalid");
  const denied = event.denied_field_scope.length === 0 ? [] : normalizePointers(event.denied_field_scope, "ledger decision event.denied_field_scope");
  assertCanonicalList(event.denied_field_scope, denied, "ledger decision denied fields");
  if (!Array.isArray(event.reason_codes)
    || event.reason_codes.some((code) => typeof code !== "string" || !POLICY_DENIAL_CODES.has(code))) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision reason codes are invalid");
  }
  assertCanonicalList(event.reason_codes, uniqueSorted(event.reason_codes), "ledger decision reason codes");
  if (!["allowed", "denied"].includes(event.decision)
    || (event.decision === "allowed" && event.reason_codes.length !== 0)
    || (event.decision === "denied" && event.reason_codes.length === 0)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision outcome is inconsistent");
  }
  if (event.request_fingerprint !== decisionEventRequestFingerprint(event)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger decision request fingerprint is invalid");
  }
  if (event.auth_context_anchor_verified === event.reason_codes.includes(EVIDENCE_EXPORT_ERROR_CODES.authContextUnverified)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision auth context reason is inconsistent");
  }
  if ((event.denied_field_scope.length > 0) !== event.reason_codes.includes(EVIDENCE_EXPORT_ERROR_CODES.fieldDenied)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision field reason is inconsistent");
  }
  if (event.denied_field_scope.some((pointer) => !event.requested_field_scope.includes(pointer))) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision denied fields were not requested");
  }
  canonicalInstant(event.authorization_expires_at, "ledger decision event.authorization_expires_at");
  if (event.download_performed !== false || event.principal_authentication_verified !== false || event.authorization_enforced_by_transport !== false) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger decision crosses the public engine trust boundary");
  }
  if (event.previous_event_fingerprint !== expectedPrevious) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger decision chain is broken");
  const expectedFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(eventBody(event, DECISION_BODY_FIELDS)));
  if (event.event_fingerprint !== expectedFingerprint) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger decision fingerprint is invalid");
}

function verifyDeliveryEvent(event, ledger, expectedPrevious, decisions, deliveredAuthorizations) {
  exactObject(event, [...DELIVERY_BODY_FIELDS, "event_fingerprint"], [], "ledger delivery event", EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid);
  if (event.schema_version !== EVIDENCE_EXPORT_AUTHORIZATION_VERSION || event.event_type !== "export_delivery_record") {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery event type is invalid");
  }
  requireId(event.event_id, "ledger delivery event.event_id");
  requireHash(event.request_fingerprint, "ledger delivery event.request_fingerprint");
  if (event.tenant_id !== ledger.tenant_id) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery tenant is invalid");
  canonicalInstant(event.occurred_at, "ledger delivery event.occurred_at");
  requireHash(event.authorization_event_fingerprint, "ledger delivery event.authorization_event_fingerprint");
  normalizeReference(event.grant_ref, "ledger delivery event.grant_ref", "export_grant");
  normalizeReference(event.resource_ref, "ledger delivery event.resource_ref");
  normalizePrincipal(event.recipient, "ledger delivery event.recipient");
  const authorization = decisions.get(event.authorization_event_fingerprint);
  if (!authorization || authorization.decision !== "allowed") fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery does not reference an allowed decision");
  if (deliveredAuthorizations.has(event.authorization_event_fingerprint)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger contains duplicate delivery records");
  deliveredAuthorizations.add(event.authorization_event_fingerprint);
  if (Date.parse(event.occurred_at) < Date.parse(authorization.occurred_at)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery predates authorization");
  if (referenceKey(event.grant_ref) !== referenceKey(authorization.grant_ref)
    || referenceKey(event.resource_ref) !== referenceKey(authorization.resource_ref)
    || canonicalizeEvidenceValue(event.recipient) !== canonicalizeEvidenceValue(authorization.principal)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery context differs from authorization");
  }
  if (!["delivered", "failed"].includes(event.outcome) || !Number.isInteger(event.bytes_sent) || event.bytes_sent < 0) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery outcome is invalid");
  }
  if (event.outcome === "delivered") {
    if (event.bytes_sent < 1 || event.content_fingerprint === null || event.error_code !== null) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "delivered event fields are inconsistent");
    requireHash(event.content_fingerprint, "ledger delivery event.content_fingerprint");
    if (Date.parse(event.occurred_at) >= Date.parse(authorization.authorization_expires_at)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "delivered event occurred after authorization expiry");
  } else if (event.bytes_sent !== 0 || event.content_fingerprint !== null || typeof event.error_code !== "string" || !ID.test(event.error_code)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "failed delivery event fields are inconsistent");
  }
  if (event.transport_delivery_reported !== true || event.transport_attestation_verified !== false) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger delivery trust boundary is invalid");
  }
  const expectedRequestFingerprint = deliveryRequestFingerprint({
    eventId: event.event_id,
    authorizationEventFingerprint: event.authorization_event_fingerprint,
    reportedAt: event.occurred_at,
    outcome: event.outcome,
    bytesSent: event.bytes_sent,
    contentFingerprint: event.content_fingerprint,
    errorCode: event.error_code
  });
  if (event.request_fingerprint !== expectedRequestFingerprint) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger delivery request fingerprint is invalid");
  }
  if (event.previous_event_fingerprint !== expectedPrevious) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger delivery chain is broken");
  const expectedFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(eventBody(event, DELIVERY_BODY_FIELDS)));
  if (event.event_fingerprint !== expectedFingerprint) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch, "ledger delivery fingerprint is invalid");
}

export function createEvidenceExportAuditLedger(input) {
  exactObject(input, ["tenantId"], [], "input");
  return deepFreeze({
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    tenant_id: requireId(input.tenantId, "input.tenantId"),
    events: []
  });
}

export function verifyEvidenceExportAuditLedger(ledger) {
  exactObject(ledger, ["schema_version", "tenant_id", "events"], [], "ledger", EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid);
  if (ledger.schema_version !== EVIDENCE_EXPORT_AUTHORIZATION_VERSION) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger.schema_version is invalid");
  requireId(ledger.tenant_id, "ledger.tenant_id");
  if (!Array.isArray(ledger.events)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger.events must be an array");
  let previous = null;
  const ids = new Set();
  const decisions = new Map();
  const deliveredAuthorizations = new Set();
  let allowed = 0;
  let denied = 0;
  let delivered = 0;
  let failed = 0;
  for (const event of ledger.events) {
    if (!isObject(event) || ids.has(event.event_id)) fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger event IDs must be unique");
    ids.add(event.event_id);
    if (event.event_type === "export_authorization_decision") {
      verifyDecisionEvent(event, ledger, previous);
      decisions.set(event.event_fingerprint, event);
      if (event.decision === "allowed") allowed += 1;
      else denied += 1;
    } else if (event.event_type === "export_delivery_record") {
      verifyDeliveryEvent(event, ledger, previous, decisions, deliveredAuthorizations);
      if (event.outcome === "delivered") delivered += 1;
      else failed += 1;
    } else {
      fail(EVIDENCE_EXPORT_ERROR_CODES.ledgerInvalid, "ledger event type is unknown");
    }
    previous = event.event_fingerprint;
  }
  return deepFreeze({
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    tenant_id: ledger.tenant_id,
    event_count: ledger.events.length,
    allowed_decision_count: allowed,
    denied_decision_count: denied,
    delivered_count: delivered,
    failed_delivery_count: failed,
    last_event_fingerprint: previous,
    append_only_chain_verified: true,
    principal_authentication_verified: false,
    transport_attestation_verified: false,
    certification_issued: false
  });
}

export function evaluateEvidenceExportRequest(ledger, commandValue, options = {}) {
  verifyEvidenceExportAuditLedger(ledger);
  exactObject(options, [], ["expectedAuthContextFingerprint"], "options");
  const command = normalizeDecisionCommand(commandValue);
  const existing = ledger.events.find((event) => event.event_id === command.eventId);
  if (existing) {
    if (existing.event_type === "export_authorization_decision" && existing.request_fingerprint === command.requestFingerprint) {
      return deepFreeze({ ledger, event: existing, idempotent_replay: true });
    }
    fail(EVIDENCE_EXPORT_ERROR_CODES.eventIdConflict, "command.eventId was already used for a different event");
  }
  const grant = command.grant;
  const expiry = effectiveExpiry(grant);
  const reasons = [];
  const deniedFields = command.requestedFieldScope.filter((pointer) => !fieldAllowed(pointer, grant.field_scope));
  const expectedAuthContextFingerprint = options.expectedAuthContextFingerprint === undefined
    ? null
    : requireHash(options.expectedAuthContextFingerprint, "options.expectedAuthContextFingerprint");
  const authContextAnchorVerified = expectedAuthContextFingerprint !== null
    && expectedAuthContextFingerprint === command.authContextFingerprint;

  if (!authContextAnchorVerified) reasons.push(EVIDENCE_EXPORT_ERROR_CODES.authContextUnverified);
  if (grant.status !== "active") reasons.push(EVIDENCE_EXPORT_ERROR_CODES.grantInactive);
  if (grant.authorization_scope.visibility !== "shared"
    || !grant.authorization_scope.recipients.includes(grant.recipient.organization_id)) {
    reasons.push(EVIDENCE_EXPORT_ERROR_CODES.grantScopeInvalid);
  }
  if (Date.parse(command.requestedAt) < Date.parse(grant.created_at)) reasons.push(EVIDENCE_EXPORT_ERROR_CODES.grantNotYetValid);
  if (Date.parse(command.requestedAt) >= Date.parse(expiry)
    || Date.parse(expiry) <= Date.parse(grant.created_at)) reasons.push(EVIDENCE_EXPORT_ERROR_CODES.grantExpired);
  if (ledger.tenant_id !== grant.tenant_id
    || command.requestTenantId !== grant.tenant_id
    || command.resourceRef.tenant_id !== grant.tenant_id
    || grant.resource_refs.some((reference) => reference.tenant_id !== grant.tenant_id)) {
    reasons.push(EVIDENCE_EXPORT_ERROR_CODES.tenantMismatch);
  }
  if (command.principal.principal_id !== grant.recipient.principal_id
    || command.principal.organization_id !== grant.recipient.organization_id) {
    reasons.push(EVIDENCE_EXPORT_ERROR_CODES.recipientMismatch);
  }
  if (command.purpose !== grant.purpose) reasons.push(EVIDENCE_EXPORT_ERROR_CODES.purposeMismatch);
  if (!grant.resource_refs.some((reference) => referenceKey(reference) === referenceKey(command.resourceRef))) {
    reasons.push(EVIDENCE_EXPORT_ERROR_CODES.resourceDenied);
  }
  if (deniedFields.length > 0) reasons.push(EVIDENCE_EXPORT_ERROR_CODES.fieldDenied);
  const reasonCodes = uniqueSorted(reasons);
  const decision = reasonCodes.length === 0 ? "allowed" : "denied";
  const appended = appendEvent(ledger, {
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    event_type: "export_authorization_decision",
    event_id: command.eventId,
    request_fingerprint: command.requestFingerprint,
    tenant_id: ledger.tenant_id,
    request_tenant_id: command.requestTenantId,
    occurred_at: command.requestedAt,
    grant_ref: grantReference(grant),
    grant_fingerprint: command.grantFingerprint,
    principal: command.principal,
    auth_context_fingerprint: command.authContextFingerprint,
    auth_context_anchor_verified: authContextAnchorVerified,
    purpose: command.purpose,
    resource_ref: command.resourceRef,
    requested_field_scope: command.requestedFieldScope,
    denied_field_scope: deniedFields,
    decision,
    reason_codes: reasonCodes,
    authorization_expires_at: expiry,
    download_performed: false,
    principal_authentication_verified: false,
    authorization_enforced_by_transport: false
  });
  return deepFreeze({ ...appended, idempotent_replay: false });
}

function normalizeDeliveryCommand(value) {
  exactObject(value, [
    "eventId",
    "authorizationEventFingerprint",
    "reportedAt",
    "outcome",
    "bytesSent",
    "contentFingerprint",
    "errorCode"
  ], [], "command");
  const command = {
    eventId: requireId(value.eventId, "command.eventId"),
    authorizationEventFingerprint: requireHash(value.authorizationEventFingerprint, "command.authorizationEventFingerprint"),
    reportedAt: canonicalInstant(value.reportedAt, "command.reportedAt"),
    outcome: value.outcome,
    bytesSent: value.bytesSent,
    contentFingerprint: value.contentFingerprint,
    errorCode: value.errorCode
  };
  if (!["delivered", "failed"].includes(command.outcome) || !Number.isInteger(command.bytesSent) || command.bytesSent < 0) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, "command delivery outcome is invalid");
  }
  if (command.outcome === "delivered") {
    if (command.bytesSent < 1 || command.contentFingerprint === null || command.errorCode !== null) {
      fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, "delivered command fields are inconsistent");
    }
    requireHash(command.contentFingerprint, "command.contentFingerprint");
  } else if (command.bytesSent !== 0 || command.contentFingerprint !== null || typeof command.errorCode !== "string" || !ID.test(command.errorCode)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.inputInvalid, "failed command fields are inconsistent");
  }
  const requestFingerprint = deliveryRequestFingerprint(command);
  return { ...command, requestFingerprint };
}

export function recordEvidenceExportDelivery(ledger, commandValue) {
  verifyEvidenceExportAuditLedger(ledger);
  const command = normalizeDeliveryCommand(commandValue);
  const existing = ledger.events.find((event) => event.event_id === command.eventId);
  if (existing) {
    if (existing.event_type === "export_delivery_record" && existing.request_fingerprint === command.requestFingerprint) {
      return deepFreeze({ ledger, event: existing, idempotent_replay: true });
    }
    fail(EVIDENCE_EXPORT_ERROR_CODES.eventIdConflict, "command.eventId was already used for a different event");
  }
  const authorization = ledger.events.find((event) => event.event_fingerprint === command.authorizationEventFingerprint);
  if (!authorization || authorization.event_type !== "export_authorization_decision" || authorization.decision !== "allowed") {
    fail(EVIDENCE_EXPORT_ERROR_CODES.authorizationMissing, "delivery requires one allowed authorization decision");
  }
  if (ledger.events.some((event) => event.event_type === "export_delivery_record"
    && event.authorization_event_fingerprint === authorization.event_fingerprint)) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.deliveryDuplicate, "authorization already has a delivery record");
  }
  if (Date.parse(command.reportedAt) < Date.parse(authorization.occurred_at)
    || (command.outcome === "delivered" && Date.parse(command.reportedAt) >= Date.parse(authorization.authorization_expires_at))) {
    fail(EVIDENCE_EXPORT_ERROR_CODES.deliveryTimeInvalid, "delivery time is outside the authorization window");
  }
  const appended = appendEvent(ledger, {
    schema_version: EVIDENCE_EXPORT_AUTHORIZATION_VERSION,
    event_type: "export_delivery_record",
    event_id: command.eventId,
    request_fingerprint: command.requestFingerprint,
    tenant_id: ledger.tenant_id,
    occurred_at: command.reportedAt,
    authorization_event_fingerprint: authorization.event_fingerprint,
    grant_ref: authorization.grant_ref,
    resource_ref: authorization.resource_ref,
    recipient: authorization.principal,
    outcome: command.outcome,
    bytes_sent: command.bytesSent,
    content_fingerprint: command.contentFingerprint,
    error_code: command.errorCode,
    transport_delivery_reported: true,
    transport_attestation_verified: false
  });
  return deepFreeze({ ...appended, idempotent_replay: false });
}
