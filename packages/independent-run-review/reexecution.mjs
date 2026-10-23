import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { verifyPassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import {
  projectPassportShare,
  verifyPassportShareGrant
} from "../link-evidence-passport/sharing.mjs";
import { verifyIndependentReviewEngagement } from "./index.mjs";
import { assertIndependentOpinionSignerEligible } from "./independence.mjs";
import { verifyIndependentReviewRecalculation } from "./recalculation.mjs";

export const INDEPENDENT_REVIEW_REEXECUTION_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS = Object.freeze([
  "sites",
  "protocol",
  "workload",
  "method",
  "compute",
  "software",
  "network"
]);
export const INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_reexecution_input_invalid",
  fieldUnknown: "independent_review_reexecution_field_unknown",
  fieldMissing: "independent_review_reexecution_field_missing",
  fingerprintMismatch: "independent_review_reexecution_fingerprint_mismatch",
  contextMismatch: "independent_review_reexecution_context_mismatch",
  timeInvalid: "independent_review_reexecution_time_invalid",
  engagementLevelInvalid: "independent_review_reexecution_engagement_level_invalid",
  independenceInvalid: "independent_review_reexecution_independence_invalid",
  shareInvalid: "independent_review_reexecution_share_invalid",
  deliveryInvalid: "independent_review_reexecution_delivery_invalid",
  recalculationInvalid: "independent_review_reexecution_recalculation_invalid",
  environmentInvalid: "independent_review_reexecution_environment_invalid",
  supervisionInvalid: "independent_review_reexecution_supervision_invalid",
  recordMismatch: "independent_review_reexecution_record_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const CURRENT_BASES = new Set(["declared", "observed", "unknown"]);
const DATA_ORIGINS = new Set(["measured", "synthetic", "inferred", "declared"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.inputInvalid, `${label} must be an object`);
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.fieldMissing, `${label}.${field} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.fieldUnknown, `${label}.${field} is not allowed`);
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
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.inputInvalid, `${label} is invalid`);
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
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return text;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function fingerprint(value) {
  return digestEvidenceBytes(Buffer.from(canonical(value), "utf8"));
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

function parseJsonFile(files, path) {
  const file = files.find(({ path: candidate }) => candidate === path);
  if (!file || typeof file.content !== "string") {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.deliveryInvalid, `${path} is required as UTF-8 text`);
  }
  try {
    return JSON.parse(file.content);
  } catch {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.deliveryInvalid, `${path} must contain valid JSON`);
  }
}

function verifiedDelivery(delivery) {
  if (!isObject(delivery) || !Array.isArray(delivery.files) || !isObject(delivery.manifest)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.deliveryInvalid, "delivery must contain manifest and files");
  }
  let verification;
  try {
    verification = verifyPassportDeliveryPackage({ files: delivery.files });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.deliveryInvalid, `delivery verification failed: ${error.message}`);
  }
  const manifest = parseJsonFile(delivery.files, "manifest.json");
  if (!same(manifest, delivery.manifest) || manifest.delivery_id !== verification.delivery_id) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.deliveryInvalid, "delivery manifest must match the checksum-verified files");
  }
  return { manifest, freeze: parseJsonFile(delivery.files, "freeze.json") };
}

function historicalEnvironment(freeze) {
  if (!isObject(freeze.scenario) || !Array.isArray(freeze.scenario.sites)
      || !isObject(freeze.scenario.protocol) || !isObject(freeze.scenario.workload)
      || !isObject(freeze.method_template)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, "freeze.json lacks the required scenario and method dimensions");
  }
  const known = new Map([
    ["sites", freeze.scenario.sites],
    ["protocol", freeze.scenario.protocol],
    ["workload", freeze.scenario.workload],
    ["method", freeze.method_template]
  ]);
  return INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS.map((dimension) => (
    known.has(dimension)
      ? { dimension, basis: "historical-package", fingerprint: fingerprint(known.get(dimension)) }
      : { dimension, basis: "unknown", fingerprint: null }
  ));
}

function normalizeEnvironmentSnapshot(value, label) {
  exactObject(value, ["dimensions"], [], label);
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS.length) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, `${label}.dimensions must contain the fixed seven dimensions`);
  }
  const byDimension = new Map();
  value.dimensions.forEach((entry, index) => {
    const entryLabel = `${label}.dimensions[${index}]`;
    exactObject(entry, ["dimension", "basis", "fingerprint"], [], entryLabel);
    const dimension = requireString(entry.dimension, `${entryLabel}.dimension`, { max: 32 });
    if (!INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS.includes(dimension) || byDimension.has(dimension)) {
      fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, `${entryLabel}.dimension must be unique and recognized`);
    }
    if (!CURRENT_BASES.has(entry.basis)) {
      fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, `${entryLabel}.basis is invalid`);
    }
    const valueFingerprint = entry.basis === "unknown"
      ? (entry.fingerprint === null ? null : fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, `${entryLabel}.fingerprint must be null when basis is unknown`))
      : requireHash(entry.fingerprint, `${entryLabel}.fingerprint`);
    byDimension.set(dimension, { dimension, basis: entry.basis, fingerprint: valueFingerprint });
  });
  return {
    dimensions: INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS.map((dimension) => {
      if (!byDimension.has(dimension)) {
        fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid, `${label} is missing ${dimension}`);
      }
      return byDimension.get(dimension);
    })
  };
}

function compareEnvironment(delivery, currentEnvironment) {
  const { freeze } = verifiedDelivery(delivery);
  const historical = historicalEnvironment(freeze);
  const current = normalizeEnvironmentSnapshot(currentEnvironment, "current_environment");
  const differences = historical.map((historicalEntry, index) => {
    const currentEntry = current.dimensions[index];
    const classification = historicalEntry.fingerprint === null || currentEntry.fingerprint === null
      ? "unknown"
      : historicalEntry.fingerprint === currentEntry.fingerprint ? "same" : "changed";
    return {
      dimension: historicalEntry.dimension,
      historical: historicalEntry,
      current: currentEntry,
      classification
    };
  });
  return deepFreeze({
    current_environment: current,
    differences,
    summary: {
      dimension_count: differences.length,
      same_count: differences.filter(({ classification }) => classification === "same").length,
      changed_count: differences.filter(({ classification }) => classification === "changed").length,
      unknown_count: differences.filter(({ classification }) => classification === "unknown").length,
      historical_state_reproduced: false
    }
  });
}

export function compareIndependentReviewRunEnvironment(input) {
  exactObject(input, ["delivery", "current_environment"], [], "input");
  return compareEnvironment(input.delivery, input.current_environment);
}

function normalizeNewRun(value, tenantId) {
  exactObject(value, [
    "run_id", "version", "tenant_id", "started_at", "completed_at", "data_origin",
    "artifact_manifest_fingerprint", "environment_snapshot"
  ], [], "input.new_run");
  const startedAt = canonicalInstant(value.started_at, "input.new_run.started_at");
  const completedAt = canonicalInstant(value.completed_at, "input.new_run.completed_at");
  if (Date.parse(completedAt) <= Date.parse(startedAt)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid, "new_run.completed_at must be after new_run.started_at");
  }
  if (value.tenant_id !== tenantId) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.contextMismatch, "new_run.tenant_id must match the engagement tenant");
  }
  if (!DATA_ORIGINS.has(value.data_origin)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.inputInvalid, "new_run.data_origin is invalid");
  }
  const environmentSnapshot = normalizeEnvironmentSnapshot(value.environment_snapshot, "input.new_run.environment_snapshot");
  const body = {
    run_id: requireId(value.run_id, "input.new_run.run_id"),
    version: requireSemver(value.version, "input.new_run.version"),
    tenant_id: requireId(value.tenant_id, "input.new_run.tenant_id"),
    started_at: startedAt,
    completed_at: completedAt,
    data_origin: value.data_origin,
    artifact_manifest_fingerprint: requireHash(value.artifact_manifest_fingerprint, "input.new_run.artifact_manifest_fingerprint"),
    environment_snapshot: environmentSnapshot
  };
  return { ...body, content_fingerprint: fingerprint(body) };
}

function normalizeSupervision(value, leadSubject, newRun) {
  exactObject(value, [
    "mode", "supervisor_subject_id", "supervisor_organization_id", "started_at",
    "completed_at", "event_count", "event_log_fingerprint"
  ], [], "input.supervision");
  if (value.mode !== "live-observation") {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid, "supervision.mode must be live-observation");
  }
  const startedAt = canonicalInstant(value.started_at, "input.supervision.started_at");
  const completedAt = canonicalInstant(value.completed_at, "input.supervision.completed_at");
  if (Date.parse(startedAt) > Date.parse(newRun.started_at) || Date.parse(completedAt) < Date.parse(newRun.completed_at)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid, "the supervision window must cover the complete new run");
  }
  if (!Number.isSafeInteger(value.event_count) || value.event_count < 1 || value.event_count > 1000000) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid, "supervision.event_count must be a positive bounded integer");
  }
  if (value.supervisor_subject_id !== leadSubject.subject_id
      || value.supervisor_organization_id !== leadSubject.organization_id) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid, "the assigned review lead must supervise the run");
  }
  return {
    mode: "live-observation",
    supervisor_subject_id: requireId(value.supervisor_subject_id, "input.supervision.supervisor_subject_id"),
    supervisor_organization_id: requireId(value.supervisor_organization_id, "input.supervision.supervisor_organization_id"),
    started_at: startedAt,
    completed_at: completedAt,
    event_count: value.event_count,
    event_log_fingerprint: requireHash(value.event_log_fingerprint, "input.supervision.event_log_fingerprint")
  };
}

function reviewContext(input, recordedAt, createdBy) {
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
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.contextMismatch, `engagement verification failed: ${error.message}`);
  }
  if (engagement.scope.review_level !== "supervised-reexecution") {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.engagementLevelInvalid, "engagement must authorize supervised re-execution");
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
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.independenceInvalid, `independence gate failed: ${error.message}`);
  }
  const leadAssignment = independence.role_assignments.find(({ role }) => role === "review-lead");
  const leadSubject = independence.subjects.find(({ subject_id: id }) => id === leadAssignment.subject_id);
  if (createdBy !== leadSubject.subject_id) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.contextMismatch, "created_by must be the assigned review lead");
  }
  let grant;
  try {
    grant = verifyPassportShareGrant({
      record: input.share_grant,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.shareInvalid, `share verification failed: ${error.message}`);
  }
  if (grant.recipient.subject_id !== leadSubject.subject_id
      || grant.recipient.organization_id !== engagement.intended_reviewer_organization_id) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.shareInvalid, "share must bind the exact review lead and reviewer organization");
  }
  let recalculation;
  try {
    recalculation = verifyIndependentReviewRecalculation({
      record: input.historical_recalculation,
      engagement,
      independence_assessment: independence,
      share_grant: grant,
      share_revocations: input.share_revocations,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.recalculationInvalid, `historical recalculation verification failed: ${error.message}`);
  }
  if (Date.parse(recordedAt) < Date.parse(independence.assessed_at)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid, "recorded_at cannot predate the independence assessment");
  }
  return { engagement, independence, leadSubject, grant, recalculation };
}

function assertShareActive(input, grant, times) {
  for (const evaluatedAt of times) {
    let projection;
    try {
      projection = projectPassportShare({
        grant,
        passport_version: input.passport_version,
        passport_events: input.passport_events,
        delivery: input.delivery,
        revocations: input.share_revocations,
        evaluated_at: evaluatedAt
      });
    } catch (error) {
      fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.shareInvalid, `share projection failed: ${error.message}`);
    }
    if (!projection.active) {
      fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.shareInvalid, `review share must be active at ${evaluatedAt}`);
    }
  }
}

function boundary() {
  return {
    historical_package_referenced: true,
    later_run_recorded: true,
    supervision_recorded: true,
    environment_differences_recorded: true,
    historical_state_reproduced: false,
    supervision_externally_attested: false,
    principal_authentication_verified: false,
    organization_control_externally_verified: false,
    export_authorization_externally_verified: false,
    reviewer_independence_certified: false,
    opinion_issued: false,
    passport_status_mutated: false,
    performance_claim_allowed: false,
    sla_adjudicated: false,
    certification_issued: false
  };
}

function buildRecord(input) {
  const recordedAt = canonicalInstant(input.recorded_at, "input.recorded_at");
  const createdBy = requireId(input.created_by, "input.created_by");
  const context = reviewContext(input, recordedAt, createdBy);
  const { manifest } = verifiedDelivery(input.delivery);
  const newRun = normalizeNewRun(input.new_run, context.engagement.tenant_id);
  if (Date.parse(newRun.started_at) <= Date.parse(manifest.created_at)
      || Date.parse(newRun.started_at) <= Date.parse(context.recalculation.recalculated_at)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid, "new run must start after the historical delivery and recalculation");
  }
  if (Date.parse(recordedAt) < Date.parse(newRun.completed_at)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid, "recorded_at cannot predate new_run.completed_at");
  }
  assertShareActive(input, context.grant, [newRun.started_at, newRun.completed_at, recordedAt]);
  const supervision = normalizeSupervision(input.supervision, context.leadSubject, newRun);
  const environment = compareEnvironment(input.delivery, newRun.environment_snapshot);
  const body = {
    schema_version: INDEPENDENT_REVIEW_REEXECUTION_VERSION,
    record_type: "independent_review_supervised_reexecution",
    reexecution_id: requireId(input.reexecution_id, "input.reexecution_id"),
    version: requireSemver(input.version, "input.version"),
    tenant_id: context.engagement.tenant_id,
    created_by: createdBy,
    recorded_at: recordedAt,
    engagement_ref: reference(context.engagement, "independent_review_engagement", "engagement_id"),
    independence_assessment_ref: reference(context.independence, "independent_review_independence_assessment", "assessment_id"),
    share_ref: reference(context.grant, "passport_share_grant", "share_id"),
    passport_ref: structuredClone(context.engagement.scope.passport_ref),
    delivery_ref: structuredClone(context.engagement.scope.delivery_ref),
    historical_recalculation_ref: reference(context.recalculation, "independent_review_recalculation", "recalculation_id"),
    historical_run_ref: structuredClone(manifest.run_ref),
    reviewer: {
      subject_id: context.leadSubject.subject_id,
      organization_id: context.leadSubject.organization_id,
      role: "review-lead"
    },
    new_run: newRun,
    supervision,
    temporal_relation: {
      classification: "later-execution",
      historical_delivery_created_at: manifest.created_at,
      historical_recalculated_at: context.recalculation.recalculated_at,
      new_run_started_at: newRun.started_at,
      historical_state_reproduced: false
    },
    environment_difference_register: environment.differences,
    summary: {
      ...environment.summary,
      supervision_covers_complete_run: true,
      comparison_status: "environment-differences-recorded",
      performance_conclusion: "not-issued"
    },
    boundary: boundary()
  };
  return deepFreeze({ ...body, content_fingerprint: fingerprint(body) });
}

function normalizeRecord(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "reexecution_id", "version", "tenant_id", "created_by",
    "recorded_at", "engagement_ref", "independence_assessment_ref", "share_ref", "passport_ref",
    "delivery_ref", "historical_recalculation_ref", "historical_run_ref", "reviewer", "new_run",
    "supervision", "temporal_relation", "environment_difference_register", "summary", "boundary",
    "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_REEXECUTION_VERSION
      || value.record_type !== "independent_review_supervised_reexecution") {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  requireId(value.reexecution_id, `${label}.reexecution_id`);
  requireSemver(value.version, `${label}.version`);
  requireId(value.tenant_id, `${label}.tenant_id`);
  requireId(value.created_by, `${label}.created_by`);
  canonicalInstant(value.recorded_at, `${label}.recorded_at`);
  const contentFingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  const body = structuredClone(value);
  delete body.content_fingerprint;
  if (fingerprint(body) !== contentFingerprint) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the record`);
  }
  return deepFreeze(structuredClone(value));
}

