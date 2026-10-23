import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { verifyPassportDeliveryPackage } from "./delivery.mjs";
import { projectPassportEvidenceVersion } from "./versioning.mjs";

export const PASSPORT_SHARING_VERSION = "1.0.0";
export const PASSPORT_SHARE_STATES = Object.freeze(["active", "expired", "revoked"]);
export const PASSPORT_BUYER_DECISIONS = Object.freeze(["accepted", "rejected"]);

export const PASSPORT_SHARING_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_sharing_input_invalid",
  fieldUnknown: "passport_sharing_field_unknown",
  fieldMissing: "passport_sharing_field_missing",
  fingerprintMismatch: "passport_sharing_fingerprint_mismatch",
  contextMismatch: "passport_sharing_context_mismatch",
  timeInvalid: "passport_sharing_time_invalid",
  shareInactive: "passport_sharing_inactive",
  revocationInvalid: "passport_sharing_revocation_invalid",
  supplementInvalid: "passport_sharing_supplement_invalid",
  decisionInvalid: "passport_sharing_buyer_decision_invalid",
  historyInvalid: "passport_sharing_history_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SUPPLEMENT_CATEGORIES = new Set([
  "method-detail",
  "environment-detail",
  "source-lineage",
  "exclusion-rationale",
  "authorization-context",
  "other"
]);
const REVOCATION_REASONS = new Set([
  "publisher-revoked",
  "recipient-requested",
  "authorization-withdrawn",
  "delivery-withdrawn"
]);
const REVOCATION_ROLES = new Set(["publisher", "operator"]);
const RESPONSE_DISPOSITIONS = new Set(["provided", "unavailable"]);
const ACCEPT_REASONS = new Set(["evidence-sufficient", "supplement-satisfied", "commercial-fit", "other"]);
const REJECT_REASONS = new Set(["evidence-insufficient", "scope-mismatch", "risk-unaccepted", "commercial-mismatch", "other"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_SHARING_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_SHARING_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 1000, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireHash(value, label) {
  return requireString(value, label, { max: 71, pattern: HASH });
}

function requireSemver(value, label) {
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function fingerprintBody(body) {
  return digestEvidenceBytes(Buffer.from(canonical(body), "utf8"));
}

function uniqueSorted(values, label, normalize) {
  if (!Array.isArray(values)) fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} must be an array`);
  const normalized = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const encoded = normalized.map(canonical);
  if (new Set(encoded).size !== normalized.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} contains duplicate entries`);
  }
  return normalized.sort((left, right) => canonical(left).localeCompare(canonical(right)));
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const reference = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the sharing tenant`);
  }
  return reference;
}

function recordReference(record, objectType, objectIdKey) {
  return {
    object_type: objectType,
    object_id: record[objectIdKey],
    version: record.version,
    tenant_id: record.tenant_id,
    content_fingerprint: record.content_fingerprint
  };
}

function passportReference(record) {
  return recordReference(record, "passport_evidence_version", "passport_id");
}

function deliveryReference(manifest) {
  return recordReference(manifest, "passport_delivery_manifest", "delivery_id");
}

function shareReference(record) {
  return recordReference(record, "passport_share_grant", "share_id");
}

function supplementRequestReference(record) {
  return recordReference(record, "passport_supplement_request", "request_id");
}

function supplementResponseReference(record) {
  return recordReference(record, "passport_supplement_response", "response_id");
}

function decisionReference(record) {
  return recordReference(record, "passport_buyer_decision", "decision_id");
}

function normalizeRecipient(value, label) {
  exactObject(value, ["subject_id", "organization_id"], [], label);
  return {
    subject_id: requireId(value.subject_id, `${label}.subject_id`),
    organization_id: requireId(value.organization_id, `${label}.organization_id`)
  };
}

function normalizeShareBoundary(value, label) {
  exactObject(value, [
    "time_limited", "bearer_secret_included", "identity_authenticated",
    "export_authorization_verified", "passport_status_mutated", "certification_issued"
  ], [], label);
  if (value.time_limited !== true
      || value.bearer_secret_included !== false
      || value.identity_authenticated !== false
      || value.export_authorization_verified !== false
      || value.passport_status_mutated !== false
      || value.certification_issued !== false) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label} must preserve the time-limited, secret-free, non-certifying boundary`);
  }
  return {
    time_limited: true,
    bearer_secret_included: false,
    identity_authenticated: false,
    export_authorization_verified: false,
    passport_status_mutated: false,
    certification_issued: false
  };
}

function parseDelivery(input, label) {
  exactObject(input, ["manifest", "files"], [], label);
  const verification = verifyPassportDeliveryPackage({ files: input.files });
  const manifestFile = input.files.find(({ path }) => path === "manifest.json");
  if (!manifestFile || typeof manifestFile.content !== "string") {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label} must contain manifest.json`);
  }
  let parsed;
  try {
    parsed = JSON.parse(manifestFile.content);
  } catch {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label}.manifest.json must contain valid JSON`);
  }
  if (!same(parsed, input.manifest) || parsed.delivery_id !== verification.delivery_id) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, `${label}.manifest must match the verified delivery files`);
  }
  return { manifest: parsed, verification };
}

