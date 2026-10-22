import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import {
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "./index.mjs";
import { verifyPassportNormalizedObservation } from "./observation.mjs";
import {
  projectPassportEvidenceVersion,
  verifyPassportEvidenceVersion
} from "./versioning.mjs";

export const PASSPORT_COMPARISON_VERSION = "1.0.0";
export const PASSPORT_COMPARISON_RULE_ID = "ct-passport-default-comparability-v1";

export const PASSPORT_COMPARISON_BLOCKER_CODES = Object.freeze([
  "authorization_scope_mismatch",
  "direction_mismatch",
  "workload_mismatch",
  "method_mismatch",
  "data_origin_mismatch",
  "observation_shape_mismatch",
  "baseline_inactive",
  "candidate_inactive",
  "baseline_measurement_not_sufficient",
  "candidate_measurement_not_sufficient",
  "baseline_observation_quality_not_valid",
  "candidate_observation_quality_not_valid"
]);

export const PASSPORT_COMPARISON_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_comparison_input_invalid",
  fieldUnknown: "passport_comparison_field_unknown",
  fieldMissing: "passport_comparison_field_missing",
  fingerprintMismatch: "passport_comparison_fingerprint_mismatch",
  contextMismatch: "passport_comparison_context_mismatch",
  duplicateCandidate: "passport_comparison_duplicate_candidate",
  observationShapeInvalid: "passport_comparison_observation_shape_invalid",
  recordMismatch: "passport_comparison_record_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const BLOCKER_ORDER = new Map(PASSPORT_COMPARISON_BLOCKER_CODES.map((code, index) => [code, index]));
const DIFFERENCE_CLASSES = new Set(["comparison_dimension", "ranking_blocker", "eligibility", "metadata"]);
const VIEW_MODES = new Set(["side-by-side-unranked", "difference-only"]);
const EXACT_DIMENSIONS = Object.freeze([
  "authorization_scope",
  "scenario.direction",
  "scenario.workload",
  "method_template",
  "boundary.data_origin",
  "observation_shape"
]);
const COMPARISON_DIMENSIONS = Object.freeze(["scenario.sites", "scenario.protocol"]);

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
  if (!isObject(value)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_COMPARISON_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_COMPARISON_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 32768, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
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
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function fingerprint(value) {
  return digestEvidenceBytes(Buffer.from(canonical(value), "utf8"));
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareReference(left, right) {
  return compareText(left.object_id, right.object_id)
    || compareText(left.version, right.version)
    || compareText(left.content_fingerprint, right.content_fingerprint);
}

function reference(version) {
  return {
    object_type: "passport_evidence_version",
    object_id: version.passport_id,
    version: version.version,
    tenant_id: version.tenant_id,
    content_fingerprint: version.content_fingerprint
  };
}

function normalizeReference(value, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== "passport_evidence_version") {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.object_type must be passport_evidence_version`);
  }
  const result = {
    object_type: "passport_evidence_version",
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (result.tenant_id !== tenantId) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the comparison tenant`);
  }
  return result;
}

function observationShape(observations, label) {
  const shape = observations.map((observation) => ({
    origin: observation.source.origin,
    observation_point: observation.observation_point,
    metric: observation.metric,
    aggregation: observation.aggregation,
    normalized_unit: observation.measurement.normalized_unit
  })).sort((left, right) => compareText(canonical(left), canonical(right)));
  const keys = shape.map((entry) => canonical(entry));
  if (new Set(keys).size !== keys.length) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.observationShapeInvalid, `${label} contains duplicate comparison metric keys`);
  }
  return shape;
}

function verifyComparisonContext(value, evaluatedAt, label) {
  exactObject(value, ["version", "run", "freeze", "observations", "events"], ["previous_version"], label);
  const run = verifyPassportRunBinding(value.run);
  const freeze = verifyPassportScenarioMethodFreeze(value.freeze);
  if (!Array.isArray(value.observations) || value.observations.length === 0) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.observations must not be empty`);
  }
  if (!Array.isArray(value.events)) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.events must be an array`);
  }
  const verifyInput = {
    record: value.version,
    run,
    freeze,
    observations: value.observations
  };
  if (Object.hasOwn(value, "previous_version")) verifyInput.previous_version = value.previous_version;
  const version = verifyPassportEvidenceVersion(verifyInput);
  const observations = value.observations.map((record, index) => verifyPassportNormalizedObservation({
    record,
    run,
    freeze
  }, `${label}.observations[${index}]`));
  const projection = projectPassportEvidenceVersion({
    version,
    events: value.events,
    evaluated_at: evaluatedAt
  });
  return {
    version,
    run,
    freeze,
    observations,
    projection,
    shape: observationShape(observations, `${label}.observations`)
  };
}

