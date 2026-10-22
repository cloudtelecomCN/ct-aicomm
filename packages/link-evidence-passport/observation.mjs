import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { EVIDENCE_CANONICAL_UNITS } from "../evidence-import/index.mjs";
import {
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "./index.mjs";

export const PASSPORT_OBSERVATION_VERSION = "1.0.0";
export const PASSPORT_OBSERVATION_ORIGINS = Object.freeze(["measured", "synthetic", "inferred", "declared"]);
export const PASSPORT_OBSERVATION_UNIT_RULES = Object.freeze({
  ns: Object.freeze({ canonical_unit: "ms", conversion_factor: 0.000001 }),
  us: Object.freeze({ canonical_unit: "ms", conversion_factor: 0.001 }),
  ms: Object.freeze({ canonical_unit: "ms", conversion_factor: 1 }),
  s: Object.freeze({ canonical_unit: "ms", conversion_factor: 1000 }),
  "bit/s": Object.freeze({ canonical_unit: "bit/s", conversion_factor: 1 }),
  "kbit/s": Object.freeze({ canonical_unit: "bit/s", conversion_factor: 1000 }),
  "Mbit/s": Object.freeze({ canonical_unit: "bit/s", conversion_factor: 1000000 }),
  "Gbit/s": Object.freeze({ canonical_unit: "bit/s", conversion_factor: 1000000000 }),
  "byte/s": Object.freeze({ canonical_unit: "byte/s", conversion_factor: 1 }),
  "KiB/s": Object.freeze({ canonical_unit: "byte/s", conversion_factor: 1024 }),
  "MiB/s": Object.freeze({ canonical_unit: "byte/s", conversion_factor: 1048576 }),
  "GiB/s": Object.freeze({ canonical_unit: "byte/s", conversion_factor: 1073741824 }),
  bytes: Object.freeze({ canonical_unit: "bytes", conversion_factor: 1 }),
  KiB: Object.freeze({ canonical_unit: "bytes", conversion_factor: 1024 }),
  MiB: Object.freeze({ canonical_unit: "bytes", conversion_factor: 1048576 }),
  GiB: Object.freeze({ canonical_unit: "bytes", conversion_factor: 1073741824 }),
  "1": Object.freeze({ canonical_unit: "1", conversion_factor: 1 }),
  percent: Object.freeze({ canonical_unit: "percent", conversion_factor: 1 }),
  "%": Object.freeze({ canonical_unit: "percent", conversion_factor: 1 }),
  count: Object.freeze({ canonical_unit: "count", conversion_factor: 1 }),
  "request/s": Object.freeze({ canonical_unit: "request/s", conversion_factor: 1 }),
  "token/s": Object.freeze({ canonical_unit: "token/s", conversion_factor: 1 })
});

export const PASSPORT_OBSERVATION_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_observation_input_invalid",
  fieldUnknown: "passport_observation_field_unknown",
  fieldMissing: "passport_observation_field_missing",
  fingerprintMismatch: "passport_observation_fingerprint_mismatch",
  runNotStarted: "passport_observation_run_not_started",
  contextMismatch: "passport_observation_context_mismatch",
  metricNotFrozen: "passport_observation_metric_not_frozen",
  aggregationNotFrozen: "passport_observation_aggregation_not_frozen",
  unitInvalid: "passport_observation_unit_invalid",
  sampleAccountingInvalid: "passport_observation_sample_accounting_invalid",
  exclusionNotFrozen: "passport_observation_exclusion_not_frozen",
  originMismatch: "passport_observation_origin_mismatch",
  timeInvalid: "passport_observation_time_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ORIGINS = new Set(PASSPORT_OBSERVATION_ORIGINS);
const AGGREGATIONS = new Set(["raw", "count", "mean", "min", "max", "p50", "p95", "p99"]);
const QUALITY = new Set(["valid", "partial", "invalid", "unknown"]);
const SOURCE_KIND_BY_ORIGIN = Object.freeze({
  measured: "instrument",
  synthetic: "generator",
  inferred: "derivation",
  declared: "attestation"
});
const CANONICAL_UNITS = new Set(EVIDENCE_CANONICAL_UNITS);

for (const { canonical_unit: unit } of Object.values(PASSPORT_OBSERVATION_UNIT_RULES)) {
  if (!CANONICAL_UNITS.has(unit)) throw new Error(`Passport observation unit ${unit} is outside Evidence Core v1`);
}

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
  if (!isObject(value)) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_OBSERVATION_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_OBSERVATION_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
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
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireHash(value, label) {
  return requireString(value, label, { max: 71, pattern: HASH });
}

function requireSemver(value, label) {
  if (typeof value === "string" && value.toLowerCase() === "latest") {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} must be an exact version`);
  }
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireCount(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid, `${label} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function requireEnum(value, allowed, label) {
  if (!allowed.has(value)) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function uniqueSorted(values, label, normalize) {
  if (!Array.isArray(values)) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} must be an array`);
  const result = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const serialized = result.map((value) => canonicalizeEvidenceValue(value));
  if (new Set(serialized).size !== result.length) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} contains duplicates`);
  return result.sort((left, right) => canonicalizeEvidenceValue(left).localeCompare(canonicalizeEvidenceValue(right)));
}

function normalizeAuthorizationScope(value, label) {
  exactObject(value, ["visibility", "purpose", "recipients", "expires_at"], [], label);
  const recipients = uniqueSorted(value.recipients, `${label}.recipients`, (recipient, location) => requireId(recipient, location));
  const visibility = requireEnum(value.visibility, new Set(["private", "shared", "public"]), `${label}.visibility`);
  if (visibility !== "private" && recipients.length === 0) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label}.recipients must identify the audience`);
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
  if (value.object_type !== objectType) fail(PASSPORT_OBSERVATION_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  const reference = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) fail(PASSPORT_OBSERVATION_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the observation tenant`);
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