function sharingContext({ passportVersion, passportEvents, delivery, evaluatedAt }, label = "context") {
  if (!Array.isArray(passportEvents)) {
    fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label}.passport_events must be an array`);
  }
  const instant = canonicalInstant(evaluatedAt, `${label}.evaluated_at`);
  const passportProjection = projectPassportEvidenceVersion({
    version: passportVersion,
    events: passportEvents,
    evaluated_at: instant
  });
  const verifiedDelivery = parseDelivery(delivery, `${label}.delivery`);
  if (!same(verifiedDelivery.manifest.passport_ref, passportReference(passportVersion))) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, "delivery must bind the exact passport version being shared");
  }
  if (verifiedDelivery.manifest.tenant_id !== passportVersion.tenant_id) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, "delivery and passport tenant must match");
  }
  return {
    evaluatedAt: instant,
    passportProjection,
    manifest: verifiedDelivery.manifest,
    deliveryVerification: verifiedDelivery.verification
  };
}

function normalizeGrantBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "share_id", "version", "tenant_id", "created_by",
    "created_at", "recipient", "purpose", "passport_ref", "delivery_ref", "valid_from",
    "expires_at", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_SHARING_VERSION || value.record_type !== "passport_share_grant") {
    fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const createdAt = canonicalInstant(value.created_at, `${label}.created_at`);
  const validFrom = canonicalInstant(value.valid_from, `${label}.valid_from`);
  const expiresAt = canonicalInstant(value.expires_at, `${label}.expires_at`);
  if (createdAt !== validFrom || Date.parse(expiresAt) <= Date.parse(validFrom)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, `${label} must start at creation and expire later`);
  }
  return {
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_share_grant",
    share_id: requireId(value.share_id, `${label}.share_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: createdAt,
    recipient: normalizeRecipient(value.recipient, `${label}.recipient`),
    purpose: requireString(value.purpose, `${label}.purpose`, { min: 3, max: 240 }),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    delivery_ref: normalizeReference(value.delivery_ref, "passport_delivery_manifest", tenantId, `${label}.delivery_ref`),
    valid_from: validFrom,
    expires_at: expiresAt,
    boundary: normalizeShareBoundary(value.boundary, `${label}.boundary`)
  };
}

