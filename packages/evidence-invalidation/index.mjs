import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const EVIDENCE_INVALIDATION_VERSION = "1.0.0";

export const EVIDENCE_INVALIDATION_EVENT_TYPES = Object.freeze([
  "evidence.expired",
  "evidence.superseded",
  "evidence.revoked"
]);

export const EVIDENCE_INVALIDATION_ERROR_CODES = Object.freeze({
  inputInvalid: "evidence_invalidation_input_invalid",
  fieldUnknown: "evidence_invalidation_field_unknown",
  fieldMissing: "evidence_invalidation_field_missing",
  referenceMismatch: "evidence_invalidation_reference_mismatch",
  contractInvalid: "evidence_invalidation_contract_invalid",
  contractFingerprintMismatch: "evidence_invalidation_contract_fingerprint_mismatch",
  lifecycleEventInvalid: "evidence_invalidation_lifecycle_event_invalid",
  eventInvalid: "evidence_invalidation_event_invalid",
  eventFingerprintMismatch: "evidence_invalidation_event_fingerprint_mismatch",
  eventIdConflict: "evidence_invalidation_event_id_conflict",
  eventStale: "evidence_invalidation_event_stale",
  projectionInvalid: "evidence_invalidation_projection_invalid",
  projectionTerminal: "evidence_invalidation_projection_terminal",
  timeInvalid: "evidence_invalidation_time_invalid",
  ttlInvalid: "evidence_invalidation_ttl_invalid",
  replacementInvalid: "evidence_invalidation_replacement_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const MAX_CACHE_TTL_SECONDS = 86_400;
const EVENT_TYPE_SET = new Set(EVIDENCE_INVALIDATION_EVENT_TYPES);
const TERMINAL_REASON_ROLES = Object.freeze({
  validity_elapsed: new Set(["system", "operator"]),
  replacement_published: new Set(["publisher"]),
  revocation_authorized: new Set(["publisher", "operator"])
});
const STATUS_AXIS_VALUES = Object.freeze({
  measurement_validity: new Set(["sufficient", "partial", "invalid", "unknown"]),
  content_integrity: new Set(["passed", "failed", "unverifiable"]),
  independent_review: new Set(["not-reviewed", "in-progress", "consistent", "deviation", "uncertain"]),
  freshness: new Set(["valid", "expiring", "expired", "unknown"]),
  policy_decision: new Set(["accepted", "rejected", "manual-review"])
});
const LIFECYCLE_EVENT_FIELDS = Object.freeze([
  "schema_version",
  "event_id",
  "evidence_ref",
  "sequence",
  "from",
  "to",
  "reason_code",
  "occurred_at",
  "actor",
  "replacement_ref"
]);
const CONTRACT_BODY_FIELDS = Object.freeze([
  "schema_version",
  "contract_type",
  "lease_id",
  "evidence_ref",
  "lifecycle_sequence",
  "source_status_fingerprint",
  "status_checked_at",
  "issued_at",
  "evidence_expires_at",
  "max_cache_ttl_seconds",
  "ttl_expires_at",
  "status_query_uri",
  "fail_closed_on_ttl_expiry",
  "certification_issued"
]);
const EVENT_BODY_FIELDS = Object.freeze([
  "schema_version",
  "event_type",
  "event_id",
  "evidence_ref",
  "lifecycle_sequence",
  "source_event_id",
  "source_event_fingerprint",
  "occurred_at",
  "emitted_at",
  "replacement_ref",
  "delivery_semantics",
  "requires_immediate_invalidation",
  "certification_issued"
]);
const PROJECTION_FIELDS = Object.freeze([
  "schema_version",
  "consumer_id",
  "evidence_ref",
  "lease_id",
  "lease_fingerprint",
  "lifecycle_sequence",
  "projection_state",
  "invalidation_reason",
  "replacement_ref",
  "last_event_id",
  "last_event_fingerprint",
  "ttl_expires_at",
  "status_query_uri",
  "cached_at",
  "invalidated_at",
  "updated_at",
  "certification_issued"
]);

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

function exactObject(value, required, optional, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  if (!isObject(value)) fail(code, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(EVIDENCE_INVALIDATION_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_INVALIDATION_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  if (typeof value !== "string" || !ID.test(value)) fail(code, `${label} is invalid`);
  return value;
}

function requireHash(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code, `${label} must be a sha256 fingerprint`);
  return value;
}

function requireSemver(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  if (typeof value !== "string" || !SEMVER.test(value)) fail(code, `${label} must be a strict semantic version`);
  return value;
}

function compareSemver(leftValue, rightValue) {
  const parse = (value) => {
    const match = value.match(SEMVER);
    return { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? [] };
  };
  const left = parse(leftValue);
  const right = parse(rightValue);
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left.prerelease[index]);
    const rightNumeric = /^\d+$/.test(right.prerelease[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(left.prerelease[index]) - Number(right.prerelease[index]);
      if (difference) return difference;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left.prerelease[index] !== right.prerelease[index]) {
      return left.prerelease[index] < right.prerelease[index] ? -1 : 1;
    }
  }
  return 0;
}

function canonicalInstant(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid) {
  if (typeof value !== "string") fail(code, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(code, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireHttpsUri(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  if (typeof value !== "string" || value.length > 2_048) fail(code, `${label} must be an HTTPS URI`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(code, `${label} must be an HTTPS URI`);
  }
  const sensitiveQuery = [...parsed.searchParams.keys()].some((key) => /(?:token|secret|password|credential|signature|api[-_]?key)/iu.test(key));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || sensitiveQuery) {
    fail(code, `${label} must be an HTTPS URI without credentials or a fragment`);
  }
  return parsed.toString();
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function normalizeReference(value, label, code = EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], [], label, code);
  if (value.object_type !== "evidence_version") fail(code, `${label}.object_type must equal evidence_version`);
  return {
    object_type: "evidence_version",
    object_id: requireId(value.object_id, `${label}.object_id`, code),
    version: requireSemver(value.version, `${label}.version`, code),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`, code)
  };
}

function referenceKey(value) {
  return `${value.tenant_id}\u0000${value.object_id}\u0000${value.version}`;
}

function normalizeStatusAxes(value, label) {
  const fields = Object.keys(STATUS_AXIS_VALUES);
  exactObject(value, fields, [], label, EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid);
  const normalized = {};
  for (const field of fields) {
    if (!STATUS_AXIS_VALUES[field].has(value[field])) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, `${label}.${field} is invalid`);
    }
    normalized[field] = value[field];
  }
  return normalized;
}

function normalizeLifecycleState(value, label) {
  if (!["draft", "validating", "sealed", "published", "expired", "superseded", "revoked"].includes(value)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, `${label} is invalid`);
  }
  return value;
}

function normalizeLifecycleEvent(value) {
  exactObject(value, LIFECYCLE_EVENT_FIELDS, [], "lifecycleEvent", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid);
  if (value.schema_version !== EVIDENCE_INVALIDATION_VERSION) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "lifecycleEvent.schema_version is invalid");
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "lifecycleEvent.sequence is invalid");
  }
  for (const field of ["from", "to"]) {
    exactObject(value[field], ["lifecycle_state", "status_axes"], [], `lifecycleEvent.${field}`, EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid);
  }
  exactObject(value.actor, ["actor_id", "actor_role"], [], "lifecycleEvent.actor", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid);
  const event = {
    schema_version: EVIDENCE_INVALIDATION_VERSION,
    event_id: requireId(value.event_id, "lifecycleEvent.event_id", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid),
    evidence_ref: normalizeReference(value.evidence_ref, "lifecycleEvent.evidence_ref", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid),
    sequence: value.sequence,
    from: {
      lifecycle_state: normalizeLifecycleState(value.from.lifecycle_state, "lifecycleEvent.from.lifecycle_state"),
      status_axes: normalizeStatusAxes(value.from.status_axes, "lifecycleEvent.from.status_axes")
    },
    to: {
      lifecycle_state: normalizeLifecycleState(value.to.lifecycle_state, "lifecycleEvent.to.lifecycle_state"),
      status_axes: normalizeStatusAxes(value.to.status_axes, "lifecycleEvent.to.status_axes")
    },
    reason_code: requireId(value.reason_code, "lifecycleEvent.reason_code", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid),
    occurred_at: canonicalInstant(value.occurred_at, "lifecycleEvent.occurred_at", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid),
    actor: {
      actor_id: requireId(value.actor.actor_id, "lifecycleEvent.actor.actor_id", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid),
      actor_role: requireId(value.actor.actor_role, "lifecycleEvent.actor.actor_role", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid)
    },
    replacement_ref: value.replacement_ref === null
      ? null
      : normalizeReference(value.replacement_ref, "lifecycleEvent.replacement_ref", EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid)
  };
  const terminal = {
    validity_elapsed: { state: "expired", type: "evidence.expired" },
    replacement_published: { state: "superseded", type: "evidence.superseded" },
    revocation_authorized: { state: "revoked", type: "evidence.revoked" }
  }[event.reason_code];
  if (!terminal
    || event.from.lifecycle_state !== "published"
    || event.to.lifecycle_state !== terminal.state) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "lifecycleEvent must be one published-to-terminal Evidence Core transition");
  }
  if (!TERMINAL_REASON_ROLES[event.reason_code].has(event.actor.actor_role)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "lifecycleEvent actor is not authorized for the terminal reason");
  }
  if (terminal.state === "expired" && event.to.status_axes.freshness !== "expired") {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "expiration requires freshness=expired");
  }
  if (terminal.state === "superseded") {
    if (!event.replacement_ref
      || event.replacement_ref.tenant_id !== event.evidence_ref.tenant_id
      || event.replacement_ref.object_id !== event.evidence_ref.object_id
      || compareSemver(event.replacement_ref.version, event.evidence_ref.version) <= 0) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.replacementInvalid, "supersession requires a higher exact replacement version for the same tenant-scoped object");
    }
  } else if (event.replacement_ref !== null) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.replacementInvalid, "only supersession may carry replacement_ref");
  }
  return { event, eventType: terminal.type };
}

function bodyFrom(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function fingerprint(value, fields) {
  return digestEvidenceBytes(canonicalizeEvidenceValue(bodyFrom(value, fields)));
}

function addSeconds(instant, seconds) {
  return new Date(Date.parse(instant) + seconds * 1_000).toISOString();
}

function earlierInstant(left, right) {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function normalizeContract(value) {
  exactObject(value, [...CONTRACT_BODY_FIELDS, "contract_fingerprint"], [], "contract", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid);
  if (value.schema_version !== EVIDENCE_INVALIDATION_VERSION || value.contract_type !== "evidence_status_lease") {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid, "contract type or version is invalid");
  }
  const contract = {
    schema_version: EVIDENCE_INVALIDATION_VERSION,
    contract_type: "evidence_status_lease",
    lease_id: requireId(value.lease_id, "contract.lease_id", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    evidence_ref: normalizeReference(value.evidence_ref, "contract.evidence_ref", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    lifecycle_sequence: value.lifecycle_sequence,
    source_status_fingerprint: requireHash(value.source_status_fingerprint, "contract.source_status_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    status_checked_at: canonicalInstant(value.status_checked_at, "contract.status_checked_at", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    issued_at: canonicalInstant(value.issued_at, "contract.issued_at", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    evidence_expires_at: canonicalInstant(value.evidence_expires_at, "contract.evidence_expires_at", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    max_cache_ttl_seconds: value.max_cache_ttl_seconds,
    ttl_expires_at: canonicalInstant(value.ttl_expires_at, "contract.ttl_expires_at", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    status_query_uri: requireHttpsUri(value.status_query_uri, "contract.status_query_uri", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid),
    fail_closed_on_ttl_expiry: value.fail_closed_on_ttl_expiry,
    certification_issued: value.certification_issued,
    contract_fingerprint: requireHash(value.contract_fingerprint, "contract.contract_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid)
  };
  if (!Number.isSafeInteger(contract.lifecycle_sequence) || contract.lifecycle_sequence < 1
    || !Number.isSafeInteger(contract.max_cache_ttl_seconds)
    || contract.max_cache_ttl_seconds < 1
    || contract.max_cache_ttl_seconds > MAX_CACHE_TTL_SECONDS) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, "contract sequence or TTL is invalid");
  }
  if (contract.fail_closed_on_ttl_expiry !== true || contract.certification_issued !== false) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid, "contract trust-boundary flags are invalid");
  }
  if (Date.parse(contract.status_checked_at) > Date.parse(contract.issued_at)
    || Date.parse(contract.evidence_expires_at) <= Date.parse(contract.issued_at)
    || Date.parse(contract.ttl_expires_at) <= Date.parse(contract.issued_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "contract chronology is invalid");
  }
  const expectedTtlExpiry = earlierInstant(
    addSeconds(contract.status_checked_at, contract.max_cache_ttl_seconds),
    contract.evidence_expires_at
  );
  if (contract.ttl_expires_at !== expectedTtlExpiry) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, "contract.ttl_expires_at is not the bounded TTL deadline");
  }
  if (contract.contract_fingerprint !== fingerprint(contract, CONTRACT_BODY_FIELDS)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.contractFingerprintMismatch, "contract fingerprint is invalid");
  }
  return contract;
}

function normalizeInvalidationEvent(value) {
  exactObject(value, [...EVENT_BODY_FIELDS, "event_fingerprint"], [], "event", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid);
  const event = {
    schema_version: value.schema_version,
    event_type: value.event_type,
    event_id: requireId(value.event_id, "event.event_id", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    evidence_ref: normalizeReference(value.evidence_ref, "event.evidence_ref", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    lifecycle_sequence: value.lifecycle_sequence,
    source_event_id: requireId(value.source_event_id, "event.source_event_id", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    source_event_fingerprint: requireHash(value.source_event_fingerprint, "event.source_event_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    occurred_at: canonicalInstant(value.occurred_at, "event.occurred_at", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    emitted_at: canonicalInstant(value.emitted_at, "event.emitted_at", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    replacement_ref: value.replacement_ref === null
      ? null
      : normalizeReference(value.replacement_ref, "event.replacement_ref", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid),
    delivery_semantics: value.delivery_semantics,
    requires_immediate_invalidation: value.requires_immediate_invalidation,
    certification_issued: value.certification_issued,
    event_fingerprint: requireHash(value.event_fingerprint, "event.event_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid)
  };
  if (event.schema_version !== EVIDENCE_INVALIDATION_VERSION
    || !EVENT_TYPE_SET.has(event.event_type)
    || !Number.isSafeInteger(event.lifecycle_sequence)
    || event.lifecycle_sequence < 1
    || event.delivery_semantics !== "at-least-once"
    || event.requires_immediate_invalidation !== true
    || event.certification_issued !== false) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.eventInvalid, "event contract fields are invalid");
  }
  if (Date.parse(event.emitted_at) < Date.parse(event.occurred_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "event.emitted_at cannot predate event.occurred_at");
  }
  if ((event.event_type === "evidence.superseded") !== (event.replacement_ref !== null)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.replacementInvalid, "only supersession requires replacement_ref");
  }
  if (event.replacement_ref
    && (event.replacement_ref.tenant_id !== event.evidence_ref.tenant_id
      || event.replacement_ref.object_id !== event.evidence_ref.object_id
      || compareSemver(event.replacement_ref.version, event.evidence_ref.version) <= 0)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.replacementInvalid, "event replacement_ref is invalid");
  }
  if (event.event_fingerprint !== fingerprint(event, EVENT_BODY_FIELDS)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.eventFingerprintMismatch, "event fingerprint is invalid");
  }
  return event;
}

function normalizeProjection(value) {
  exactObject(value, PROJECTION_FIELDS, [], "projection", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid);
  const projection = {
    schema_version: value.schema_version,
    consumer_id: requireId(value.consumer_id, "projection.consumer_id", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    evidence_ref: normalizeReference(value.evidence_ref, "projection.evidence_ref", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    lease_id: requireId(value.lease_id, "projection.lease_id", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    lease_fingerprint: requireHash(value.lease_fingerprint, "projection.lease_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    lifecycle_sequence: value.lifecycle_sequence,
    projection_state: value.projection_state,
    invalidation_reason: value.invalidation_reason,
    replacement_ref: value.replacement_ref === null
      ? null
      : normalizeReference(value.replacement_ref, "projection.replacement_ref", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    last_event_id: value.last_event_id,
    last_event_fingerprint: value.last_event_fingerprint,
    ttl_expires_at: canonicalInstant(value.ttl_expires_at, "projection.ttl_expires_at", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    status_query_uri: requireHttpsUri(value.status_query_uri, "projection.status_query_uri", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    cached_at: canonicalInstant(value.cached_at, "projection.cached_at", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    invalidated_at: value.invalidated_at,
    updated_at: canonicalInstant(value.updated_at, "projection.updated_at", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid),
    certification_issued: value.certification_issued
  };
  if (projection.schema_version !== EVIDENCE_INVALIDATION_VERSION
    || !Number.isSafeInteger(projection.lifecycle_sequence)
    || projection.lifecycle_sequence < 1
    || !["current", "invalidated"].includes(projection.projection_state)
    || projection.certification_issued !== false) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "projection contract fields are invalid");
  }
  if (projection.projection_state === "current") {
    if (projection.invalidation_reason !== null
      || projection.replacement_ref !== null
      || projection.last_event_id !== null
      || projection.last_event_fingerprint !== null
      || projection.invalidated_at !== null) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "current projection carries invalidation fields");
    }
  } else {
    if (!["expired", "superseded", "revoked", "ttl_elapsed"].includes(projection.invalidation_reason)
      || typeof projection.invalidated_at !== "string") {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "invalidated projection lacks an invalidation result");
    }
    canonicalInstant(projection.invalidated_at, "projection.invalidated_at", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid);
    const eventDriven = projection.invalidation_reason !== "ttl_elapsed";
    if (eventDriven !== (projection.last_event_id !== null && projection.last_event_fingerprint !== null)) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "projection event fields are inconsistent");
    }
    if (projection.last_event_id !== null) requireId(projection.last_event_id, "projection.last_event_id", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid);
    if (projection.last_event_fingerprint !== null) requireHash(projection.last_event_fingerprint, "projection.last_event_fingerprint", EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid);
    if ((projection.invalidation_reason === "superseded") !== (projection.replacement_ref !== null)) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "projection replacement fields are inconsistent");
    }
    if (Date.parse(projection.invalidated_at) > Date.parse(projection.updated_at)
      || (projection.invalidation_reason === "ttl_elapsed" && projection.invalidated_at !== projection.ttl_expires_at)) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "projection invalidation chronology is inconsistent");
    }
  }
  if (Date.parse(projection.updated_at) < Date.parse(projection.cached_at)
    || Date.parse(projection.cached_at) >= Date.parse(projection.ttl_expires_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionInvalid, "projection.updated_at predates projection.cached_at");
  }
  return projection;
}

export function createEvidenceTtlContract(input) {
  exactObject(input, [
    "leaseId",
    "evidenceRef",
    "lifecycleSequence",
    "sourceStatusFingerprint",
    "statusCheckedAt",
    "issuedAt",
    "evidenceExpiresAt",
    "maxCacheTtlSeconds",
    "statusQueryUri"
  ], [], "input");
  const issuedAt = canonicalInstant(input.issuedAt, "input.issuedAt");
  const evidenceExpiresAt = canonicalInstant(input.evidenceExpiresAt, "input.evidenceExpiresAt");
  if (!Number.isSafeInteger(input.maxCacheTtlSeconds)
    || input.maxCacheTtlSeconds < 1
    || input.maxCacheTtlSeconds > MAX_CACHE_TTL_SECONDS) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, `input.maxCacheTtlSeconds must be 1-${MAX_CACHE_TTL_SECONDS}`);
  }
  const body = {
    schema_version: EVIDENCE_INVALIDATION_VERSION,
    contract_type: "evidence_status_lease",
    lease_id: requireId(input.leaseId, "input.leaseId"),
    evidence_ref: normalizeReference(input.evidenceRef, "input.evidenceRef"),
    lifecycle_sequence: input.lifecycleSequence,
    source_status_fingerprint: requireHash(input.sourceStatusFingerprint, "input.sourceStatusFingerprint"),
    status_checked_at: canonicalInstant(input.statusCheckedAt, "input.statusCheckedAt"),
    issued_at: issuedAt,
    evidence_expires_at: evidenceExpiresAt,
    max_cache_ttl_seconds: input.maxCacheTtlSeconds,
    ttl_expires_at: earlierInstant(addSeconds(input.statusCheckedAt, input.maxCacheTtlSeconds), evidenceExpiresAt),
    status_query_uri: requireHttpsUri(input.statusQueryUri, "input.statusQueryUri"),
    fail_closed_on_ttl_expiry: true,
    certification_issued: false
  };
  if (!Number.isSafeInteger(body.lifecycle_sequence) || body.lifecycle_sequence < 1) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.contractInvalid, "input.lifecycleSequence is invalid");
  }
  if (Date.parse(body.status_checked_at) > Date.parse(body.issued_at)
    || Date.parse(body.evidence_expires_at) <= Date.parse(body.issued_at)
    || Date.parse(body.ttl_expires_at) <= Date.parse(body.issued_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "TTL contract chronology is invalid");
  }
  return deepFreeze({ ...body, contract_fingerprint: fingerprint(body, CONTRACT_BODY_FIELDS) });
}

export function verifyEvidenceTtlContract(contract) {
  return deepFreeze(normalizeContract(contract));
}

export function createEvidenceInvalidationEvent(input) {
  exactObject(input, ["eventId", "lifecycleEvent", "emittedAt"], [], "input");
  const { event: lifecycleEvent, eventType } = normalizeLifecycleEvent(input.lifecycleEvent);
  const emittedAt = canonicalInstant(input.emittedAt, "input.emittedAt");
  if (Date.parse(emittedAt) < Date.parse(lifecycleEvent.occurred_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "input.emittedAt cannot predate the lifecycle event");
  }
  const body = {
    schema_version: EVIDENCE_INVALIDATION_VERSION,
    event_type: eventType,
    event_id: requireId(input.eventId, "input.eventId"),
    evidence_ref: lifecycleEvent.evidence_ref,
    lifecycle_sequence: lifecycleEvent.sequence,
    source_event_id: lifecycleEvent.event_id,
    source_event_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(lifecycleEvent)),
    occurred_at: lifecycleEvent.occurred_at,
    emitted_at: emittedAt,
    replacement_ref: lifecycleEvent.replacement_ref,
    delivery_semantics: "at-least-once",
    requires_immediate_invalidation: true,
    certification_issued: false
  };
  return deepFreeze({ ...body, event_fingerprint: fingerprint(body, EVENT_BODY_FIELDS) });
}

export function verifyEvidenceInvalidationEvent(event, options = {}) {
  exactObject(options, [], ["sourceLifecycleEvent"], "options");
  const normalizedEvent = normalizeInvalidationEvent(event);
  if (options.sourceLifecycleEvent !== undefined) {
    const source = normalizeLifecycleEvent(options.sourceLifecycleEvent);
    const sourceFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(source.event));
    if (source.eventType !== normalizedEvent.event_type
      || source.event.event_id !== normalizedEvent.source_event_id
      || source.event.sequence !== normalizedEvent.lifecycle_sequence
      || referenceKey(source.event.evidence_ref) !== referenceKey(normalizedEvent.evidence_ref)
      || source.event.occurred_at !== normalizedEvent.occurred_at
      || canonicalizeEvidenceValue(source.event.replacement_ref) !== canonicalizeEvidenceValue(normalizedEvent.replacement_ref)
      || sourceFingerprint !== normalizedEvent.source_event_fingerprint) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, "event does not match the supplied source lifecycle event");
    }
  }
  return deepFreeze(normalizedEvent);
}

export function createEvidenceDownstreamProjection(input) {
  exactObject(input, ["consumerId", "contract", "cachedAt"], [], "input");
  const contract = normalizeContract(input.contract);
  const cachedAt = canonicalInstant(input.cachedAt, "input.cachedAt");
  if (Date.parse(cachedAt) < Date.parse(contract.issued_at)
    || Date.parse(cachedAt) >= Date.parse(contract.ttl_expires_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, "input.cachedAt is outside the status lease");
  }
  return deepFreeze({
    schema_version: EVIDENCE_INVALIDATION_VERSION,
    consumer_id: requireId(input.consumerId, "input.consumerId"),
    evidence_ref: contract.evidence_ref,
    lease_id: contract.lease_id,
    lease_fingerprint: contract.contract_fingerprint,
    lifecycle_sequence: contract.lifecycle_sequence,
    projection_state: "current",
    invalidation_reason: null,
    replacement_ref: null,
    last_event_id: null,
    last_event_fingerprint: null,
    ttl_expires_at: contract.ttl_expires_at,
    status_query_uri: contract.status_query_uri,
    cached_at: cachedAt,
    invalidated_at: null,
    updated_at: cachedAt,
    certification_issued: false
  });
}

export function consumeEvidenceInvalidationEvent(projectionInput, eventInput, options) {
  exactObject(options, ["consumedAt"], [], "options");
  const projection = normalizeProjection(projectionInput);
  const event = normalizeInvalidationEvent(eventInput);
  const consumedAt = canonicalInstant(options.consumedAt, "options.consumedAt");
  if (referenceKey(projection.evidence_ref) !== referenceKey(event.evidence_ref)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.referenceMismatch, "event targets a different evidence version");
  }
  if (Date.parse(consumedAt) < Date.parse(event.emitted_at)
    || Date.parse(consumedAt) < Date.parse(projection.updated_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "event consumption chronology is invalid");
  }
  if (projection.last_event_id === event.event_id) {
    if (projection.last_event_fingerprint !== event.event_fingerprint) {
      fail(EVIDENCE_INVALIDATION_ERROR_CODES.eventIdConflict, "event ID was reused with different content");
    }
    return deepFreeze({ projection: deepFreeze(projection), applied: false, idempotent_replay: true });
  }
  if (projection.projection_state === "invalidated" && projection.invalidation_reason !== "ttl_elapsed") {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.projectionTerminal, "projection was already invalidated by another terminal event");
  }
  if (event.lifecycle_sequence <= projection.lifecycle_sequence) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.eventStale, "event does not advance the observed lifecycle sequence");
  }
  const reason = event.event_type.slice("evidence.".length);
  const next = {
    ...projection,
    lifecycle_sequence: event.lifecycle_sequence,
    projection_state: "invalidated",
    invalidation_reason: reason,
    replacement_ref: event.replacement_ref,
    last_event_id: event.event_id,
    last_event_fingerprint: event.event_fingerprint,
    invalidated_at: event.occurred_at,
    updated_at: consumedAt
  };
  return deepFreeze({ projection: deepFreeze(next), applied: true, idempotent_replay: false });
}

export function evaluateEvidenceDownstreamTtl(projectionInput, options) {
  exactObject(options, ["evaluatedAt"], [], "options");
  const projection = normalizeProjection(projectionInput);
  const evaluatedAt = canonicalInstant(options.evaluatedAt, "options.evaluatedAt");
  if (Date.parse(evaluatedAt) < Date.parse(projection.updated_at)) {
    fail(EVIDENCE_INVALIDATION_ERROR_CODES.timeInvalid, "TTL evaluation predates the current projection");
  }
  if (projection.projection_state === "invalidated") {
    return deepFreeze({ projection: deepFreeze(projection), invalidated: false, idempotent_replay: true });
  }
  if (Date.parse(evaluatedAt) < Date.parse(projection.ttl_expires_at)) {
    return deepFreeze({ projection: deepFreeze(projection), invalidated: false, idempotent_replay: false });
  }
  return deepFreeze({
    projection: deepFreeze({
      ...projection,
      projection_state: "invalidated",
      invalidation_reason: "ttl_elapsed",
      replacement_ref: null,
      last_event_id: null,
      last_event_fingerprint: null,
      invalidated_at: projection.ttl_expires_at,
      updated_at: evaluatedAt
    }),
    invalidated: true,
    idempotent_replay: false
  });
}

export function replayEvidenceInvalidationEvents(projectionInput, deliveries, options) {
  if (!Array.isArray(deliveries)) fail(EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid, "deliveries must be an array");
  exactObject(options, ["evaluatedAt"], [], "options");
  let projection = normalizeProjection(projectionInput);
  for (const [index, delivery] of deliveries.entries()) {
    exactObject(delivery, ["event", "consumed_at"], [], `deliveries[${index}]`);
    projection = consumeEvidenceInvalidationEvent(projection, delivery.event, {
      consumedAt: delivery.consumed_at
    }).projection;
  }
  return evaluateEvidenceDownstreamTtl(projection, { evaluatedAt: options.evaluatedAt }).projection;
}
