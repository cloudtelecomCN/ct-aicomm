import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import {
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "./index.mjs";
import {
  PASSPORT_OBSERVATION_ORIGINS,
  verifyPassportNormalizedObservation
} from "./observation.mjs";

export const PASSPORT_VERSIONING_VERSION = "1.0.0";
export const PASSPORT_VERSION_STATES = Object.freeze(["sealed", "expired", "superseded", "revoked"]);

export const PASSPORT_VERSIONING_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_version_input_invalid",
  fieldUnknown: "passport_version_field_unknown",
  fieldMissing: "passport_version_field_missing",
  fingerprintMismatch: "passport_version_fingerprint_mismatch",
  contextMismatch: "passport_version_context_mismatch",
  observationRequired: "passport_version_observation_required",
  duplicateObservation: "passport_version_duplicate_observation",
  timeInvalid: "passport_version_time_invalid",
  versionInvalid: "passport_version_semver_invalid",
  lineageInvalid: "passport_version_lineage_invalid",
  statusInvalid: "passport_version_status_invalid",
  terminalEventInvalid: "passport_version_terminal_event_invalid",
  eventHistoryInvalid: "passport_version_event_history_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ORIGIN_ORDER = new Map(PASSPORT_OBSERVATION_ORIGINS.map((origin, index) => [origin, index]));
const TERMINAL_STATES = new Set(["expired", "superseded", "revoked"]);
const TERMINAL_REASONS = Object.freeze({
  expired: "validity_elapsed",
  superseded: "replacement_published",
  revoked: "revocation_authorized"
});
const EVENT_ROLES = Object.freeze({
  expired: new Set(["system", "operator"]),
  superseded: new Set(["publisher"]),
  revoked: new Set(["publisher", "operator"])
});
const MEASUREMENT_VALIDITY = new Set(["sufficient", "partial", "invalid", "unknown"]);

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
  if (!isObject(value)) fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_VERSIONING_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_VERSIONING_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 500, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireHash(value, label) {
  return requireString(value, label, { max: 71, pattern: HASH });
}

function requireSemver(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.versionInvalid, `${label} must be an exact semantic version`);
  }
  return value;
}