function verifyFingerprintRecord(record, normalizer, label) {
  if (!isObject(record)) fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  if (!Object.hasOwn(record, "content_fingerprint")) {
    fail(PASSPORT_SHARING_ERROR_CODES.fieldMissing, `${label}.content_fingerprint is required`);
  }
  const { content_fingerprint: supplied, ...candidate } = record;
  const body = normalizer(candidate, label);
  const expected = fingerprintBody(body);
  if (requireHash(supplied, `${label}.content_fingerprint`) !== expected) {
    fail(PASSPORT_SHARING_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match its content`);
  }
  return deepFreeze({ ...body, content_fingerprint: expected });
}

function validateGrantContext(grant, passportVersion, context) {
  if (!context.passportProjection.active) {
    fail(PASSPORT_SHARING_ERROR_CODES.shareInactive, "a share can be created only for an active passport version");
  }
  if (!same(grant.passport_ref, passportReference(passportVersion))
      || !same(grant.delivery_ref, deliveryReference(context.manifest))
      || grant.tenant_id !== passportVersion.tenant_id) {
    fail(PASSPORT_SHARING_ERROR_CODES.contextMismatch, "share references must bind the exact passport, delivery, and tenant");
  }
  if (Date.parse(grant.created_at) < Date.parse(context.manifest.created_at)
      || Date.parse(grant.expires_at) > Date.parse(passportVersion.valid_until)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, "share lifetime must follow delivery creation and cannot outlive the passport version");
  }
  const authorizationExpiry = passportVersion.authorization_scope.expires_at;
  if (authorizationExpiry !== null && Date.parse(grant.expires_at) > Date.parse(authorizationExpiry)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, "share lifetime cannot outlive the passport authorization scope");
  }
}

export function createPassportShareGrant(input) {
  exactObject(input, [
    "share_id", "version", "created_by", "created_at", "recipient", "purpose", "expires_at",
    "passport_version", "passport_events", "delivery"
  ], [], "input");
  const context = sharingContext({
    passportVersion: input.passport_version,
    passportEvents: input.passport_events,
    delivery: input.delivery,
    evaluatedAt: input.created_at
  });
  const body = normalizeGrantBody({
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_share_grant",
    share_id: input.share_id,
    version: input.version,
    tenant_id: input.passport_version.tenant_id,
    created_by: input.created_by,
    created_at: input.created_at,
    recipient: input.recipient,
    purpose: input.purpose,
    passport_ref: passportReference(input.passport_version),
    delivery_ref: deliveryReference(context.manifest),
    valid_from: input.created_at,
    expires_at: input.expires_at,
    boundary: {
      time_limited: true,
      bearer_secret_included: false,
      identity_authenticated: false,
      export_authorization_verified: false,
      passport_status_mutated: false,
      certification_issued: false
    }
  });
  validateGrantContext(body, input.passport_version, context);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportShareGrant(input) {
  exactObject(input, ["record", "passport_version", "passport_events", "delivery"], [], "input");
  const grant = verifyFingerprintRecord(input.record, normalizeGrantBody, "input.record");
  const context = sharingContext({
    passportVersion: input.passport_version,
    passportEvents: input.passport_events,
    delivery: input.delivery,
    evaluatedAt: grant.created_at
  });
  validateGrantContext(grant, input.passport_version, context);
  return grant;
}

function normalizeActor(value, label) {
  exactObject(value, ["actor_id", "actor_role"], [], label);
  const actor = {
    actor_id: requireId(value.actor_id, `${label}.actor_id`),
    actor_role: requireString(value.actor_role, `${label}.actor_role`, { max: 32 })
  };
  if (!REVOCATION_ROLES.has(actor.actor_role)) {
    fail(PASSPORT_SHARING_ERROR_CODES.revocationInvalid, `${label}.actor_role cannot revoke a share`);
  }
  return actor;
}

function normalizeRevocationBoundary(value, label) {
  exactObject(value, ["append_only", "grant_mutated", "passport_status_mutated", "certification_issued"], [], label);
  if (value.append_only !== true || value.grant_mutated !== false
      || value.passport_status_mutated !== false || value.certification_issued !== false) {
    fail(PASSPORT_SHARING_ERROR_CODES.revocationInvalid, `${label} must remain append-only and cannot mutate evidence status`);
  }
  return {
    append_only: true,
    grant_mutated: false,
    passport_status_mutated: false,
    certification_issued: false
  };
}

function normalizeRevocationBody(value, label = "event") {
  exactObject(value, [
    "schema_version", "record_type", "event_id", "sequence", "tenant_id", "share_ref",
    "passport_ref", "occurred_at", "reason_code", "reason_detail", "actor", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_SHARING_VERSION || value.record_type !== "passport_share_revocation" || value.sequence !== 1) {
    fail(PASSPORT_SHARING_ERROR_CODES.revocationInvalid, `${label} has an unsupported version, type, or sequence`);
  }
  if (!REVOCATION_REASONS.has(value.reason_code)) {
    fail(PASSPORT_SHARING_ERROR_CODES.revocationInvalid, `${label}.reason_code is invalid`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  return {
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_share_revocation",
    event_id: requireId(value.event_id, `${label}.event_id`),
    sequence: 1,
    tenant_id: tenantId,
    share_ref: normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    occurred_at: canonicalInstant(value.occurred_at, `${label}.occurred_at`),
    reason_code: value.reason_code,
    reason_detail: requireString(value.reason_detail, `${label}.reason_detail`, { min: 3, max: 500 }),
    actor: normalizeActor(value.actor, `${label}.actor`),
    boundary: normalizeRevocationBoundary(value.boundary, `${label}.boundary`)
  };
}

function validateRevocationContext(event, grant, passportVersion, passportEvents) {
  if (!same(event.share_ref, shareReference(grant)) || !same(event.passport_ref, grant.passport_ref)) {
    fail(PASSPORT_SHARING_ERROR_CODES.revocationInvalid, "revocation must target the exact share and passport references");
  }
  const occurredMs = Date.parse(event.occurred_at);
  if (occurredMs < Date.parse(grant.valid_from) || occurredMs >= Date.parse(grant.expires_at)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, "revocation must occur while the share lifetime is active");
  }
  const passportProjection = projectPassportEvidenceVersion({
    version: passportVersion,
    events: passportEvents,
    evaluated_at: event.occurred_at
  });
  if (!passportProjection.active) {
    fail(PASSPORT_SHARING_ERROR_CODES.shareInactive, "an inactive passport cannot receive a later share revocation");
  }
}

export function createPassportShareRevocation(input) {
  exactObject(input, [
    "event_id", "grant", "passport_version", "passport_events", "delivery", "occurred_at",
    "reason_code", "reason_detail", "actor"
  ], [], "input");
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const body = normalizeRevocationBody({
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_share_revocation",
    event_id: input.event_id,
    sequence: 1,
    tenant_id: grant.tenant_id,
    share_ref: shareReference(grant),
    passport_ref: grant.passport_ref,
    occurred_at: input.occurred_at,
    reason_code: input.reason_code,
    reason_detail: input.reason_detail,
    actor: input.actor,
    boundary: {
      append_only: true,
      grant_mutated: false,
      passport_status_mutated: false,
      certification_issued: false
    }
  });
  validateRevocationContext(body, grant, input.passport_version, input.passport_events);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportShareRevocation(input) {
  exactObject(input, ["event", "grant", "passport_version", "passport_events", "delivery"], [], "input");
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const event = verifyFingerprintRecord(input.event, normalizeRevocationBody, "input.event");
  validateRevocationContext(event, grant, input.passport_version, input.passport_events);
  return event;
}

export function projectPassportShare(input) {
  exactObject(input, [
    "grant", "passport_version", "passport_events", "delivery", "revocations", "evaluated_at"
  ], [], "input");
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const evaluatedAt = canonicalInstant(input.evaluated_at, "input.evaluated_at");
  if (Date.parse(evaluatedAt) < Date.parse(grant.valid_from)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, "evaluated_at cannot precede the share lifetime");
  }
  if (!Array.isArray(input.revocations) || input.revocations.length > 1) {
    fail(PASSPORT_SHARING_ERROR_CODES.historyInvalid, "a share accepts at most one append-only revocation");
  }
  const revocation = input.revocations.length === 0 ? null : verifyPassportShareRevocation({
    event: input.revocations[0],
    grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const passportProjection = projectPassportEvidenceVersion({
    version: input.passport_version,
    events: input.passport_events,
    evaluated_at: evaluatedAt
  });
  const revocationEffective = revocation !== null && Date.parse(revocation.occurred_at) <= Date.parse(evaluatedAt);
  const expired = Date.parse(evaluatedAt) >= Date.parse(grant.expires_at);
  const shareState = revocationEffective ? "revoked" : expired ? "expired" : "active";
  const active = shareState === "active" && passportProjection.active;
  return deepFreeze({
    schema_version: PASSPORT_SHARING_VERSION,
    share_ref: shareReference(grant),
    passport_ref: grant.passport_ref,
    delivery_ref: grant.delivery_ref,
    recipient: grant.recipient,
    evaluated_at: evaluatedAt,
    expires_at: grant.expires_at,
    share_state: shareState,
    passport_lifecycle_state: passportProjection.lifecycle_state,
    passport_status_axes: passportProjection.status_axes,
    active,
    invalidation_reason: revocationEffective
      ? revocation.reason_code
      : expired
        ? "share-expired"
        : passportProjection.active
          ? null
          : passportProjection.invalidation_reason ?? "passport-inactive",
    revocation_ref: revocationEffective
      ? { event_id: revocation.event_id, content_fingerprint: revocation.content_fingerprint }
      : null,
    passport_status_mutated: false,
    certification_issued: false
  });
}

function normalizeSupplementBoundary(value, kind, label) {
  const required = kind === "request"
    ? ["request_record_only", "raw_evidence_included", "passport_status_mutated", "certification_issued"]
    : ["request_closed", "raw_artifact_content_included", "passport_status_mutated", "independent_review_verified", "certification_issued"];
  exactObject(value, required, [], label);
  if (kind === "request") {
    if (value.request_record_only !== true || value.raw_evidence_included !== false
        || value.passport_status_mutated !== false || value.certification_issued !== false) {
      fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} crosses the supplement request boundary`);
    }
    return {
      request_record_only: true,
      raw_evidence_included: false,
      passport_status_mutated: false,
      certification_issued: false
    };
  }
  if (value.request_closed !== true || value.raw_artifact_content_included !== false
      || value.passport_status_mutated !== false || value.independent_review_verified !== false
      || value.certification_issued !== false) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} crosses the supplement response boundary`);
  }
  return {
    request_closed: true,
    raw_artifact_content_included: false,
    passport_status_mutated: false,
    independent_review_verified: false,
    certification_issued: false
  };
}

function normalizeRequestedItems(values, label) {
  const items = uniqueSorted(values, label, (value, location) => {
    exactObject(value, ["item_id", "category", "description"], [], location);
    const category = requireString(value.category, `${location}.category`, { max: 40 });
    if (!SUPPLEMENT_CATEGORIES.has(category)) {
      fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${location}.category is invalid`);
    }
    return {
      item_id: requireId(value.item_id, `${location}.item_id`),
      category,
      description: requireString(value.description, `${location}.description`, { min: 3, max: 500 })
    };
  });
  if (items.length === 0 || items.length > 32) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} must contain 1 through 32 items`);
  }
  if (new Set(items.map(({ item_id: itemId }) => itemId)).size !== items.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} item_id values must be unique`);
  }
  return items.sort((left, right) => left.item_id.localeCompare(right.item_id));
}

function normalizeRequestBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "request_id", "version", "tenant_id", "share_ref",
    "passport_ref", "requested_by", "requested_at", "items", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_SHARING_VERSION || value.record_type !== "passport_supplement_request") {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  return {
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_supplement_request",
    request_id: requireId(value.request_id, `${label}.request_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    share_ref: normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    requested_by: requireId(value.requested_by, `${label}.requested_by`),
    requested_at: canonicalInstant(value.requested_at, `${label}.requested_at`),
    items: normalizeRequestedItems(value.items, `${label}.items`),
    boundary: normalizeSupplementBoundary(value.boundary, "request", `${label}.boundary`)
  };
}

function assertActiveShare(input, instant, label) {
  const projection = projectPassportShare({
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations,
    evaluated_at: instant
  });
  if (!projection.active) {
    fail(PASSPORT_SHARING_ERROR_CODES.shareInactive, `${label} requires an active share and passport version`);
  }
  return projection;
}

function validateRequestContext(record, input) {
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  assertActiveShare(input, record.requested_at, "supplement request");
  if (!same(record.share_ref, shareReference(grant)) || !same(record.passport_ref, grant.passport_ref)
      || record.requested_by !== grant.recipient.subject_id) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, "supplement request must come from the exact share recipient for the exact passport");
  }
  return grant;
}

export function createPassportSupplementRequest(input) {
  exactObject(input, [
    "request_id", "version", "grant", "passport_version", "passport_events", "delivery",
    "revocations", "requested_by", "requested_at", "items"
  ], [], "input");
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const body = normalizeRequestBody({
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_supplement_request",
    request_id: input.request_id,
    version: input.version,
    tenant_id: grant.tenant_id,
    share_ref: shareReference(grant),
    passport_ref: grant.passport_ref,
    requested_by: input.requested_by,
    requested_at: input.requested_at,
    items: input.items,
    boundary: {
      request_record_only: true,
      raw_evidence_included: false,
      passport_status_mutated: false,
      certification_issued: false
    }
  });
  validateRequestContext(body, input);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportSupplementRequest(input) {
  exactObject(input, [
    "record", "grant", "passport_version", "passport_events", "delivery", "revocations"
  ], [], "input");
  const record = verifyFingerprintRecord(input.record, normalizeRequestBody, "input.record");
  validateRequestContext(record, input);
  return record;
}

function normalizeArtifactReference(value, tenantId, label) {
  return normalizeReference(value, "artifact", tenantId, label);
}

function normalizeResponseItems(values, tenantId, label) {
  const items = uniqueSorted(values, label, (value, location) => {
    exactObject(value, ["item_id", "disposition", "artifact_ref", "note"], [], location);
    const disposition = requireString(value.disposition, `${location}.disposition`, { max: 16 });
    if (!RESPONSE_DISPOSITIONS.has(disposition)) {
      fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${location}.disposition is invalid`);
    }
    const artifactRef = value.artifact_ref === null
      ? null
      : normalizeArtifactReference(value.artifact_ref, tenantId, `${location}.artifact_ref`);
    if ((disposition === "provided") !== (artifactRef !== null)) {
      fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${location}.artifact_ref is required only when provided`);
    }
    return {
      item_id: requireId(value.item_id, `${location}.item_id`),
      disposition,
      artifact_ref: artifactRef,
      note: requireString(value.note, `${location}.note`, { min: 3, max: 500 })
    };
  });
  if (items.length === 0 || items.length > 32
      || new Set(items.map(({ item_id: itemId }) => itemId)).size !== items.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} must contain 1 through 32 unique item responses`);
  }
  return items.sort((left, right) => left.item_id.localeCompare(right.item_id));
}

function normalizeResponseBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "response_id", "version", "tenant_id", "request_ref",
    "share_ref", "passport_ref", "responded_by", "responder_role", "responded_at", "items", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_SHARING_VERSION || value.record_type !== "passport_supplement_response") {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const responderRole = requireString(value.responder_role, `${label}.responder_role`, { max: 32 });
  if (!REVOCATION_ROLES.has(responderRole)) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, `${label}.responder_role must be publisher or operator`);
  }
  return {
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_supplement_response",
    response_id: requireId(value.response_id, `${label}.response_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    request_ref: normalizeReference(value.request_ref, "passport_supplement_request", tenantId, `${label}.request_ref`),
    share_ref: normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    responded_by: requireId(value.responded_by, `${label}.responded_by`),
    responder_role: responderRole,
    responded_at: canonicalInstant(value.responded_at, `${label}.responded_at`),
    items: normalizeResponseItems(value.items, tenantId, `${label}.items`),
    boundary: normalizeSupplementBoundary(value.boundary, "response", `${label}.boundary`)
  };
}

function validateResponseContext(record, request, input) {
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  assertActiveShare(input, record.responded_at, "supplement response");
  if (Date.parse(record.responded_at) < Date.parse(request.requested_at)
      || !same(record.request_ref, supplementRequestReference(request))
      || !same(record.share_ref, shareReference(grant))
      || !same(record.passport_ref, grant.passport_ref)) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, "supplement response must follow and bind the exact request, share, and passport");
  }
  const requestedIds = request.items.map(({ item_id: itemId }) => itemId).sort();
  const responseIds = record.items.map(({ item_id: itemId }) => itemId).sort();
  if (!same(requestedIds, responseIds)) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, "supplement response must close every requested item exactly once");
  }
  return grant;
}

export function createPassportSupplementResponse(input) {
  exactObject(input, [
    "response_id", "version", "request", "grant", "passport_version", "passport_events",
    "delivery", "revocations", "responded_by", "responder_role", "responded_at", "items"
  ], [], "input");
  const request = verifyPassportSupplementRequest({
    record: input.request,
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations
  });
  const body = normalizeResponseBody({
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_supplement_response",
    response_id: input.response_id,
    version: input.version,
    tenant_id: request.tenant_id,
    request_ref: supplementRequestReference(request),
    share_ref: request.share_ref,
    passport_ref: request.passport_ref,
    responded_by: input.responded_by,
    responder_role: input.responder_role,
    responded_at: input.responded_at,
    items: input.items,
    boundary: {
      request_closed: true,
      raw_artifact_content_included: false,
      passport_status_mutated: false,
      independent_review_verified: false,
      certification_issued: false
    }
  });
  validateResponseContext(body, request, input);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportSupplementResponse(input) {
  exactObject(input, [
    "record", "request", "grant", "passport_version", "passport_events", "delivery", "revocations"
  ], [], "input");
  const request = verifyPassportSupplementRequest({
    record: input.request,
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations
  });
  const record = verifyFingerprintRecord(input.record, normalizeResponseBody, "input.record");
  validateResponseContext(record, request, input);
  return record;
}

function normalizeStatusAxes(value, label) {
  exactObject(value, ["measurement_validity", "content_integrity", "independent_review", "freshness", "policy_decision"], [], label);
  return {
    measurement_validity: requireString(value.measurement_validity, `${label}.measurement_validity`, { max: 32 }),
    content_integrity: requireString(value.content_integrity, `${label}.content_integrity`, { max: 32 }),
    independent_review: requireString(value.independent_review, `${label}.independent_review`, { max: 32 }),
    freshness: requireString(value.freshness, `${label}.freshness`, { max: 32 }),
    policy_decision: requireString(value.policy_decision, `${label}.policy_decision`, { max: 32 })
  };
}

function normalizeShareSnapshot(value, tenantId, label) {
  exactObject(value, ["share_ref", "evaluated_at", "share_state", "active", "expires_at"], [], label);
  if (value.share_state !== "active" || value.active !== true) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label} must capture an active share`);
  }
  return {
    share_ref: normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`),
    evaluated_at: canonicalInstant(value.evaluated_at, `${label}.evaluated_at`),
    share_state: "active",
    active: true,
    expires_at: canonicalInstant(value.expires_at, `${label}.expires_at`)
  };
}

function normalizeEvidenceSnapshot(value, tenantId, label) {
  exactObject(value, [
    "passport_ref", "evaluated_at", "lifecycle_state", "active", "valid_until", "status_axes"
  ], [], label);
  if (value.lifecycle_state !== "sealed" || value.active !== true) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label} must capture an active sealed passport`);
  }
  return {
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    evaluated_at: canonicalInstant(value.evaluated_at, `${label}.evaluated_at`),
    lifecycle_state: "sealed",
    active: true,
    valid_until: canonicalInstant(value.valid_until, `${label}.valid_until`),
    status_axes: normalizeStatusAxes(value.status_axes, `${label}.status_axes`)
  };
}