export function createIndependentReviewSupervisedReexecution(input) {
  exactObject(input, [
    "reexecution_id", "version", "created_by", "recorded_at", "engagement",
    "independence_assessment", "share_grant", "share_revocations", "passport_version",
    "passport_events", "delivery", "historical_recalculation", "new_run", "supervision"
  ], ["previous_engagement"], "input");
  if (!Array.isArray(input.share_revocations) || !Array.isArray(input.passport_events)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.inputInvalid, "share_revocations and passport_events must be arrays");
  }
  return normalizeRecord(buildRecord(input));
}

export function verifyIndependentReviewSupervisedReexecution(input) {
  exactObject(input, [
    "record", "engagement", "independence_assessment", "share_grant", "share_revocations",
    "passport_version", "passport_events", "delivery", "historical_recalculation"
  ], ["previous_engagement"], "input");
  const record = normalizeRecord(input.record);
  const rebuilt = buildRecord({
    reexecution_id: record.reexecution_id,
    version: record.version,
    created_by: record.created_by,
    recorded_at: record.recorded_at,
    engagement: input.engagement,
    independence_assessment: input.independence_assessment,
    share_grant: input.share_grant,
    share_revocations: input.share_revocations,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    historical_recalculation: input.historical_recalculation,
    new_run: {
      run_id: record.new_run.run_id,
      version: record.new_run.version,
      tenant_id: record.new_run.tenant_id,
      started_at: record.new_run.started_at,
      completed_at: record.new_run.completed_at,
      data_origin: record.new_run.data_origin,
      artifact_manifest_fingerprint: record.new_run.artifact_manifest_fingerprint,
      environment_snapshot: record.new_run.environment_snapshot
    },
    supervision: record.supervision,
    ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
  });
  if (!same(record, rebuilt)) {
    fail(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.recordMismatch, "record does not match the recomputed historical binding, supervision, and environment differences");
  }
  return record;
}