function parseSemver(value, label) {
  const version = requireSemver(value, label);
  const match = version.match(SEMVER);
  return { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? [] };
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue, "left version");
  const right = parseSemver(rightValue, "right version");
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
      if (difference !== 0) return difference;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left.prerelease[index] !== right.prerelease[index]) {
      return left.prerelease[index] < right.prerelease[index] ? -1 : 1;
    }
  }
  return 0;
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function uniqueSorted(values, label, normalize) {
  if (!Array.isArray(values)) fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must be an array`);
  const normalized = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const serialized = normalized.map((value) => canonicalizeEvidenceValue(value));
  if (new Set(serialized).size !== normalized.length) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.duplicateObservation, `${label} contains duplicate entries`);
  }
  return normalized.sort((left, right) => canonicalizeEvidenceValue(left).localeCompare(canonicalizeEvidenceValue(right)));
}

function normalizeAuthorizationScope(value, label) {
  exactObject(value, ["visibility", "purpose", "recipients", "expires_at"], [], label);
  const visibility = requireString(value.visibility, `${label}.visibility`, { pattern: /^(private|shared|public)$/ });
  const recipients = uniqueSorted(value.recipients, `${label}.recipients`, (recipient, location) => requireId(recipient, location));
  if (visibility !== "private" && recipients.length === 0) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label}.recipients must identify the shared or public audience`);
  }
  return {
    visibility,
    purpose: requireString(value.purpose, `${label}.purpose`, { min: 3, max: 240 }),
    recipients,
    expires_at: value.expires_at === null ? null : canonicalInstant(value.expires_at, `${label}.expires_at`)
  };
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const reference = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the passport tenant`);
  }
  return reference;
}

function runReference(run) {
  return {
    object_type: "run",
    object_id: run.run_id,
    version: run.version,
    tenant_id: run.tenant_id,
    content_fingerprint: run.content_fingerprint
  };
}

function freezeReference(freeze) {
  return {
    object_type: "passport_scenario_method_freeze",
    object_id: freeze.freeze_id,
    version: freeze.version,
    tenant_id: freeze.tenant_id,
    content_fingerprint: freeze.content_fingerprint
  };
}

function observationReference(observation) {
  return {
    object_type: "observation",
    object_id: observation.observation_id,
    version: observation.version,
    tenant_id: observation.tenant_id,
    content_fingerprint: observation.content_fingerprint
  };
}

function passportReference(version) {
  return {
    object_type: "passport_evidence_version",
    object_id: version.passport_id,
    version: version.version,
    tenant_id: version.tenant_id,
    content_fingerprint: version.content_fingerprint
  };
}

function referencesMatch(left, right) {
  return canonicalizeEvidenceValue(left) === canonicalizeEvidenceValue(right);
}

function normalizeObservationSets(value, tenantId, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.observationRequired, `${label} must contain at least one origin-separated observation set`);
  }
  const seenOrigins = new Set();
  const seenObservations = new Set();
  const result = value.map((set, index) => {
    const location = `${label}[${index}]`;
    exactObject(set, ["origin", "observation_refs"], [], location);
    const origin = requireString(set.origin, `${location}.origin`, { pattern: /^(measured|synthetic|inferred|declared)$/ });
    if (seenOrigins.has(origin)) fail(PASSPORT_VERSIONING_ERROR_CODES.duplicateObservation, `${label} repeats origin ${origin}`);
    seenOrigins.add(origin);
    const observationRefs = uniqueSorted(
      set.observation_refs,
      `${location}.observation_refs`,
      (reference, referenceLocation) => normalizeReference(reference, "observation", tenantId, referenceLocation)
    );
    if (observationRefs.length === 0) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.observationRequired, `${location}.observation_refs must not be empty`);
    }
    for (const reference of observationRefs) {
      const identity = `${reference.object_id}@${reference.version}`;
      if (seenObservations.has(identity)) {
        fail(PASSPORT_VERSIONING_ERROR_CODES.duplicateObservation, `${label} repeats observation ${identity}`);
      }
      seenObservations.add(identity);
    }
    return { origin, observation_refs: observationRefs };
  });
  return result.sort((left, right) => ORIGIN_ORDER.get(left.origin) - ORIGIN_ORDER.get(right.origin));
}

function deriveObservationSets(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const references = groups.get(observation.source.origin) ?? [];
    references.push(observationReference(observation));
    groups.set(observation.source.origin, references);
  }
  return [...groups.entries()]
    .map(([origin, observationRefs]) => ({
      origin,
      observation_refs: observationRefs.sort((left, right) => canonicalizeEvidenceValue(left).localeCompare(canonicalizeEvidenceValue(right)))
    }))
    .sort((left, right) => ORIGIN_ORDER.get(left.origin) - ORIGIN_ORDER.get(right.origin));
}

function deriveMeasurementValidity(observations) {
  const statuses = observations.map(({ quality }) => quality.status);
  if (statuses.includes("invalid")) return "invalid";
  if (statuses.every((status) => status === "valid")) return "sufficient";
  if (statuses.includes("partial") || statuses.includes("valid")) return "partial";
  return "unknown";
}

function normalizeStatusSeed(value, label) {
  exactObject(value, ["measurement_validity", "content_integrity", "independent_review", "freshness", "policy_decision"], [], label);
  const status = {
    measurement_validity: requireString(value.measurement_validity, `${label}.measurement_validity`),
    content_integrity: requireString(value.content_integrity, `${label}.content_integrity`),
    independent_review: requireString(value.independent_review, `${label}.independent_review`),
    freshness: requireString(value.freshness, `${label}.freshness`),
    policy_decision: requireString(value.policy_decision, `${label}.policy_decision`)
  };
  if (!MEASUREMENT_VALIDITY.has(status.measurement_validity)
      || status.content_integrity !== "passed"
      || status.independent_review !== "not-reviewed"
      || status.freshness !== "valid"
      || status.policy_decision !== "manual-review") {
    fail(PASSPORT_VERSIONING_ERROR_CODES.statusInvalid, `${label} must be derived for this exact new version and cannot inherit review, freshness, or policy state`);
  }
  return status;
}

function normalizeBoundary(value, label) {
  exactObject(value, [
    "immutable", "origin_separated", "review_inherited", "freshness_inherited",
    "performance_claim_allowed", "certification_issued"
  ], [], label);
  if (value.immutable !== true
      || value.origin_separated !== true
      || value.review_inherited !== false
      || value.freshness_inherited !== false
      || value.performance_claim_allowed !== false
      || value.certification_issued !== false) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.statusInvalid, `${label} must preserve immutable, origin-separated, non-inherited status boundaries`);
  }
  return {
    immutable: true,
    origin_separated: true,
    review_inherited: false,
    freshness_inherited: false,
    performance_claim_allowed: false,
    certification_issued: false
  };
}

function addSeconds(instant, seconds) {
  return new Date(Date.parse(instant) + seconds * 1000).toISOString();
}

function fingerprintBody(body) {
  return digestEvidenceBytes(Buffer.from(canonicalizeEvidenceValue(body), "utf8"));
}

function normalizeVersionBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "passport_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "sealed_at", "freshness_ttl_seconds", "valid_until", "supersedes_ref",
    "freeze_ref", "run_ref", "observation_sets", "status_seed", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_VERSIONING_VERSION || value.record_type !== "passport_evidence_version") {
    fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const sealedAt = canonicalInstant(value.sealed_at, `${label}.sealed_at`);
  const createdAt = canonicalInstant(value.created_at, `${label}.created_at`);
  if (createdAt !== sealedAt) fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, `${label}.created_at must equal sealed_at`);
  const freshnessTtlSeconds = requireInteger(value.freshness_ttl_seconds, `${label}.freshness_ttl_seconds`, 60, 31536000);
  const validUntil = canonicalInstant(value.valid_until, `${label}.valid_until`);
  if (validUntil !== addSeconds(sealedAt, freshnessTtlSeconds)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, `${label}.valid_until must be derived from sealed_at and freshness_ttl_seconds`);
  }
  const authorizationScope = normalizeAuthorizationScope(value.authorization_scope, `${label}.authorization_scope`);
  if (authorizationScope.expires_at !== null && Date.parse(validUntil) > Date.parse(authorizationScope.expires_at)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, `${label}.valid_until cannot outlive its authorization scope`);
  }
  return {
    schema_version: PASSPORT_VERSIONING_VERSION,
    record_type: "passport_evidence_version",
    passport_id: requireId(value.passport_id, `${label}.passport_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: createdAt,
    authorization_scope: authorizationScope,
    sealed_at: sealedAt,
    freshness_ttl_seconds: freshnessTtlSeconds,
    valid_until: validUntil,
    supersedes_ref: value.supersedes_ref === null
      ? null
      : normalizeReference(value.supersedes_ref, "passport_evidence_version", tenantId, `${label}.supersedes_ref`),
    freeze_ref: normalizeReference(value.freeze_ref, "passport_scenario_method_freeze", tenantId, `${label}.freeze_ref`),
    run_ref: normalizeReference(value.run_ref, "run", tenantId, `${label}.run_ref`),
    observation_sets: normalizeObservationSets(value.observation_sets, tenantId, `${label}.observation_sets`),
    status_seed: normalizeStatusSeed(value.status_seed, `${label}.status_seed`),
    boundary: normalizeBoundary(value.boundary, `${label}.boundary`)
  };
}