function normalizeDecisionBoundary(value, label) {
  exactObject(value, [
    "buyer_decision_only", "platform_evidence_status_mutated", "independent_review_status_changed",
    "freshness_status_changed", "policy_decision_status_changed", "performance_claim_allowed", "certification_issued"
  ], [], label);
  if (value.buyer_decision_only !== true || value.platform_evidence_status_mutated !== false
      || value.independent_review_status_changed !== false || value.freshness_status_changed !== false
      || value.policy_decision_status_changed !== false || value.performance_claim_allowed !== false
      || value.certification_issued !== false) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label} must keep buyer acceptance separate from every platform evidence status`);
  }
  return {
    buyer_decision_only: true,
    platform_evidence_status_mutated: false,
    independent_review_status_changed: false,
    freshness_status_changed: false,
    policy_decision_status_changed: false,
    performance_claim_allowed: false,
    certification_issued: false
  };
}

function normalizeDecisionBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "decision_id", "version", "tenant_id", "share_ref", "passport_ref",
    "buyer_id", "decided_at", "decision", "reason_codes", "decision_note", "supplement_request_refs",
    "supplement_response_refs", "share_snapshot", "platform_evidence_snapshot", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_SHARING_VERSION || value.record_type !== "passport_buyer_decision") {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const decision = requireString(value.decision, `${label}.decision`, { max: 16 });
  if (!PASSPORT_BUYER_DECISIONS.includes(decision)) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label}.decision must be accepted or rejected`);
  }
  const allowedReasons = decision === "accepted" ? ACCEPT_REASONS : REJECT_REASONS;
  const reasonCodes = uniqueSorted(value.reason_codes, `${label}.reason_codes`, (reason, location) => {
    const normalized = requireString(reason, location, { max: 64 });
    if (!allowedReasons.has(normalized)) fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${location} is not valid for ${decision}`);
    return normalized;
  });
  if (reasonCodes.length === 0 || reasonCodes.length > 8) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, `${label}.reason_codes must contain 1 through 8 values`);
  }
  return {
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_buyer_decision",
    decision_id: requireId(value.decision_id, `${label}.decision_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    share_ref: normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    buyer_id: requireId(value.buyer_id, `${label}.buyer_id`),
    decided_at: canonicalInstant(value.decided_at, `${label}.decided_at`),
    decision,
    reason_codes: reasonCodes,
    decision_note: requireString(value.decision_note, `${label}.decision_note`, { min: 3, max: 1000 }),
    supplement_request_refs: uniqueSorted(value.supplement_request_refs, `${label}.supplement_request_refs`, (reference, location) => (
      normalizeReference(reference, "passport_supplement_request", tenantId, location)
    )),
    supplement_response_refs: uniqueSorted(value.supplement_response_refs, `${label}.supplement_response_refs`, (reference, location) => (
      normalizeReference(reference, "passport_supplement_response", tenantId, location)
    )),
    share_snapshot: normalizeShareSnapshot(value.share_snapshot, tenantId, `${label}.share_snapshot`),
    platform_evidence_snapshot: normalizeEvidenceSnapshot(value.platform_evidence_snapshot, tenantId, `${label}.platform_evidence_snapshot`),
    boundary: normalizeDecisionBoundary(value.boundary, `${label}.boundary`)
  };
}

