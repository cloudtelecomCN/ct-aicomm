import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import {
  parsePassportDeliverySamplesCsv,
  verifyPassportDeliveryPackage
} from "../link-evidence-passport/delivery.mjs";
import { PASSPORT_OBSERVATION_UNIT_RULES } from "../link-evidence-passport/observation.mjs";
import {
  projectPassportShare,
  verifyPassportShareGrant
} from "../link-evidence-passport/sharing.mjs";
import { verifyIndependentReviewEngagement } from "./index.mjs";
import { assertIndependentOpinionSignerEligible } from "./independence.mjs";

export const INDEPENDENT_REVIEW_RECALCULATION_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_RECALCULATION_RESULTS = Object.freeze([
  "exact",
  "within-tolerance",
  "outside-tolerance"
]);
export const INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_recalculation_input_invalid",
  fieldUnknown: "independent_review_recalculation_field_unknown",
  fieldMissing: "independent_review_recalculation_field_missing",
  fingerprintMismatch: "independent_review_recalculation_fingerprint_mismatch",
  contextMismatch: "independent_review_recalculation_context_mismatch",
  timeInvalid: "independent_review_recalculation_time_invalid",
  engagementLevelInvalid: "independent_review_recalculation_engagement_level_invalid",
  independenceInvalid: "independent_review_recalculation_independence_invalid",
  shareInvalid: "independent_review_recalculation_share_invalid",
  structureInvalid: "independent_review_recalculation_structure_invalid",
  statisticInvalid: "independent_review_recalculation_statistic_invalid",
  resultCoverageInvalid: "independent_review_recalculation_result_coverage_invalid",
  recordMismatch: "independent_review_recalculation_record_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const RESULT_SET = new Set(INDEPENDENT_REVIEW_RECALCULATION_RESULTS);
const CHECK_IDS = Object.freeze([
  "delivery-integrity",
  "engagement-binding",
  "independence-gate",
  "active-review-share",
  "statistics-profile",
  "sample-accounting",
  "result-coverage"
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.inputInvalid, `${label} must be an object`);
  const keys = Object.keys(value);
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.fieldMissing, `${label}.${field} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const field of keys) {
    if (!allowed.has(field)) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.fieldUnknown, `${label}.${field} is not allowed`);
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
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireHash(value, label) {
  return requireString(value, label, { min: 71, max: 71, pattern: HASH });
}

function requireSemver(value, label) {
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function canonicalInstant(value, label) {
  const text = requireString(value, label, { max: 64 });
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return text;
}

function stableNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e15) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${label} must be a bounded finite number`);
  }
  const normalized = Number(value.toPrecision(15));
  return Object.is(normalized, -0) ? 0 : normalized;
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseJsonFile(files, path) {
  const file = files.find(({ path: filePath }) => filePath === path);
  if (!file || typeof file.content !== "string") {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, `${path} is required as UTF-8 text`);
  }
  try {
    return JSON.parse(file.content);
  } catch {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, `${path} must contain valid JSON`);
  }
}

function reference(record, objectType, idKey) {
  return {
    object_type: objectType,
    object_id: record[idKey],
    version: record.version,
    tenant_id: record.tenant_id,
    content_fingerprint: record.content_fingerprint
  };
}

function engagementReference(record) {
  return reference(record, "independent_review_engagement", "engagement_id");
}

function independenceReference(record) {
  return reference(record, "independent_review_independence_assessment", "assessment_id");
}