function verifyVersionRecord(record, label = "record") {
  if (!isObject(record)) fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  exactObject(record, [
    "schema_version", "record_type", "passport_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "sealed_at", "freshness_ttl_seconds", "valid_until", "supersedes_ref",
    "freeze_ref", "run_ref", "observation_sets", "status_seed", "boundary", "content_fingerprint"
  ], [], label);
  const { content_fingerprint: suppliedFingerprint, ...candidate } = record;
  const body = normalizeVersionBody(candidate, label);
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, `${label}.content_fingerprint`) !== expectedFingerprint) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the sealed passport version`);
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

function verifyVersionContext(version, runInput, freezeInput, observationInputs) {
  const run = verifyPassportRunBinding(runInput);
  const freeze = verifyPassportScenarioMethodFreeze(freezeInput);
  if (run.state !== "started" || run.started_at === null) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch, "a passport version requires an exact started run");
  }
  if (!Array.isArray(observationInputs) || observationInputs.length === 0) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.observationRequired, "a passport version requires at least one normalized observation");
  }
  const observations = observationInputs.map((record) => verifyPassportNormalizedObservation({ record, run, freeze }));
  const identitySet = new Set(observations.map(({ observation_id: id, version: observationVersion }) => `${id}@${observationVersion}`));
  if (identitySet.size !== observations.length) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.duplicateObservation, "a passport version cannot seal the same observation identity twice");
  }
  if (version.tenant_id !== run.tenant_id || version.tenant_id !== freeze.tenant_id
      || !referencesMatch(version.run_ref, runReference(run))
      || !referencesMatch(version.freeze_ref, freezeReference(freeze))) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch, "passport version, started run, and freeze must bind exactly within one tenant");
  }
  if (Date.parse(version.sealed_at) < Date.parse(run.planned_window.ends_at)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, "sealed_at must be at or after the frozen run window ends");
  }
  if (observations.some((observation) => Date.parse(observation.created_at) > Date.parse(version.sealed_at))) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, "every observation must exist before the passport version is sealed");
  }
  const expectedSets = deriveObservationSets(observations);
  if (!referencesMatch(version.observation_sets, expectedSets)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch, "observation_sets must contain each verified observation in its original origin group");
  }
  if (version.status_seed.measurement_validity !== deriveMeasurementValidity(observations)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.statusInvalid, "measurement_validity must be derived from this version's exact observation qualities");
  }
  return { run, freeze, observations };
}

function buildVersion(input, previousVersion) {
  const run = verifyPassportRunBinding(input.run);
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  if (!Array.isArray(input.observations) || input.observations.length === 0) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.observationRequired, "input.observations must not be empty");
  }
  const observations = input.observations.map((record) => verifyPassportNormalizedObservation({ record, run, freeze }));
  const sealedAt = canonicalInstant(input.sealed_at, "input.sealed_at");
  const freshnessTtlSeconds = requireInteger(input.freshness_ttl_seconds, "input.freshness_ttl_seconds", 60, 31536000);
  const statusSeed = {
    measurement_validity: deriveMeasurementValidity(observations),
    content_integrity: "passed",
    independent_review: "not-reviewed",
    freshness: "valid",
    policy_decision: "manual-review"
  };
  const body = normalizeVersionBody({
    schema_version: PASSPORT_VERSIONING_VERSION,
    record_type: "passport_evidence_version",
    passport_id: input.passport_id,
    version: input.version,
    tenant_id: input.tenant_id,
    created_by: input.created_by,
    created_at: sealedAt,
    authorization_scope: run.authorization_scope,
    sealed_at: sealedAt,
    freshness_ttl_seconds: freshnessTtlSeconds,
    valid_until: addSeconds(sealedAt, freshnessTtlSeconds),
    supersedes_ref: previousVersion === null ? null : passportReference(previousVersion),
    freeze_ref: freezeReference(freeze),
    run_ref: runReference(run),
    observation_sets: deriveObservationSets(observations),
    status_seed: statusSeed,
    boundary: {
      immutable: true,
      origin_separated: true,
      review_inherited: false,
      freshness_inherited: false,
      performance_claim_allowed: false,
      certification_issued: false
    }
  });
  const version = deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
  verifyVersionContext(version, run, freeze, observations);
  return version;
}

export function createPassportEvidenceVersion(input) {
  exactObject(input, [
    "passport_id", "version", "tenant_id", "created_by", "sealed_at", "freshness_ttl_seconds",
    "run", "freeze", "observations"
  ], [], "input");
  return buildVersion(input, null);
}

export function createPassportReplacementVersion(input) {
  exactObject(input, [
    "previous_version", "version", "created_by", "sealed_at", "freshness_ttl_seconds",
    "run", "freeze", "observations"
  ], [], "input");
  const previous = verifyVersionRecord(input.previous_version, "input.previous_version");
  if (compareSemver(input.version, previous.version) <= 0) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid, "a replacement must use a higher exact semantic version");
  }
  return buildVersion({
    passport_id: previous.passport_id,
    version: input.version,
    tenant_id: previous.tenant_id,
    created_by: input.created_by,
    sealed_at: input.sealed_at,
    freshness_ttl_seconds: input.freshness_ttl_seconds,
    run: input.run,
    freeze: input.freeze,
    observations: input.observations
  }, previous);
}

export function verifyPassportEvidenceVersion(input) {
  exactObject(input, ["record", "run", "freeze", "observations"], ["previous_version"], "input");
  const version = verifyVersionRecord(input.record);
  verifyVersionContext(version, input.run, input.freeze, input.observations);
  if (version.supersedes_ref === null) {
    if (Object.hasOwn(input, "previous_version")) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid, "an initial passport version cannot supply previous_version");
    }
  } else {
    if (!Object.hasOwn(input, "previous_version")) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid, "a replacement passport version requires its exact previous_version");
    }
    const previous = verifyVersionRecord(input.previous_version, "input.previous_version");
    if (!referencesMatch(version.supersedes_ref, passportReference(previous))
        || version.passport_id !== previous.passport_id
        || version.tenant_id !== previous.tenant_id
        || compareSemver(version.version, previous.version) <= 0) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid, "supersedes_ref must bind the exact lower version of the same passport and tenant");
    }
  }
  return version;
}

function normalizeActor(value, toState, label) {
  exactObject(value, ["actor_id", "actor_role"], [], label);
  const actor = {
    actor_id: requireId(value.actor_id, `${label}.actor_id`),
    actor_role: requireId(value.actor_role, `${label}.actor_role`)
  };
  if (!EVENT_ROLES[toState].has(actor.actor_role)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${actor.actor_role} cannot record ${toState}`);
  }
  return actor;
}