function referencesMatch(left, right) {
  return canonicalizeEvidenceValue(left) === canonicalizeEvidenceValue(right);
}

function normalizeSource(value, tenantId, label) {
  exactObject(value, [
    "origin", "kind", "source_id", "collected_at", "content_fingerprint", "artifact_ref", "input_observation_refs", "declared_by"
  ], [], label);
  const origin = requireEnum(value.origin, ORIGINS, `${label}.origin`);
  const kind = requireString(value.kind, `${label}.kind`, { max: 32 });
  if (kind !== SOURCE_KIND_BY_ORIGIN[origin]) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, `${label}.kind cannot represent ${origin} evidence`);
  }
  const artifactRef = value.artifact_ref === null
    ? null
    : normalizeReference(value.artifact_ref, "artifact", tenantId, `${label}.artifact_ref`);
  const inputObservationRefs = uniqueSorted(
    value.input_observation_refs,
    `${label}.input_observation_refs`,
    (reference, location) => normalizeReference(reference, "observation", tenantId, location)
  );
  const declaredBy = value.declared_by === null ? null : requireId(value.declared_by, `${label}.declared_by`);

  if ((origin === "measured" || origin === "synthetic")
      && (artifactRef === null || inputObservationRefs.length !== 0 || declaredBy !== null)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, `${origin} evidence requires one source Artifact and forbids derivation or declarant fields`);
  }
  if (origin === "inferred" && (inputObservationRefs.length === 0 || declaredBy !== null)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, "inferred evidence requires input observations and cannot name a declarant");
  }
  if (origin === "declared" && (declaredBy === null || inputObservationRefs.length !== 0)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, "declared evidence requires a declarant and cannot cite observations as an inference");
  }

  return {
    origin,
    kind,
    source_id: requireId(value.source_id, `${label}.source_id`),
    collected_at: canonicalInstant(value.collected_at, `${label}.collected_at`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`),
    artifact_ref: artifactRef,
    input_observation_refs: inputObservationRefs,
    declared_by: declaredBy
  };
}

function normalizeSamples(value, label) {
  exactObject(value, ["attempted", "successful", "failed", "excluded", "included"], [], label);
  const samples = {
    attempted: requireCount(value.attempted, `${label}.attempted`, 1),
    successful: requireCount(value.successful, `${label}.successful`),
    failed: requireCount(value.failed, `${label}.failed`),
    excluded: requireCount(value.excluded, `${label}.excluded`),
    included: requireCount(value.included, `${label}.included`)
  };
  if (samples.attempted !== samples.successful + samples.failed
      || samples.successful !== samples.included + samples.excluded) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid, "sample counts do not close");
  }
  return samples;
}

function normalizeFailures(value, label) {
  return uniqueSorted(value, label, (failure, location) => {
    exactObject(failure, ["code", "stage", "count"], [], location);
    return {
      code: requireString(failure.code, `${location}.code`, { max: 96, pattern: /^[a-z][a-z0-9_.-]{0,95}$/ }),
      stage: requireString(failure.stage, `${location}.stage`, { max: 96 }),
      count: requireCount(failure.count, `${location}.count`, 1)
    };
  });
}

function normalizeExclusions(value, label) {
  return uniqueSorted(value, label, (exclusion, location) => {
    exactObject(exclusion, ["rule_id", "count"], [], location);
    return {
      rule_id: requireId(exclusion.rule_id, `${location}.rule_id`),
      count: requireCount(exclusion.count, `${location}.count`, 1)
    };
  });
}

function stableNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} must be a finite non-negative number`);
  }
  const normalized = Number(value.toPrecision(15));
  if (!Number.isFinite(normalized)) fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} is outside the supported range`);
  return Object.is(normalized, -0) ? 0 : normalized;
}

function buildMeasurement(sourceValue, sourceUnit, included, label = "measurement") {
  const unit = requireString(sourceUnit, `${label}.source_unit`, { max: 32 });
  const rule = PASSPORT_OBSERVATION_UNIT_RULES[unit];
  if (!rule) fail(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid, `${label}.source_unit is not in the versioned unit catalog`);
  if (included === 0) {
    if (sourceValue !== null) fail(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid, `${label}.source_value must be null when no sample is included`);
    return {
      source_value: null,
      source_unit: unit,
      normalized_value: null,
      normalized_unit: rule.canonical_unit,
      conversion_factor: rule.conversion_factor
    };
  }
  const value = stableNumber(sourceValue, `${label}.source_value`);
  if (unit === "1" && value > 1) fail(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid, `${label}.source_value exceeds the ratio range`);
  if ((unit === "percent" || unit === "%") && value > 100) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid, `${label}.source_value exceeds the percent range`);
  }
  return {
    source_value: value,
    source_unit: unit,
    normalized_value: stableNumber(value * rule.conversion_factor, `${label}.normalized_value`),
    normalized_unit: rule.canonical_unit,
    conversion_factor: rule.conversion_factor
  };
}

function normalizeMeasurement(value, included, label) {
  exactObject(value, ["source_value", "source_unit", "normalized_value", "normalized_unit", "conversion_factor"], [], label);
  const expected = buildMeasurement(value.source_value, value.source_unit, included, label);
  if (canonicalizeEvidenceValue(value) !== canonicalizeEvidenceValue(expected)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid, `${label} does not match the declared unit conversion`);
  }
  return expected;
}

function expectedQuality(origin, samples) {
  const flags = [];
  if (samples.failed > 0) flags.push("failed_samples_retained");
  if (samples.excluded > 0) flags.push("excluded_samples_retained");
  if (samples.included === 0) flags.push("no_included_samples");
  if (origin === "inferred" || origin === "declared") flags.push("non_observed_origin");
  const status = samples.included === 0
    ? "invalid"
    : origin === "inferred" || origin === "declared"
      ? "unknown"
      : samples.failed > 0 || samples.excluded > 0
        ? "partial"
        : "valid";
  return { status, flags: flags.sort() };
}

function normalizeQuality(value, origin, samples, label) {
  exactObject(value, ["status", "flags"], [], label);
  const quality = {
    status: requireEnum(value.status, QUALITY, `${label}.status`),
    flags: uniqueSorted(value.flags, `${label}.flags`, (flag, location) => requireString(flag, location, { max: 96 }))
  };
  const expected = expectedQuality(origin, samples);
  if (canonicalizeEvidenceValue(quality) !== canonicalizeEvidenceValue(expected)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, `${label} cannot promote or rewrite the derived quality state`);
  }
  return expected;
}

function normalizeBoundary(value, origin, label) {
  exactObject(value, ["data_origin", "origin_separated", "performance_claim_allowed", "certification_issued"], [], label);
  if (value.data_origin !== origin
      || value.origin_separated !== true
      || value.performance_claim_allowed !== false
      || value.certification_issued !== false) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, `${label} must preserve the source origin and non-claim boundary`);
  }
  return {
    data_origin: origin,
    origin_separated: true,
    performance_claim_allowed: false,
    certification_issued: false
  };
}

function fingerprintBody(body) {
  return digestEvidenceBytes(Buffer.from(canonicalizeEvidenceValue(body), "utf8"));
}

function normalizeObservationBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "observation_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "run_ref", "freeze_ref", "observed_at", "observation_point", "metric", "aggregation",
    "measurement", "samples", "failures", "exclusions", "source", "quality", "limitations", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_OBSERVATION_VERSION || value.record_type !== "passport_normalized_observation") {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const samples = normalizeSamples(value.samples, `${label}.samples`);
  const failures = normalizeFailures(value.failures, `${label}.failures`);
  const exclusions = normalizeExclusions(value.exclusions, `${label}.exclusions`);
  if (failures.reduce((total, failure) => total + failure.count, 0) !== samples.failed
      || exclusions.reduce((total, exclusion) => total + exclusion.count, 0) !== samples.excluded) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid, `${label} failure or exclusion details do not match the sample counts`);
  }
  const source = normalizeSource(value.source, tenantId, `${label}.source`);
  const observedAt = canonicalInstant(value.observed_at, `${label}.observed_at`);
  const createdAt = canonicalInstant(value.created_at, `${label}.created_at`);
  if (Date.parse(observedAt) > Date.parse(source.collected_at) || Date.parse(source.collected_at) > Date.parse(createdAt)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.timeInvalid, `${label} requires observed_at <= collected_at <= created_at`);
  }
  const limitations = uniqueSorted(value.limitations, `${label}.limitations`, (limitation, location) => requireString(limitation, location, { min: 3, max: 500 }));
  if ((source.origin !== "measured" || samples.failed > 0 || samples.excluded > 0 || samples.included === 0) && limitations.length === 0) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.inputInvalid, `${label}.limitations must disclose non-measured or incomplete evidence`);
  }
  return {
    schema_version: PASSPORT_OBSERVATION_VERSION,
    record_type: "passport_normalized_observation",
    observation_id: requireId(value.observation_id, `${label}.observation_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: createdAt,
    authorization_scope: normalizeAuthorizationScope(value.authorization_scope, `${label}.authorization_scope`),
    run_ref: normalizeReference(value.run_ref, "run", tenantId, `${label}.run_ref`),
    freeze_ref: normalizeReference(value.freeze_ref, "passport_scenario_method_freeze", tenantId, `${label}.freeze_ref`),
    observed_at: observedAt,
    observation_point: requireString(value.observation_point, `${label}.observation_point`, { max: 120 }),
    metric: requireString(value.metric, `${label}.metric`, { max: 96 }),
    aggregation: requireEnum(value.aggregation, AGGREGATIONS, `${label}.aggregation`),
    measurement: normalizeMeasurement(value.measurement, samples.included, `${label}.measurement`),
    samples,
    failures,
    exclusions,
    source,
    quality: normalizeQuality(value.quality, source.origin, samples, `${label}.quality`),
    limitations,
    boundary: normalizeBoundary(value.boundary, source.origin, `${label}.boundary`)
  };
}