function shareReference(record) {
  return reference(record, "passport_share_grant", "share_id");
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const result = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (tenantId !== undefined && result.tenant_id !== tenantId) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the record tenant`);
  }
  return result;
}

function aggregate(values, aggregation, label) {
  if (values.length === 0) return null;
  if (aggregation === "raw") {
    if (values.length !== 1) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${label} raw aggregation requires one value`);
    return values[0];
  }
  if (aggregation === "count") return values.length;
  if (aggregation === "mean") return stableNumber(values.reduce((sum, value) => sum + value, 0) / values.length, label);
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  const percentile = aggregation === "p50" ? 50 : aggregation === "p95" ? 95 : aggregation === "p99" ? 99 : null;
  if (percentile === null) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${label} uses an unsupported aggregation`);
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

function extractDelivery(delivery) {
  if (!isObject(delivery) || !Array.isArray(delivery.files) || !isObject(delivery.manifest)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, "delivery must contain manifest and files");
  }
  let verification;
  try {
    verification = verifyPassportDeliveryPackage({ files: delivery.files });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, `delivery verification failed: ${error.message}`);
  }
  const manifest = parseJsonFile(delivery.files, "manifest.json");
  if (!same(manifest, delivery.manifest) || manifest.delivery_id !== verification.delivery_id) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, "delivery manifest must match the checksum-verified files");
  }
  const observationsDocument = parseJsonFile(delivery.files, "observations.json");
  if (observationsDocument.record_type !== "passport_delivery_observations" || !Array.isArray(observationsDocument.observations)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, "observations.json has an invalid wrapper");
  }
  const sampleFile = delivery.files.find(({ path }) => path === "samples.csv");
  if (!sampleFile) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.structureInvalid, "samples.csv is required");
  const samples = parsePassportDeliverySamplesCsv(sampleFile.content);
  return { manifest, observations: observationsDocument.observations, samples, verification };
}

function calculateStatistics(delivery) {
  const context = extractDelivery(delivery);
  const declaredByObservation = new Map(context.manifest.summary.statistics.map((statistic) => [statistic.observation_ref.object_id, statistic]));
  const statistics = context.observations.map((observation) => {
    const rows = context.samples.filter(({ observation_id: id }) => id === observation.observation_id);
    const included = rows.filter(({ disposition }) => disposition === "included");
    const excluded = rows.filter(({ disposition }) => disposition === "excluded");
    const failed = rows.filter(({ disposition }) => disposition === "failed");
    if (rows.length !== observation.samples.attempted
        || included.length !== observation.samples.included
        || excluded.length !== observation.samples.excluded
        || failed.length !== observation.samples.failed) {
      fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${observation.observation_id} sample accounting is not closed`);
    }
    if (included.some(({ unit }) => unit !== observation.measurement.source_unit)) {
      fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${observation.observation_id} has inconsistent source units`);
    }
    const unitRule = PASSPORT_OBSERVATION_UNIT_RULES[observation.measurement.source_unit];
    if (!unitRule || unitRule.canonical_unit !== observation.measurement.normalized_unit) {
      fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${observation.observation_id} uses an unsupported unit conversion`);
    }
    const sourceValue = aggregate(included.map(({ value }) => value), observation.aggregation, observation.observation_id);
    const value = sourceValue === null ? null : stableNumber(sourceValue * unitRule.conversion_factor, `${observation.observation_id}.value`);
    const declared = declaredByObservation.get(observation.observation_id);
    if (!declared) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${observation.observation_id} is absent from the delivery summary`);
    return {
      statistic_id: observation.observation_id,
      observation_ref: declared.observation_ref,
      data_origin: observation.source.origin,
      metric_key: `${observation.metric}:${observation.aggregation}`,
      metric: observation.metric,
      aggregation: observation.aggregation,
      normalized_unit: observation.measurement.normalized_unit,
      attempted_samples: rows.length,
      included_samples: included.length,
      failed_samples: failed.length,
      excluded_samples: excluded.length,
      sample_recomputed_value: value
    };
  }).sort((left, right) => compareText(left.statistic_id, right.statistic_id));
  if (statistics.length !== context.manifest.summary.statistic_count || declaredByObservation.size !== statistics.length) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, "delivery statistic coverage is incomplete");
  }
  return deepFreeze({
    statistics_profile: structuredClone(context.manifest.statistics_profile),
    sample_count: context.samples.length,
    statistic_count: statistics.length,
    statistics
  });
}

export function recalculateIndependentReviewStatistics(input) {
  exactObject(input, ["delivery"], [], "input");
  return calculateStatistics(input.delivery);
}

function normalizeImplementation(value, label) {
  exactObject(value, ["implementation_id", "implementation_version", "runtime"], [], label);
  return {
    implementation_id: requireId(value.implementation_id, `${label}.implementation_id`),
    implementation_version: requireSemver(value.implementation_version, `${label}.implementation_version`),
    runtime: requireString(value.runtime, `${label}.runtime`, { max: 128 })
  };
}

function normalizeSubmittedStatistics(values, label) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 1024) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.resultCoverageInvalid, `${label} must contain 1 through 1024 statistics`);
  }
  const result = values.map((value, index) => {
    const itemLabel = `${label}[${index}]`;
    exactObject(value, ["statistic_id", "recalculated_value"], [], itemLabel);
    return {
      statistic_id: requireId(value.statistic_id, `${itemLabel}.statistic_id`),
      recalculated_value: value.recalculated_value === null ? null : stableNumber(value.recalculated_value, `${itemLabel}.recalculated_value`)
    };
  }).sort((left, right) => compareText(left.statistic_id, right.statistic_id));
  if (new Set(result.map(({ statistic_id: id }) => id)).size !== result.length) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.resultCoverageInvalid, `${label} must use unique statistic_id values`);
  }
  return result;
}

function reviewContext(input, recalculatedAt, createdBy) {
  let engagement;
  try {
    engagement = verifyIndependentReviewEngagement({
      record: input.engagement,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.contextMismatch, `engagement verification failed: ${error.message}`);
  }
  if (!new Set(["statistical-recalculation", "supervised-reexecution"]).has(engagement.scope.review_level)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.engagementLevelInvalid, "engagement must authorize statistical recalculation");
  }
  let independence;
  try {
    independence = assertIndependentOpinionSignerEligible({
      record: input.independence_assessment,
      engagement,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.independenceInvalid, `independence gate failed: ${error.message}`);
  }
  if (Date.parse(recalculatedAt) < Date.parse(independence.assessed_at)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.timeInvalid, "recalculation cannot predate the independence assessment");
  }
  const leadAssignment = independence.role_assignments.find(({ role }) => role === "review-lead");
  const leadSubject = independence.subjects.find(({ subject_id: id }) => id === leadAssignment.subject_id);
  if (createdBy !== leadSubject.subject_id) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.contextMismatch, "created_by must be the assigned review lead");
  }
  let grant;
  let shareProjection;
  try {
    grant = verifyPassportShareGrant({
      record: input.share_grant,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery
    });
    shareProjection = projectPassportShare({
      grant,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      revocations: input.share_revocations,
      evaluated_at: recalculatedAt
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.shareInvalid, `share verification failed: ${error.message}`);
  }
  if (!shareProjection.active
      || grant.recipient.subject_id !== leadSubject.subject_id
      || grant.recipient.organization_id !== engagement.intended_reviewer_organization_id) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.shareInvalid, "an active share must bind the exact review lead and reviewer organization");
  }
  return { engagement, independence, grant, shareProjection, leadSubject };
}

function toleranceRules(engagement, referenceStatistics) {
  const policy = engagement.scope.tolerance_policy;
  if (policy.mode === "exact") return new Map();
  const rules = new Map(policy.rules.map((rule) => [rule.metric, rule]));
  const metricKeys = referenceStatistics.map(({ metric_key: key }) => key);
  if (rules.size !== metricKeys.length || metricKeys.some((key) => !rules.has(key))) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.resultCoverageInvalid, "declared tolerance rules must cover the exact statistic set");
  }
  return rules;
}

function classifyStatistic(reference, submitted, policy, rule) {
  const expected = reference.sample_recomputed_value;
  const actual = submitted.recalculated_value;
  if (expected === null || actual === null) {
    if (expected !== actual) fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${reference.statistic_id} cannot compare null with a numeric result`);
    return {
      result: "exact",
      absolute_delta: 0,
      relative_delta_percent: 0,
      tolerance_rule_id: null,
      tolerance_comparison: "exact",
      tolerance_threshold: 0,
      explanation: "The independent result exactly matches the sample-derived null result."
    };
  }
  const absoluteDelta = stableNumber(Math.abs(actual - expected), `${reference.statistic_id}.absolute_delta`);
  const relativeDelta = expected === 0
    ? (actual === 0 ? 0 : null)
    : stableNumber((absoluteDelta / Math.abs(expected)) * 100, `${reference.statistic_id}.relative_delta_percent`);
  if (absoluteDelta === 0) {
    return {
      result: "exact",
      absolute_delta: 0,
      relative_delta_percent: 0,
      tolerance_rule_id: rule?.rule_id ?? null,
      tolerance_comparison: rule?.comparison ?? "exact",
      tolerance_threshold: rule?.threshold ?? 0,
      explanation: "The independent result exactly matches the sample-derived value."
    };
  }
  let within = false;
  let comparison = "exact";
  let threshold = 0;
  let ruleId = null;
  if (policy.mode === "declared-thresholds") {
    ruleId = rule.rule_id;
    comparison = rule.comparison;
    threshold = rule.threshold;
    if (comparison === "absolute-delta") {
      if (rule.unit !== reference.normalized_unit) {
        fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${reference.metric_key} absolute tolerance unit must match the normalized unit`);
      }
      within = absoluteDelta <= threshold;
    } else {
      if (rule.unit !== "percent") {
        fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.statisticInvalid, `${reference.metric_key} relative tolerance must use percent`);
      }
      within = relativeDelta !== null && relativeDelta <= threshold;
    }
  }
  const result = within ? "within-tolerance" : "outside-tolerance";
  const measuredDelta = comparison === "relative-percent" ? relativeDelta : absoluteDelta;
  const unit = comparison === "relative-percent" ? "percent" : reference.normalized_unit;
  const explanation = measuredDelta === null
    ? "The sample-derived value is zero, so a non-zero independent result cannot satisfy relative tolerance."
    : `The independent result differs by ${measuredDelta} ${unit}; the declared ${comparison} threshold is ${threshold} ${rule?.unit ?? reference.normalized_unit}.`;
  return {
    result,
    absolute_delta: absoluteDelta,
    relative_delta_percent: relativeDelta,
    tolerance_rule_id: ruleId,
    tolerance_comparison: comparison,
    tolerance_threshold: threshold,
    explanation
  };
}

function buildAssessment({ context, calculation, implementation, submittedStatistics }) {
  const rules = toleranceRules(context.engagement, calculation.statistics);
  const submittedById = new Map(submittedStatistics.map((statistic) => [statistic.statistic_id, statistic]));
  if (submittedById.size !== calculation.statistics.length
      || calculation.statistics.some(({ statistic_id: id }) => !submittedById.has(id))) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.resultCoverageInvalid, "independent results must cover the exact delivery statistic set");
  }
  const statistics = calculation.statistics.map((reference) => {
    const submitted = submittedById.get(reference.statistic_id);
    const rule = rules.get(reference.metric_key);
    const comparison = classifyStatistic(reference, submitted, context.engagement.scope.tolerance_policy, rule);
    return {
      ...reference,
      independently_recalculated_value: submitted.recalculated_value,
      ...comparison
    };
  });
  const differences = statistics.filter(({ result }) => result !== "exact").map((statistic) => ({
    difference_id: `difference:${fingerprintBody({ statistic_id: statistic.statistic_id, value: statistic.independently_recalculated_value }).slice(7, 23)}`,
    statistic_id: statistic.statistic_id,
    classification: statistic.result,
    expected_value: statistic.sample_recomputed_value,
    recalculated_value: statistic.independently_recalculated_value,
    absolute_delta: statistic.absolute_delta,
    relative_delta_percent: statistic.relative_delta_percent,
    tolerance_rule_id: statistic.tolerance_rule_id,
    explanation: statistic.explanation
  }));
  const exactCount = statistics.filter(({ result }) => result === "exact").length;
  const withinCount = statistics.filter(({ result }) => result === "within-tolerance").length;
  const outsideCount = statistics.filter(({ result }) => result === "outside-tolerance").length;
  return {
    implementation,
    submitted_statistics: submittedStatistics,
    structure_checklist: {
      status: "passed",
      checks: CHECK_IDS.map((checkId) => ({ check_id: checkId, status: "passed" }))
    },
    statistics,
    differences,
    summary: {
      outcome: outsideCount === 0 ? "consistent" : "deviation",
      statistic_count: statistics.length,
      exact_count: exactCount,
      within_tolerance_count: withinCount,
      outside_tolerance_count: outsideCount,
      difference_count: differences.length,
      sample_count: calculation.sample_count
    }
  };
}

function boundary() {
  return {
    limited_review_work_recorded: true,
    active_share_record_checked: true,
    structure_checks_performed: true,
    statistics_recalculated: true,
    implementation_identity_self_declared: true,
    principal_authentication_verified: false,
    organization_control_externally_verified: false,
    export_authorization_externally_verified: false,
    reviewer_independence_certified: false,
    supervised_reexecution_performed: false,
    opinion_issued: false,
    passport_status_mutated: false,
    performance_claim_allowed: false,
    sla_adjudicated: false,
    certification_issued: false
  };
}

function buildRecord(input) {
  const recalculatedAt = canonicalInstant(input.recalculated_at, "input.recalculated_at");
  const createdBy = requireId(input.created_by, "input.created_by");
  const context = reviewContext(input, recalculatedAt, createdBy);
  const calculation = calculateStatistics(input.delivery);
  const implementation = normalizeImplementation(input.implementation, "input.implementation");
  const submittedStatistics = normalizeSubmittedStatistics(input.recalculated_statistics, "input.recalculated_statistics");
  const assessment = buildAssessment({ context, calculation, implementation, submittedStatistics });
  const body = {
    schema_version: INDEPENDENT_REVIEW_RECALCULATION_VERSION,
    record_type: "independent_review_recalculation",
    recalculation_id: requireId(input.recalculation_id, "input.recalculation_id"),
    version: requireSemver(input.version, "input.version"),
    tenant_id: context.engagement.tenant_id,
    created_by: createdBy,
    recalculated_at: recalculatedAt,
    engagement_ref: engagementReference(context.engagement),
    independence_assessment_ref: independenceReference(context.independence),
    share_ref: shareReference(context.grant),
    passport_ref: structuredClone(context.engagement.scope.passport_ref),
    delivery_ref: structuredClone(context.engagement.scope.delivery_ref),
    reviewer: {
      subject_id: context.leadSubject.subject_id,
      organization_id: context.leadSubject.organization_id,
      role: "review-lead"
    },
    statistics_profile: calculation.statistics_profile,
    ...assessment,
    boundary: boundary()
  };
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

function normalizeRecord(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "recalculation_id", "version", "tenant_id", "created_by",
    "recalculated_at", "engagement_ref", "independence_assessment_ref", "share_ref", "passport_ref",
    "delivery_ref", "reviewer", "statistics_profile", "implementation", "submitted_statistics",
    "structure_checklist", "statistics", "differences", "summary", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_RECALCULATION_VERSION || value.record_type !== "independent_review_recalculation") {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  normalizeReference(value.engagement_ref, "independent_review_engagement", tenantId, `${label}.engagement_ref`);
  normalizeReference(value.independence_assessment_ref, "independent_review_independence_assessment", tenantId, `${label}.independence_assessment_ref`);
  normalizeReference(value.share_ref, "passport_share_grant", tenantId, `${label}.share_ref`);
  normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`);
  normalizeReference(value.delivery_ref, "passport_delivery_manifest", tenantId, `${label}.delivery_ref`);
  requireId(value.recalculation_id, `${label}.recalculation_id`);
  requireSemver(value.version, `${label}.version`);
  requireId(value.created_by, `${label}.created_by`);
  canonicalInstant(value.recalculated_at, `${label}.recalculated_at`);
  normalizeImplementation(value.implementation, `${label}.implementation`);
  normalizeSubmittedStatistics(value.submitted_statistics, `${label}.submitted_statistics`);
  if (!isObject(value.summary) || !new Set(["consistent", "deviation"]).has(value.summary.outcome)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.recordMismatch, `${label}.summary is invalid`);
  }
  if (!Array.isArray(value.statistics) || value.statistics.some(({ result }) => !RESULT_SET.has(result))) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.recordMismatch, `${label}.statistics are invalid`);
  }
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  const body = structuredClone(value);
  delete body.content_fingerprint;
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized record`);
  }
  return deepFreeze(structuredClone(value));
}

export function createIndependentReviewRecalculation(input) {
  exactObject(input, [
    "recalculation_id", "version", "created_by", "recalculated_at", "engagement",
    "independence_assessment", "share_grant", "share_revocations", "passport_version",
    "passport_events", "delivery", "implementation", "recalculated_statistics"
  ], ["previous_engagement"], "input");
  if (!Array.isArray(input.share_revocations) || !Array.isArray(input.passport_events)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.inputInvalid, "share_revocations and passport_events must be arrays");
  }
  return normalizeRecord(buildRecord(input));
}

export function verifyIndependentReviewRecalculation(input) {
  exactObject(input, [
    "record", "engagement", "independence_assessment", "share_grant", "share_revocations",
    "passport_version", "passport_events", "delivery"
  ], ["previous_engagement"], "input");
  const record = normalizeRecord(input.record);
  const rebuilt = buildRecord({
    recalculation_id: record.recalculation_id,
    version: record.version,
    created_by: record.created_by,
    recalculated_at: record.recalculated_at,
    engagement: input.engagement,
    independence_assessment: input.independence_assessment,
    share_grant: input.share_grant,
    share_revocations: input.share_revocations,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    implementation: record.implementation,
    recalculated_statistics: record.submitted_statistics,
    ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
  });
  if (!same(record, rebuilt)) {
    fail(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.recordMismatch, "record does not match the recomputed structure, statistics, tolerances, and differences");
  }
  return record;
}