function normalizeEventBoundary(value, label) {
  exactObject(value, ["append_only", "source_mutated", "certification_issued"], [], label);
  if (value.append_only !== true || value.source_mutated !== false || value.certification_issued !== false) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${label} must remain append-only and non-certifying`);
  }
  return { append_only: true, source_mutated: false, certification_issued: false };
}

function normalizeEventBody(value, label = "event") {
  exactObject(value, [
    "schema_version", "record_type", "event_id", "sequence", "passport_ref", "from_state", "to_state",
    "reason_code", "reason_detail", "occurred_at", "actor", "replacement_ref", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_VERSIONING_VERSION || value.record_type !== "passport_version_terminal_event") {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${label} has an unsupported contract version or record type`);
  }
  if (value.sequence !== 1 || value.from_state !== "sealed" || !TERMINAL_STATES.has(value.to_state)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${label} must be the single sealed-to-terminal event`);
  }
  if (value.reason_code !== TERMINAL_REASONS[value.to_state]) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${label}.reason_code does not match ${value.to_state}`);
  }
  const tenantId = requireId(value.passport_ref?.tenant_id, `${label}.passport_ref.tenant_id`);
  const replacementRef = value.replacement_ref === null
    ? null
    : normalizeReference(value.replacement_ref, "passport_evidence_version", tenantId, `${label}.replacement_ref`);
  if ((value.to_state === "superseded") !== (replacementRef !== null)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${label}.replacement_ref is required only for superseded`);
  }
  return {
    schema_version: PASSPORT_VERSIONING_VERSION,
    record_type: "passport_version_terminal_event",
    event_id: requireId(value.event_id, `${label}.event_id`),
    sequence: 1,
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    from_state: "sealed",
    to_state: value.to_state,
    reason_code: value.reason_code,
    reason_detail: requireString(value.reason_detail, `${label}.reason_detail`, { min: 3, max: 500 }),
    occurred_at: canonicalInstant(value.occurred_at, `${label}.occurred_at`),
    actor: normalizeActor(value.actor, value.to_state, `${label}.actor`),
    replacement_ref: replacementRef,
    boundary: normalizeEventBoundary(value.boundary, `${label}.boundary`)
  };
}

function verifyEventRecord(event, label = "event") {
  if (!isObject(event)) fail(PASSPORT_VERSIONING_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  exactObject(event, [
    "schema_version", "record_type", "event_id", "sequence", "passport_ref", "from_state", "to_state",
    "reason_code", "reason_detail", "occurred_at", "actor", "replacement_ref", "boundary", "content_fingerprint"
  ], [], label);
  const { content_fingerprint: suppliedFingerprint, ...candidate } = event;
  const body = normalizeEventBody(candidate, label);
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, `${label}.content_fingerprint`) !== expectedFingerprint) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the terminal event`);
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