function verifySupplementSet(input) {
  if (!Array.isArray(input.supplement_requests) || !Array.isArray(input.supplement_responses)) {
    fail(PASSPORT_SHARING_ERROR_CODES.inputInvalid, "supplement_requests and supplement_responses must be arrays");
  }
  if (input.supplement_requests.length > 32 || input.supplement_responses.length > 32) {
    fail(PASSPORT_SHARING_ERROR_CODES.supplementInvalid, "a buyer decision accepts at most 32 supplement requests and responses");
  }
  const requests = input.supplement_requests.map((record) => verifyPassportSupplementRequest({
    record,
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations
  }));
  const requestIds = new Set(requests.map(({ request_id: requestId }) => requestId));
  if (requestIds.size !== requests.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "supplement request identities must be unique");
  }
  const requestById = new Map(requests.map((request) => [request.request_id, request]));
  const responses = input.supplement_responses.map((record) => {
    const requestId = record?.request_ref?.object_id;
    const request = requestById.get(requestId);
    if (!request) fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "supplement response references an undeclared request");
    return verifyPassportSupplementResponse({
      record,
      request,
      grant: input.grant,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      revocations: input.revocations
    });
  });
  const responseRequests = responses.map(({ request_ref: reference }) => reference.object_id);
  if (new Set(responseRequests).size !== responses.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "each supplement request accepts at most one response");
  }
  const responseIds = new Set(responses.map(({ response_id: responseId }) => responseId));
  if (responseIds.size !== responses.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "supplement response identities must be unique");
  }
  return {
    requests: requests.sort((left, right) => left.request_id.localeCompare(right.request_id)),
    responses: responses.sort((left, right) => left.response_id.localeCompare(right.response_id))
  };
}

function validateDecisionContext(record, input) {
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const projection = assertActiveShare(input, record.decided_at, "buyer decision");
  const supplements = verifySupplementSet(input);
  if (record.buyer_id !== grant.recipient.subject_id
      || !same(record.share_ref, shareReference(grant))
      || !same(record.passport_ref, grant.passport_ref)) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "buyer decision must bind the exact recipient, share, and passport");
  }
  const latestSupplementAt = [...supplements.requests.map(({ requested_at: value }) => value), ...supplements.responses.map(({ responded_at: value }) => value)]
    .sort()
    .at(-1);
  if (latestSupplementAt !== undefined && Date.parse(record.decided_at) < Date.parse(latestSupplementAt)) {
    fail(PASSPORT_SHARING_ERROR_CODES.timeInvalid, "buyer decision cannot precede a referenced supplement record");
  }
  if (record.decision === "accepted" && supplements.responses.length !== supplements.requests.length) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "accepted requires every referenced supplement request to be closed");
  }
  const expectedRequestRefs = supplements.requests
    .map(supplementRequestReference)
    .sort((left, right) => canonical(left).localeCompare(canonical(right)));
  const expectedResponseRefs = supplements.responses
    .map(supplementResponseReference)
    .sort((left, right) => canonical(left).localeCompare(canonical(right)));
  const expectedShareSnapshot = {
    share_ref: projection.share_ref,
    evaluated_at: projection.evaluated_at,
    share_state: projection.share_state,
    active: projection.active,
    expires_at: projection.expires_at
  };
  const passportProjection = projectPassportEvidenceVersion({
    version: input.passport_version,
    events: input.passport_events,
    evaluated_at: record.decided_at
  });
  const expectedEvidenceSnapshot = {
    passport_ref: passportProjection.passport_ref,
    evaluated_at: passportProjection.evaluated_at,
    lifecycle_state: passportProjection.lifecycle_state,
    active: passportProjection.active,
    valid_until: passportProjection.valid_until,
    status_axes: passportProjection.status_axes
  };
  if (!same(record.supplement_request_refs, expectedRequestRefs)
      || !same(record.supplement_response_refs, expectedResponseRefs)
      || !same(record.share_snapshot, expectedShareSnapshot)
      || !same(record.platform_evidence_snapshot, expectedEvidenceSnapshot)) {
    fail(PASSPORT_SHARING_ERROR_CODES.decisionInvalid, "buyer decision references or status snapshots do not match the exact decision context");
  }
  return { grant, projection, supplements };
}