function groupDescriptor(context) {
  return {
    authorization_scope: context.version.authorization_scope,
    direction: context.freeze.scenario.direction,
    workload: context.freeze.scenario.workload,
    method_template: context.freeze.method_template,
    data_origin: context.freeze.boundary.data_origin,
    observation_shape: context.shape
  };
}

function eligibilityBlockers(context, role) {
  const blockers = [];
  if (!context.projection.active) blockers.push(`${role}_inactive`);
  if (context.version.status_seed.measurement_validity !== "sufficient") {
    blockers.push(`${role}_measurement_not_sufficient`);
  }
  if (context.observations.some((observation) => observation.quality.status !== "valid")) {
    blockers.push(`${role}_observation_quality_not_valid`);
  }
  return blockers;
}

function groupBlockers(baseline, candidate) {
  const blockers = [];
  if (!same(baseline.version.authorization_scope, candidate.version.authorization_scope)) blockers.push("authorization_scope_mismatch");
  if (baseline.freeze.scenario.direction !== candidate.freeze.scenario.direction) blockers.push("direction_mismatch");
  if (!same(baseline.freeze.scenario.workload, candidate.freeze.scenario.workload)) blockers.push("workload_mismatch");
  if (!same(baseline.freeze.method_template, candidate.freeze.method_template)) blockers.push("method_mismatch");
  if (baseline.freeze.boundary.data_origin !== candidate.freeze.boundary.data_origin) blockers.push("data_origin_mismatch");
  if (!same(baseline.shape, candidate.shape)) blockers.push("observation_shape_mismatch");
  return blockers;
}

function comparisonModel(context) {
  return {
    passport_id: context.version.passport_id,
    version: context.version.version,
    valid_until: context.version.valid_until,
    content_fingerprint: context.version.content_fingerprint,
    authorization_scope: context.version.authorization_scope,
    scenario: context.freeze.scenario,
    method_template: context.freeze.method_template,
    boundary: { data_origin: context.freeze.boundary.data_origin },
    observation_shape: context.shape,
    status: {
      lifecycle_state: context.projection.lifecycle_state,
      measurement_validity: context.version.status_seed.measurement_validity
    }
  };
}

function escapePointerSegment(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function differenceClass(path) {
  if (path.startsWith("/scenario/sites") || path.startsWith("/scenario/protocol")) return "comparison_dimension";
  if (path.startsWith("/authorization_scope")
      || path.startsWith("/scenario/direction")
      || path.startsWith("/scenario/workload")
      || path.startsWith("/method_template")
      || path.startsWith("/boundary/data_origin")
      || path.startsWith("/observation_shape")) return "ranking_blocker";
  if (path.startsWith("/status")) return "eligibility";
  return "metadata";
}

function collectDifferences(baseline, candidate, path = "") {
  if (same(baseline, candidate)) return [];
  if (isObject(baseline) && isObject(candidate)) {
    const keys = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])].sort();
    return keys.flatMap((key) => collectDifferences(
      baseline[key],
      candidate[key],
      `${path}/${escapePointerSegment(key)}`
    ));
  }
  const normalizedPath = path || "/";
  return [{
    path: normalizedPath,
    classification: differenceClass(normalizedPath),
    baseline_value_json: canonical(baseline),
    candidate_value_json: canonical(candidate)
  }];
}

function metricKey(observation) {
  return canonical({
    origin: observation.source.origin,
    observation_point: observation.observation_point,
    metric: observation.metric,
    aggregation: observation.aggregation,
    normalized_unit: observation.measurement.normalized_unit
  });
}