function validateEventContext(event, version, replacementVersion) {
  if (!referencesMatch(event.passport_ref, passportReference(version))) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, "terminal event targets another passport version");
  }
  const eventMs = Date.parse(event.occurred_at);
  const sealedMs = Date.parse(version.sealed_at);
  const expiryMs = Date.parse(version.valid_until);
  if (eventMs < sealedMs) fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, "terminal event cannot precede sealing");
  if (event.to_state === "expired") {
    if (eventMs < expiryMs || replacementVersion !== null) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, "expired requires validity elapsed and forbids a replacement");
    }
    return;
  }
  if (eventMs >= expiryMs) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, `${event.to_state} cannot replace the already elapsed expiry terminal state`);
  }
  if (event.to_state === "superseded") {
    if (replacementVersion === null) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, "superseded requires the exact replacement version");
    }
    const replacement = verifyVersionRecord(replacementVersion, "replacement_version");
    if (!referencesMatch(event.replacement_ref, passportReference(replacement))
        || !referencesMatch(replacement.supersedes_ref, passportReference(version))
        || replacement.passport_id !== version.passport_id
        || replacement.tenant_id !== version.tenant_id
        || compareSemver(replacement.version, version.version) <= 0
        || Date.parse(replacement.sealed_at) > eventMs) {
      fail(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid, "supersession must bind an already sealed, higher exact replacement of the same passport");
    }
  } else if (replacementVersion !== null) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, "revoked forbids a replacement version");
  }
}