export function createPassportBuyerDecision(input) {
  exactObject(input, [
    "decision_id", "version", "grant", "passport_version", "passport_events", "delivery", "revocations",
    "supplement_requests", "supplement_responses", "buyer_id", "decided_at", "decision", "reason_codes", "decision_note"
  ], [], "input");
  const grant = verifyPassportShareGrant({
    record: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery
  });
  const projection = assertActiveShare(input, input.decided_at, "buyer decision");
  const passportProjection = projectPassportEvidenceVersion({
    version: input.passport_version,
    events: input.passport_events,
    evaluated_at: input.decided_at
  });
  const supplements = verifySupplementSet(input);
  const body = normalizeDecisionBody({
    schema_version: PASSPORT_SHARING_VERSION,
    record_type: "passport_buyer_decision",
    decision_id: input.decision_id,
    version: input.version,
    tenant_id: grant.tenant_id,
    share_ref: shareReference(grant),
    passport_ref: grant.passport_ref,
    buyer_id: input.buyer_id,
    decided_at: input.decided_at,
    decision: input.decision,
    reason_codes: input.reason_codes,
    decision_note: input.decision_note,
    supplement_request_refs: supplements.requests.map(supplementRequestReference),
    supplement_response_refs: supplements.responses.map(supplementResponseReference),
    share_snapshot: {
      share_ref: projection.share_ref,
      evaluated_at: projection.evaluated_at,
      share_state: projection.share_state,
      active: projection.active,
      expires_at: projection.expires_at
    },
    platform_evidence_snapshot: {
      passport_ref: passportProjection.passport_ref,
      evaluated_at: passportProjection.evaluated_at,
      lifecycle_state: passportProjection.lifecycle_state,
      active: passportProjection.active,
      valid_until: passportProjection.valid_until,
      status_axes: passportProjection.status_axes
    },
    boundary: {
      buyer_decision_only: true,
      platform_evidence_status_mutated: false,
      independent_review_status_changed: false,
      freshness_status_changed: false,
      policy_decision_status_changed: false,
      performance_claim_allowed: false,
      certification_issued: false
    }
  });
  validateDecisionContext(body, input);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportBuyerDecision(input) {
  exactObject(input, [
    "record", "grant", "passport_version", "passport_events", "delivery", "revocations",
    "supplement_requests", "supplement_responses"
  ], [], "input");
  const record = verifyFingerprintRecord(input.record, normalizeDecisionBody, "input.record");
  validateDecisionContext(record, input);
  return record;
}

export function projectPassportBuyerDecision(input) {
  exactObject(input, [
    "decisions", "grant", "passport_version", "passport_events", "delivery", "revocations",
    "supplement_requests", "supplement_responses", "evaluated_at"
  ], [], "input");
  if (!Array.isArray(input.decisions) || input.decisions.length > 1) {
    fail(PASSPORT_SHARING_ERROR_CODES.historyInvalid, "a share accepts at most one final buyer decision");
  }
  const shareProjection = projectPassportShare({
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations,
    evaluated_at: input.evaluated_at
  });
  const decision = input.decisions.length === 0 ? null : verifyPassportBuyerDecision({
    record: input.decisions[0],
    grant: input.grant,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    revocations: input.revocations,
    supplement_requests: input.supplement_requests,
    supplement_responses: input.supplement_responses
  });
  return deepFreeze({
    schema_version: PASSPORT_SHARING_VERSION,
    share_ref: shareProjection.share_ref,
    passport_ref: shareProjection.passport_ref,
    evaluated_at: shareProjection.evaluated_at,
    buyer_decision: decision?.decision ?? "pending",
    decision_ref: decision === null ? null : decisionReference(decision),
    decision_recorded_at: decision?.decided_at ?? null,
    current_share_state: shareProjection.share_state,
    current_access_active: shareProjection.active,
    current_passport_lifecycle_state: shareProjection.passport_lifecycle_state,
    current_passport_status_axes: shareProjection.passport_status_axes,
    buyer_decision_changes_platform_status: false,
    independent_review_verified: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
}