function metricRows(contexts) {
  const rows = new Map();
  for (const context of contexts) {
    const versionRef = reference(context.version);
    for (const observation of context.observations) {
      const key = metricKey(observation);
      const row = rows.get(key) ?? {
        origin: observation.source.origin,
        observation_point: observation.observation_point,
        metric: observation.metric,
        aggregation: observation.aggregation,
        normalized_unit: observation.measurement.normalized_unit,
        values: []
      };
      row.values.push({
        passport_ref: versionRef,
        normalized_value: observation.measurement.normalized_value,
        quality_status: observation.quality.status,
        included_samples: observation.samples.included
      });
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      values: row.values.sort((left, right) => compareReference(left.passport_ref, right.passport_ref))
    }))
    .sort((left, right) => compareText(canonical({ ...left, values: [] }), canonical({ ...right, values: [] })));
}

function sortedUniqueBlockers(codes, label) {
  if (!Array.isArray(codes)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} must be an array`);
  const normalized = codes.map((code, index) => {
    const result = requireString(code, `${label}[${index}]`, { max: 96 });
    if (!BLOCKER_ORDER.has(result)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}[${index}] is unsupported`);
    return result;
  });
  if (new Set(normalized).size !== normalized.length) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} must not contain duplicates`);
  return normalized.sort((left, right) => BLOCKER_ORDER.get(left) - BLOCKER_ORDER.get(right));
}

function normalizeDifference(value, label) {
  exactObject(value, ["path", "classification", "baseline_value_json", "candidate_value_json"], [], label);
  const path = requireString(value.path, `${label}.path`, { max: 512, pattern: /^\// });
  const classification = requireString(value.classification, `${label}.classification`, { max: 32 });
  if (!DIFFERENCE_CLASSES.has(classification) || classification !== differenceClass(path)) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.classification does not match its path`);
  }
  const baselineValue = requireString(value.baseline_value_json, `${label}.baseline_value_json`);
  const candidateValue = requireString(value.candidate_value_json, `${label}.candidate_value_json`);
  try {
    JSON.parse(baselineValue);
    JSON.parse(candidateValue);
  } catch {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} values must be canonical JSON strings`);
  }
  return {
    path,
    classification,
    baseline_value_json: baselineValue,
    candidate_value_json: candidateValue
  };
}

function normalizeBaseline(value, tenantId, label) {
  exactObject(value, ["passport_ref", "group_fingerprint", "ranking_eligible", "blocker_codes"], [], label);
  const blockerCodes = sortedUniqueBlockers(value.blocker_codes, `${label}.blocker_codes`);
  if (value.ranking_eligible !== (blockerCodes.length === 0)) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.ranking_eligible must be derived from blocker_codes`);
  }
  return {
    passport_ref: normalizeReference(value.passport_ref, tenantId, `${label}.passport_ref`),
    group_fingerprint: requireHash(value.group_fingerprint, `${label}.group_fingerprint`),
    ranking_eligible: value.ranking_eligible,
    blocker_codes: blockerCodes
  };
}