export function createPassportVersionTerminalEvent(input) {
  exactObject(input, [
    "event_id", "version", "to_state", "reason_detail", "occurred_at", "actor", "replacement_version"
  ], [], "input");
  const version = verifyVersionRecord(input.version, "input.version");
  const toState = requireString(input.to_state, "input.to_state");
  if (!TERMINAL_STATES.has(toState)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid, "input.to_state must be expired, superseded, or revoked");
  }
  const replacement = input.replacement_version === null
    ? null
    : verifyVersionRecord(input.replacement_version, "input.replacement_version");
  const body = normalizeEventBody({
    schema_version: PASSPORT_VERSIONING_VERSION,
    record_type: "passport_version_terminal_event",
    event_id: input.event_id,
    sequence: 1,
    passport_ref: passportReference(version),
    from_state: "sealed",
    to_state: toState,
    reason_code: TERMINAL_REASONS[toState],
    reason_detail: input.reason_detail,
    occurred_at: input.occurred_at,
    actor: input.actor,
    replacement_ref: replacement === null ? null : passportReference(replacement),
    boundary: { append_only: true, source_mutated: false, certification_issued: false }
  });
  validateEventContext(body, version, replacement);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportVersionTerminalEvent(input) {
  exactObject(input, ["event", "version", "replacement_version"], [], "input");
  const event = verifyEventRecord(input.event);
  const version = verifyVersionRecord(input.version, "input.version");
  const replacement = input.replacement_version === null
    ? null
    : verifyVersionRecord(input.replacement_version, "input.replacement_version");
  validateEventContext(event, version, replacement);
  return event;
}

export function projectPassportEvidenceVersion(input) {
  exactObject(input, ["version", "events", "evaluated_at"], [], "input");
  const version = verifyVersionRecord(input.version, "input.version");
  const evaluatedAt = canonicalInstant(input.evaluated_at, "input.evaluated_at");
  if (Date.parse(evaluatedAt) < Date.parse(version.sealed_at)) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid, "evaluated_at cannot precede sealing");
  }
  if (!Array.isArray(input.events) || input.events.length > 1) {
    fail(PASSPORT_VERSIONING_ERROR_CODES.eventHistoryInvalid, "a sealed passport version accepts at most one terminal event");
  }
  let event = null;
  if (input.events.length === 1) {
    const envelope = input.events[0];
    exactObject(envelope, ["event", "replacement_version"], [], "input.events[0]");
    event = verifyPassportVersionTerminalEvent({
      event: envelope.event,
      version,
      replacement_version: envelope.replacement_version
    });
  }
  const eventEffective = event !== null && Date.parse(event.occurred_at) <= Date.parse(evaluatedAt);
  const validityElapsed = Date.parse(evaluatedAt) >= Date.parse(version.valid_until);
  const lifecycleState = eventEffective ? event.to_state : validityElapsed ? "expired" : "sealed";
  const freshness = validityElapsed ? "expired" : "valid";
  return deepFreeze({
    schema_version: PASSPORT_VERSIONING_VERSION,
    passport_ref: passportReference(version),
    lifecycle_state: lifecycleState,
    evaluated_at: evaluatedAt,
    valid_until: version.valid_until,
    status_axes: { ...version.status_seed, freshness },
    terminal_event_ref: eventEffective
      ? { event_id: event.event_id, content_fingerprint: event.content_fingerprint }
      : null,
    invalidation_reason: eventEffective ? event.reason_code : validityElapsed ? "validity_elapsed" : null,
    replacement_ref: eventEffective ? event.replacement_ref : null,
    active: lifecycleState === "sealed" && freshness === "valid",
    review_inherited: false,
    freshness_inherited: false,
    certification_issued: false
  });
}