function validateContext(record, runInput, freezeInput) {
  const run = verifyPassportRunBinding(runInput);
  const freeze = verifyPassportScenarioMethodFreeze(freezeInput);
  if (run.state !== "started" || run.started_at === null) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.runNotStarted, "observations require an exact started run");
  }
  if (record.tenant_id !== run.tenant_id || record.tenant_id !== freeze.tenant_id
      || !referencesMatch(run.freeze_ref, {
        freeze_id: freeze.freeze_id,
        version: freeze.version,
        tenant_id: freeze.tenant_id,
        content_fingerprint: freeze.content_fingerprint
      })
      || !referencesMatch(record.run_ref, runReference(run))
      || !referencesMatch(record.freeze_ref, freezeReference(freeze))) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.contextMismatch, "observation, started run, and freeze must bind exactly within one tenant");
  }
  const statistic = freeze.method_template.statistics.find(({ metric }) => metric === record.metric);
  if (!statistic) fail(PASSPORT_OBSERVATION_ERROR_CODES.metricNotFrozen, "the observation metric is not in the frozen method");
  if (!statistic.aggregations.includes(record.aggregation)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.aggregationNotFrozen, "the observation aggregation is not in the frozen method");
  }
  const exclusionRules = new Set(freeze.method_template.exclusion_rules.map(({ rule_id: ruleId }) => ruleId));
  if (record.exclusions.some(({ rule_id: ruleId }) => !exclusionRules.has(ruleId))) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.exclusionNotFrozen, "every applied exclusion must use a rule from the frozen method");
  }
  if (Date.parse(record.observed_at) < Date.parse(run.started_at)
      || Date.parse(record.observed_at) > Date.parse(run.planned_window.ends_at)) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.timeInvalid, "observed_at must fall inside the exact started run window");
  }
  const freezeOrigin = freeze.boundary.data_origin;
  if ((freezeOrigin === "synthetic" && record.source.origin !== "synthetic")
      || (freezeOrigin === "measured" && record.source.origin !== "measured")) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch, "the observation origin cannot exceed or rewrite the frozen data origin");
  }
  return { run, freeze };
}