function normalizeCandidate(value, tenantId, label) {
  exactObject(value, [
    "passport_ref", "group_fingerprint", "same_group", "ranking_eligible", "view_mode", "blocker_codes", "differences"
  ], [], label);
  const blockerCodes = sortedUniqueBlockers(value.blocker_codes, `${label}.blocker_codes`);
  const sameGroup = value.same_group === true;
  const rankingEligible = value.ranking_eligible === true;
  const viewMode = requireString(value.view_mode, `${label}.view_mode`, { max: 32 });
  if (!VIEW_MODES.has(viewMode)
      || (sameGroup && viewMode !== "side-by-side-unranked")
      || (!sameGroup && viewMode !== "difference-only")) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.view_mode must follow same_group`);
  }
  if (rankingEligible !== (sameGroup && blockerCodes.length === 0)) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.ranking_eligible must be derived from group and blockers`);
  }
  if (!Array.isArray(value.differences)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.differences must be an array`);
  return {
    passport_ref: normalizeReference(value.passport_ref, tenantId, `${label}.passport_ref`),
    group_fingerprint: requireHash(value.group_fingerprint, `${label}.group_fingerprint`),
    same_group: sameGroup,
    ranking_eligible: rankingEligible,
    view_mode: viewMode,
    blocker_codes: blockerCodes,
    differences: value.differences.map((entry, index) => normalizeDifference(entry, `${label}.differences[${index}]`))
  };
}

function normalizeMetricValue(value, tenantId, label) {
  exactObject(value, ["passport_ref", "normalized_value", "quality_status", "included_samples"], [], label);
  if (value.normalized_value !== null && (typeof value.normalized_value !== "number" || !Number.isFinite(value.normalized_value))) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.normalized_value must be finite or null`);
  }
  if (!Number.isSafeInteger(value.included_samples) || value.included_samples < 0) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.included_samples must be a non-negative integer`);
  }
  return {
    passport_ref: normalizeReference(value.passport_ref, tenantId, `${label}.passport_ref`),
    normalized_value: value.normalized_value,
    quality_status: requireString(value.quality_status, `${label}.quality_status`, { pattern: /^(valid|partial|invalid|unknown)$/ }),
    included_samples: value.included_samples
  };
}

function normalizeMetricRow(value, tenantId, label) {
  exactObject(value, ["origin", "observation_point", "metric", "aggregation", "normalized_unit", "values"], [], label);
  if (!Array.isArray(value.values) || value.values.length === 0) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.values must not be empty`);
  }
  return {
    origin: requireString(value.origin, `${label}.origin`, { pattern: /^(measured|synthetic|inferred|declared)$/ }),
    observation_point: requireString(value.observation_point, `${label}.observation_point`, { max: 160 }),
    metric: requireString(value.metric, `${label}.metric`, { max: 96 }),
    aggregation: requireString(value.aggregation, `${label}.aggregation`, { pattern: /^(raw|count|mean|min|max|p50|p95|p99)$/ }),
    normalized_unit: requireString(value.normalized_unit, `${label}.normalized_unit`, { max: 32 }),
    values: value.values.map((entry, index) => normalizeMetricValue(entry, tenantId, `${label}.values[${index}]`))
  };
}

function normalizeView(value, tenantId, label) {
  exactObject(value, [
    "side_by_side_refs", "difference_only_refs", "ranking_eligible_refs", "metric_rows", "default_ranking_applied"
  ], [], label);
  const normalizeRefs = (refs, location) => {
    if (!Array.isArray(refs)) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${location} must be an array`);
    const result = refs.map((entry, index) => normalizeReference(entry, tenantId, `${location}[${index}]`));
    const identities = result.map((entry) => `${entry.object_id}@${entry.version}`);
    if (new Set(identities).size !== identities.length) fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${location} must not contain duplicates`);
    return result;
  };
  if (value.default_ranking_applied !== false) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.default_ranking_applied must remain false`);
  }
  return {
    side_by_side_refs: normalizeRefs(value.side_by_side_refs, `${label}.side_by_side_refs`),
    difference_only_refs: normalizeRefs(value.difference_only_refs, `${label}.difference_only_refs`),
    ranking_eligible_refs: normalizeRefs(value.ranking_eligible_refs, `${label}.ranking_eligible_refs`),
    metric_rows: Array.isArray(value.metric_rows)
      ? value.metric_rows.map((row, index) => normalizeMetricRow(row, tenantId, `${label}.metric_rows[${index}]`))
      : fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.metric_rows must be an array`),
    default_ranking_applied: false
  };
}

function normalizeBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "comparison_id", "version", "tenant_id", "created_by", "created_at",
    "evaluated_at", "group_rule", "baseline", "candidates", "view", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_COMPARISON_VERSION || value.record_type !== "passport_comparison") {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const createdAt = canonicalInstant(value.created_at, `${label}.created_at`);
  const evaluatedAt = canonicalInstant(value.evaluated_at, `${label}.evaluated_at`);
  if (createdAt !== evaluatedAt) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.created_at must equal evaluated_at`);
  }
  exactObject(value.group_rule, [
    "rule_id", "rule_version", "exact_dimensions", "comparison_dimensions", "default_ranking_applied"
  ], [], `${label}.group_rule`);
  if (value.group_rule.rule_id !== PASSPORT_COMPARISON_RULE_ID
      || value.group_rule.rule_version !== PASSPORT_COMPARISON_VERSION
      || !same(value.group_rule.exact_dimensions, EXACT_DIMENSIONS)
      || !same(value.group_rule.comparison_dimensions, COMPARISON_DIMENSIONS)
      || value.group_rule.default_ranking_applied !== false) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.group_rule must use the frozen default comparison rule`);
  }
  if (!Array.isArray(value.candidates) || value.candidates.length === 0 || value.candidates.length > 32) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.candidates must contain 1 through 32 entries`);
  }
  exactObject(value.boundary, [
    "comparability_is_not_equivalence", "explicit_ranking_policy_required", "performance_claim_allowed",
    "independent_review_claimed", "certification_issued"
  ], [], `${label}.boundary`);
  if (value.boundary.comparability_is_not_equivalence !== true
      || value.boundary.explicit_ranking_policy_required !== true
      || value.boundary.performance_claim_allowed !== false
      || value.boundary.independent_review_claimed !== false
      || value.boundary.certification_issued !== false) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, `${label}.boundary crosses the comparison evidence boundary`);
  }
  return {
    schema_version: PASSPORT_COMPARISON_VERSION,
    record_type: "passport_comparison",
    comparison_id: requireId(value.comparison_id, `${label}.comparison_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: createdAt,
    evaluated_at: evaluatedAt,
    group_rule: {
      rule_id: PASSPORT_COMPARISON_RULE_ID,
      rule_version: PASSPORT_COMPARISON_VERSION,
      exact_dimensions: [...EXACT_DIMENSIONS],
      comparison_dimensions: [...COMPARISON_DIMENSIONS],
      default_ranking_applied: false
    },
    baseline: normalizeBaseline(value.baseline, tenantId, `${label}.baseline`),
    candidates: value.candidates.map((candidate, index) => normalizeCandidate(candidate, tenantId, `${label}.candidates[${index}]`)),
    view: normalizeView(value.view, tenantId, `${label}.view`),
    boundary: {
      comparability_is_not_equivalence: true,
      explicit_ranking_policy_required: true,
      performance_claim_allowed: false,
      independent_review_claimed: false,
      certification_issued: false
    }
  };
}

function verifyRecord(record) {
  exactObject(record, [
    "schema_version", "record_type", "comparison_id", "version", "tenant_id", "created_by", "created_at",
    "evaluated_at", "group_rule", "baseline", "candidates", "view", "boundary", "content_fingerprint"
  ], [], "record");
  const { content_fingerprint: supplied, ...candidate } = record;
  const body = normalizeBody(candidate);
  const expected = fingerprint(body);
  if (requireHash(supplied, "record.content_fingerprint") !== expected) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.fingerprintMismatch, "record.content_fingerprint does not match the comparison");
  }
  return deepFreeze({ ...body, content_fingerprint: expected });
}

export function createPassportComparison(input) {
  exactObject(input, [
    "comparison_id", "version", "tenant_id", "created_by", "created_at", "baseline", "candidates"
  ], [], "input");
  if (!Array.isArray(input.candidates) || input.candidates.length === 0 || input.candidates.length > 32) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.inputInvalid, "input.candidates must contain 1 through 32 entries");
  }
  const createdAt = canonicalInstant(input.created_at, "input.created_at");
  const tenantId = requireId(input.tenant_id, "input.tenant_id");
  const baseline = verifyComparisonContext(input.baseline, createdAt, "input.baseline");
  if (baseline.version.tenant_id !== tenantId) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.contextMismatch, "baseline tenant must match input.tenant_id");
  }
  const baselineGroup = groupDescriptor(baseline);
  const baselineGroupFingerprint = fingerprint(baselineGroup);
  const baselineBlockers = sortedUniqueBlockers(eligibilityBlockers(baseline, "baseline"), "baseline.blocker_codes");
  const seen = new Set([`${baseline.version.passport_id}@${baseline.version.version}`]);
  const contexts = input.candidates.map((entry, index) => {
    const context = verifyComparisonContext(entry, createdAt, `input.candidates[${index}]`);
    if (context.version.tenant_id !== tenantId) {
      fail(PASSPORT_COMPARISON_ERROR_CODES.contextMismatch, `input.candidates[${index}] tenant must match input.tenant_id`);
    }
    const identity = `${context.version.passport_id}@${context.version.version}`;
    if (seen.has(identity)) {
      fail(PASSPORT_COMPARISON_ERROR_CODES.duplicateCandidate, `input.candidates[${index}] repeats ${identity}`);
    }
    seen.add(identity);
    return context;
  });
  const candidateRecords = contexts.map((context) => {
    const exactBlockers = groupBlockers(baseline, context);
    const blockers = sortedUniqueBlockers([
      ...exactBlockers,
      ...baselineBlockers,
      ...eligibilityBlockers(context, "candidate")
    ], "candidate.blocker_codes");
    const sameGroup = exactBlockers.length === 0;
    return {
      passport_ref: reference(context.version),
      group_fingerprint: fingerprint(groupDescriptor(context)),
      same_group: sameGroup,
      ranking_eligible: sameGroup && blockers.length === 0,
      view_mode: sameGroup ? "side-by-side-unranked" : "difference-only",
      blocker_codes: blockers,
      differences: collectDifferences(comparisonModel(baseline), comparisonModel(context))
    };
  }).sort((left, right) => compareReference(left.passport_ref, right.passport_ref));
  const contextByReference = new Map(contexts.map((context) => [canonical(reference(context.version)), context]));
  const sameGroupContexts = candidateRecords
    .filter(({ same_group: sameGroup }) => sameGroup)
    .map(({ passport_ref: passportRef }) => contextByReference.get(canonical(passportRef)));
  const sideBySideRefs = [reference(baseline.version), ...candidateRecords.filter(({ same_group: sameGroup }) => sameGroup).map(({ passport_ref: passportRef }) => passportRef)];
  const rankingEligibleRefs = baselineBlockers.length === 0
    ? [reference(baseline.version), ...candidateRecords.filter(({ ranking_eligible: eligible }) => eligible).map(({ passport_ref: passportRef }) => passportRef)]
    : [];
  const body = normalizeBody({
    schema_version: PASSPORT_COMPARISON_VERSION,
    record_type: "passport_comparison",
    comparison_id: input.comparison_id,
    version: input.version,
    tenant_id: tenantId,
    created_by: input.created_by,
    created_at: createdAt,
    evaluated_at: createdAt,
    group_rule: {
      rule_id: PASSPORT_COMPARISON_RULE_ID,
      rule_version: PASSPORT_COMPARISON_VERSION,
      exact_dimensions: [...EXACT_DIMENSIONS],
      comparison_dimensions: [...COMPARISON_DIMENSIONS],
      default_ranking_applied: false
    },
    baseline: {
      passport_ref: reference(baseline.version),
      group_fingerprint: baselineGroupFingerprint,
      ranking_eligible: baselineBlockers.length === 0,
      blocker_codes: baselineBlockers
    },
    candidates: candidateRecords,
    view: {
      side_by_side_refs: sideBySideRefs,
      difference_only_refs: candidateRecords.filter(({ same_group: sameGroup }) => !sameGroup).map(({ passport_ref: passportRef }) => passportRef),
      ranking_eligible_refs: rankingEligibleRefs,
      metric_rows: metricRows([baseline, ...sameGroupContexts]),
      default_ranking_applied: false
    },
    boundary: {
      comparability_is_not_equivalence: true,
      explicit_ranking_policy_required: true,
      performance_claim_allowed: false,
      independent_review_claimed: false,
      certification_issued: false
    }
  });
  return deepFreeze({ ...body, content_fingerprint: fingerprint(body) });
}

export function verifyPassportComparison(input) {
  exactObject(input, ["record", "baseline", "candidates"], [], "input");
  const record = verifyRecord(input.record);
  const rebuilt = createPassportComparison({
    comparison_id: record.comparison_id,
    version: record.version,
    tenant_id: record.tenant_id,
    created_by: record.created_by,
    created_at: record.created_at,
    baseline: input.baseline,
    candidates: input.candidates
  });
  if (!same(record, rebuilt)) {
    fail(PASSPORT_COMPARISON_ERROR_CODES.recordMismatch, "record does not match the supplied passport contexts");
  }
  return record;
}