export function createPassportNormalizedObservation(input) {
  exactObject(input, [
    "observation_id", "version", "tenant_id", "created_by", "created_at", "run", "freeze", "observed_at",
    "observation_point", "metric", "aggregation", "value", "unit", "samples", "failures", "exclusions", "source", "limitations"
  ], [], "input");
  const run = verifyPassportRunBinding(input.run);
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  const samples = normalizeSamples(input.samples, "input.samples");
  const source = normalizeSource(input.source, input.tenant_id, "input.source");
  const body = normalizeObservationBody({
    schema_version: PASSPORT_OBSERVATION_VERSION,
    record_type: "passport_normalized_observation",
    observation_id: input.observation_id,
    version: input.version,
    tenant_id: input.tenant_id,
    created_by: input.created_by,
    created_at: input.created_at,
    authorization_scope: run.authorization_scope,
    run_ref: runReference(run),
    freeze_ref: freezeReference(freeze),
    observed_at: input.observed_at,
    observation_point: input.observation_point,
    metric: input.metric,
    aggregation: input.aggregation,
    measurement: buildMeasurement(input.value, input.unit, samples.included, "input.measurement"),
    samples,
    failures: input.failures,
    exclusions: input.exclusions,
    source,
    quality: expectedQuality(source.origin, samples),
    limitations: input.limitations,
    boundary: {
      data_origin: source.origin,
      origin_separated: true,
      performance_claim_allowed: false,
      certification_issued: false
    }
  });
  validateContext(body, run, freeze);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportNormalizedObservation(input) {
  exactObject(input, ["record", "run", "freeze"], [], "input");
  exactObject(input.record, [
    "schema_version", "record_type", "observation_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "run_ref", "freeze_ref", "observed_at", "observation_point", "metric", "aggregation",
    "measurement", "samples", "failures", "exclusions", "source", "quality", "limitations", "boundary", "content_fingerprint"
  ], [], "input.record");
  const { content_fingerprint: suppliedFingerprint, ...candidate } = input.record;
  const body = normalizeObservationBody(candidate);
  validateContext(body, input.run, input.freeze);
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, "input.record.content_fingerprint") !== expectedFingerprint) {
    fail(PASSPORT_OBSERVATION_ERROR_CODES.fingerprintMismatch, "content_fingerprint does not match the normalized observation");
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}
