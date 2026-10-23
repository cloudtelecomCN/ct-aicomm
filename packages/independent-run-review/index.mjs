import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { verifyPassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import { projectPassportEvidenceVersion } from "../link-evidence-passport/versioning.mjs";

export const INDEPENDENT_REVIEW_ENGAGEMENT_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_LEVELS = Object.freeze([
  "structure-only",
  "statistical-recalculation",
  "supervised-reexecution"
]);
export const INDEPENDENT_REVIEW_TOLERANCE_MODES = Object.freeze([
  "exact",
  "declared-thresholds"
]);
export const INDEPENDENT_REVIEW_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_engagement_input_invalid",
  fieldUnknown: "independent_review_engagement_field_unknown",
  fieldMissing: "independent_review_engagement_field_missing",
  fingerprintMismatch: "independent_review_engagement_fingerprint_mismatch",
  contextMismatch: "independent_review_engagement_context_mismatch",
  timeInvalid: "independent_review_engagement_time_invalid",
  toleranceInvalid: "independent_review_engagement_tolerance_invalid",
  deliveryAgreementInvalid: "independent_review_engagement_delivery_agreement_invalid",
  lineageInvalid: "independent_review_engagement_lineage_invalid",
  scopeUnchanged: "independent_review_engagement_scope_unchanged",
  newEngagementRequired: "independent_review_engagement_new_id_required"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/;
const REVIEW_LEVELS = new Set(INDEPENDENT_REVIEW_LEVELS);
const TOLERANCE_MODES = new Set(INDEPENDENT_REVIEW_TOLERANCE_MODES);
const TOLERANCE_COMPARISONS = new Set(["absolute-delta", "relative-percent"]);
const INTENDED_USES = new Set([
  "buyer-due-diligence",
  "seller-assurance",
  "internal-governance",
  "sla-evidence-preparation",
  "other"
]);
const PROHIBITED_USES = Object.freeze([
  "certification",
  "legal-conclusion",
  "performance-guarantee",
  "production-control-authorization",
  "sla-adjudication"
]);
const DELIVERABLE_FORMATS = new Set(["application/json", "text/csv", "text/markdown"]);
const DELIVERY_MODES = new Set(["offline-package", "reference-only"]);
const DELIVERABLES_BY_LEVEL = Object.freeze({
  "structure-only": Object.freeze(["scope-record", "structure-checklist"]),
  "statistical-recalculation": Object.freeze([
    "difference-register",
    "recalculation-report",
    "scope-record",
    "structure-checklist"
  ]),
  "supervised-reexecution": Object.freeze([
    "difference-register",
    "environment-difference-register",
    "recalculation-report",
    "scope-record",
    "structure-checklist",
    "supervised-run-reference"
  ])
});
const ALL_DELIVERABLES = new Set(Object.values(DELIVERABLES_BY_LEVEL).flat());
const SCOPE_FIELDS = Object.freeze([
  "passport_ref",
  "delivery_ref",
  "review_level",
  "tolerance_policy",
  "purpose",
  "delivery_agreement"
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

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(INDEPENDENT_REVIEW_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(INDEPENDENT_REVIEW_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
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
    fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
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

function requireEnum(value, allowed, label, code = INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid) {
  if (!allowed.has(value)) fail(code, `${label} is invalid`);
  return value;
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
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

function uniqueSorted(values, label, normalize, { min = 0, max = 32 } = {}) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label} must contain ${min}-${max} entries`);
  }
  const normalized = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const encoded = normalized.map(canonical);
  if (new Set(encoded).size !== normalized.length) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label} contains duplicate entries`);
  }
  return normalized.sort((left, right) => canonical(left).localeCompare(canonical(right)));
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const reference = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (tenantId !== undefined && reference.tenant_id !== tenantId) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the engagement tenant`);
  }
  return reference;
}

function recordReference(record, objectType, idKey) {
  return {
    object_type: objectType,
    object_id: record[idKey],
    version: record.version,
    tenant_id: record.tenant_id,
    content_fingerprint: record.content_fingerprint
  };
}

function passportReference(record) {
  return recordReference(record, "passport_evidence_version", "passport_id");
}

function deliveryReference(record) {
  return recordReference(record, "passport_delivery_manifest", "delivery_id");
}

function engagementReference(record) {
  return recordReference(record, "independent_review_engagement", "engagement_id");
}

function normalizeParty(value, label) {
  exactObject(value, ["subject_id", "organization_id"], [], label);
  return {
    subject_id: requireId(value.subject_id, `${label}.subject_id`),
    organization_id: requireId(value.organization_id, `${label}.organization_id`)
  };
}

function normalizeToleranceRule(value, label) {
  exactObject(value, ["rule_id", "metric", "unit", "comparison", "threshold"], [], label);
  const threshold = value.threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1_000_000_000) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.toleranceInvalid, `${label}.threshold must be a bounded non-negative number`);
  }
  return {
    rule_id: requireId(value.rule_id, `${label}.rule_id`),
    metric: requireString(value.metric, `${label}.metric`, { max: 128 }),
    unit: requireString(value.unit, `${label}.unit`, { max: 64 }),
    comparison: requireEnum(value.comparison, TOLERANCE_COMPARISONS, `${label}.comparison`, INDEPENDENT_REVIEW_ERROR_CODES.toleranceInvalid),
    threshold
  };
}

function normalizeTolerancePolicy(value, label) {
  exactObject(value, ["mode", "rules"], [], label);
  const mode = requireEnum(value.mode, TOLERANCE_MODES, `${label}.mode`, INDEPENDENT_REVIEW_ERROR_CODES.toleranceInvalid);
  const rules = uniqueSorted(value.rules, `${label}.rules`, normalizeToleranceRule, {
    min: mode === "exact" ? 0 : 1,
    max: mode === "exact" ? 0 : 32
  });
  if (new Set(rules.map(({ rule_id: id }) => id)).size !== rules.length) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.toleranceInvalid, `${label}.rules must use unique rule_id values`);
  }
  return { mode, rules };
}

function normalizePurpose(value, label) {
  exactObject(value, ["intended_use", "statement", "prohibited_uses"], [], label);
  const prohibitedUses = uniqueSorted(
    value.prohibited_uses,
    `${label}.prohibited_uses`,
    (entry, entryLabel) => requireEnum(entry, new Set(PROHIBITED_USES), entryLabel),
    { min: PROHIBITED_USES.length, max: PROHIBITED_USES.length }
  );
  if (!same(prohibitedUses, [...PROHIBITED_USES].sort())) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label}.prohibited_uses must preserve every non-certifying boundary`);
  }
  return {
    intended_use: requireEnum(value.intended_use, INTENDED_USES, `${label}.intended_use`),
    statement: requireString(value.statement, `${label}.statement`, { min: 3, max: 500 }),
    prohibited_uses: prohibitedUses
  };
}

function normalizeDeliveryAgreement(value, reviewLevel, createdAt, label) {
  exactObject(value, ["due_at", "delivery_mode", "deliverable_formats", "language_codes", "deliverables"], [], label);
  const dueAt = canonicalInstant(value.due_at, `${label}.due_at`);
  if (Date.parse(dueAt) <= Date.parse(createdAt)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.timeInvalid, `${label}.due_at must be after engagement creation`);
  }
  const deliverableFormats = uniqueSorted(
    value.deliverable_formats,
    `${label}.deliverable_formats`,
    (entry, entryLabel) => requireEnum(entry, DELIVERABLE_FORMATS, entryLabel, INDEPENDENT_REVIEW_ERROR_CODES.deliveryAgreementInvalid),
    { min: 1, max: 3 }
  );
  const languageCodes = uniqueSorted(
    value.language_codes,
    `${label}.language_codes`,
    (entry, entryLabel) => requireString(entry, entryLabel, { max: 16, pattern: LANGUAGE }),
    { min: 1, max: 8 }
  );
  const deliverables = uniqueSorted(
    value.deliverables,
    `${label}.deliverables`,
    (entry, entryLabel) => requireEnum(entry, ALL_DELIVERABLES, entryLabel, INDEPENDENT_REVIEW_ERROR_CODES.deliveryAgreementInvalid),
    { min: 1, max: ALL_DELIVERABLES.size }
  );
  if (!same(deliverables, DELIVERABLES_BY_LEVEL[reviewLevel])) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.deliveryAgreementInvalid, `${label}.deliverables must exactly match review_level ${reviewLevel}`);
  }
  return {
    due_at: dueAt,
    delivery_mode: requireEnum(value.delivery_mode, DELIVERY_MODES, `${label}.delivery_mode`, INDEPENDENT_REVIEW_ERROR_CODES.deliveryAgreementInvalid),
    deliverable_formats: deliverableFormats,
    language_codes: languageCodes,
    deliverables
  };
}

function normalizeScope(value, tenantId, createdAt, label) {
  exactObject(value, SCOPE_FIELDS, [], label);
  const reviewLevel = requireEnum(value.review_level, REVIEW_LEVELS, `${label}.review_level`);
  return {
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    delivery_ref: normalizeReference(value.delivery_ref, "passport_delivery_manifest", tenantId, `${label}.delivery_ref`),
    review_level: reviewLevel,
    tolerance_policy: normalizeTolerancePolicy(value.tolerance_policy, `${label}.tolerance_policy`),
    purpose: normalizePurpose(value.purpose, `${label}.purpose`),
    delivery_agreement: normalizeDeliveryAgreement(value.delivery_agreement, reviewLevel, createdAt, `${label}.delivery_agreement`)
  };
}

function normalizeBoundary(value, label) {
  const fields = [
    "engagement_only",
    "identity_authenticated",
    "reviewer_independence_verified",
    "evidence_access_authorized",
    "review_performed",
    "opinion_issued",
    "passport_status_mutated",
    "performance_claim_allowed",
    "sla_adjudicated",
    "certification_issued"
  ];
  exactObject(value, fields, [], label);
  if (value.engagement_only !== true || fields.slice(1).some((field) => value[field] !== false)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label} must remain engagement-only, unverified, non-executing, and non-certifying`);
  }
  return {
    engagement_only: true,
    identity_authenticated: false,
    reviewer_independence_verified: false,
    evidence_access_authorized: false,
    review_performed: false,
    opinion_issued: false,
    passport_status_mutated: false,
    performance_claim_allowed: false,
    sla_adjudicated: false,
    certification_issued: false
  };
}

function normalizeEngagementRecord(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "engagement_id", "version", "tenant_id",
    "created_by", "created_at", "commissioning_party", "intended_reviewer_organization_id",
    "scope", "supersedes_engagement_ref", "scope_change_reason", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_ENGAGEMENT_VERSION || value.record_type !== "independent_review_engagement") {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const createdAt = canonicalInstant(value.created_at, `${label}.created_at`);
  const supersedes = value.supersedes_engagement_ref === null
    ? null
    : normalizeReference(value.supersedes_engagement_ref, "independent_review_engagement", tenantId, `${label}.supersedes_engagement_ref`);
  const reason = value.scope_change_reason === null
    ? null
    : requireString(value.scope_change_reason, `${label}.scope_change_reason`, { min: 3, max: 500 });
  if ((supersedes === null) !== (reason === null)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.lineageInvalid, `${label} must pair supersedes_engagement_ref with scope_change_reason`);
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_ENGAGEMENT_VERSION,
    record_type: "independent_review_engagement",
    engagement_id: requireId(value.engagement_id, `${label}.engagement_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: createdAt,
    commissioning_party: normalizeParty(value.commissioning_party, `${label}.commissioning_party`),
    intended_reviewer_organization_id: requireId(value.intended_reviewer_organization_id, `${label}.intended_reviewer_organization_id`),
    scope: normalizeScope(value.scope, tenantId, createdAt, `${label}.scope`),
    supersedes_engagement_ref: supersedes,
    scope_change_reason: reason,
    boundary: normalizeBoundary(value.boundary, `${label}.boundary`)
  };
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized engagement`);
  }
  return deepFreeze({ ...body, content_fingerprint: fingerprint });
}

function parseDelivery(input, label) {
  exactObject(input, ["manifest", "files"], [], label);
  let verification;
  try {
    verification = verifyPassportDeliveryPackage({ files: input.files });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label} failed offline verification: ${error.message}`);
  }
  const manifestFile = input.files.find(({ path: filePath }) => filePath === "manifest.json");
  if (!manifestFile || typeof manifestFile.content !== "string") {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label} must contain manifest.json`);
  }
  let parsed;
  try {
    parsed = JSON.parse(manifestFile.content);
  } catch {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label}.manifest.json must contain valid JSON`);
  }
  if (!same(parsed, input.manifest) || parsed.delivery_id !== verification.delivery_id) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, `${label}.manifest must match the verified delivery files`);
  }
  return { manifest: parsed, verification };
}

function engagementContext({ passportVersion, passportEvents, delivery, evaluatedAt }, label = "context") {
  if (!Array.isArray(passportEvents)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid, `${label}.passport_events must be an array`);
  }
  const instant = canonicalInstant(evaluatedAt, `${label}.evaluated_at`);
  const projection = projectPassportEvidenceVersion({
    version: passportVersion,
    events: passportEvents,
    evaluated_at: instant
  });
  if (!projection.active || projection.lifecycle_state !== "sealed") {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, "an engagement requires an active sealed passport version at creation time");
  }
  const verifiedDelivery = parseDelivery(delivery, `${label}.delivery`);
  if (!same(verifiedDelivery.manifest.passport_ref, passportReference(passportVersion))) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, "delivery must bind the exact passport version under review");
  }
  if (verifiedDelivery.manifest.tenant_id !== passportVersion.tenant_id) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, "delivery and passport tenant must match");
  }
  if (Date.parse(instant) < Date.parse(verifiedDelivery.manifest.created_at)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.timeInvalid, "engagement creation cannot precede delivery creation");
  }
  return {
    passportProjection: projection,
    passportRef: passportReference(passportVersion),
    manifest: verifiedDelivery.manifest,
    deliveryRef: deliveryReference(verifiedDelivery.manifest),
    deliveryVerification: verifiedDelivery.verification
  };
}

function changedScopeFields(baseline, candidate) {
  return SCOPE_FIELDS.filter((field) => !same(baseline[field], candidate[field]));
}

function validateLineage(record, previousEngagement) {
  if (previousEngagement === undefined) {
    if (record.supersedes_engagement_ref !== null || record.scope_change_reason !== null) {
      fail(INDEPENDENT_REVIEW_ERROR_CODES.lineageInvalid, "an initial engagement cannot declare a predecessor");
    }
    return [];
  }
  const previous = normalizeEngagementRecord(previousEngagement, "previous_engagement");
  if (record.tenant_id !== previous.tenant_id) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.lineageInvalid, "engagement successors cannot cross tenant boundaries");
  }
  if (record.engagement_id === previous.engagement_id) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.newEngagementRequired, "scope changes require a new engagement_id");
  }
  if (!same(record.supersedes_engagement_ref, engagementReference(previous))) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.lineageInvalid, "successor must reference the exact previous engagement");
  }
  if (Date.parse(record.created_at) <= Date.parse(previous.created_at)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.timeInvalid, "successor engagement must be created after its predecessor");
  }
  const changedFields = changedScopeFields(previous.scope, record.scope);
  if (changedFields.length === 0) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.scopeUnchanged, "a successor engagement must declare at least one scope change");
  }
  return changedFields;
}

export function createIndependentReviewEngagement(input) {
  exactObject(input, [
    "engagement_id", "version", "created_by", "created_at", "commissioning_party",
    "intended_reviewer_organization_id", "review_level", "tolerance_policy", "purpose",
    "delivery_agreement", "passport_version", "passport_events", "delivery"
  ], ["previous_engagement", "scope_change_reason"], "input");
  const createdAt = canonicalInstant(input.created_at, "input.created_at");
  const context = engagementContext({
    passportVersion: input.passport_version,
    passportEvents: input.passport_events,
    delivery: input.delivery,
    evaluatedAt: createdAt
  });
  const previous = input.previous_engagement === undefined
    ? undefined
    : normalizeEngagementRecord(input.previous_engagement, "input.previous_engagement");
  const reason = input.scope_change_reason === undefined
    ? null
    : requireString(input.scope_change_reason, "input.scope_change_reason", { min: 3, max: 500 });
  if ((previous === undefined) !== (reason === null)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.lineageInvalid, "successor creation requires both previous_engagement and scope_change_reason");
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_ENGAGEMENT_VERSION,
    record_type: "independent_review_engagement",
    engagement_id: input.engagement_id,
    version: input.version,
    tenant_id: input.passport_version.tenant_id,
    created_by: input.created_by,
    created_at: createdAt,
    commissioning_party: input.commissioning_party,
    intended_reviewer_organization_id: input.intended_reviewer_organization_id,
    scope: {
      passport_ref: context.passportRef,
      delivery_ref: context.deliveryRef,
      review_level: input.review_level,
      tolerance_policy: input.tolerance_policy,
      purpose: input.purpose,
      delivery_agreement: input.delivery_agreement
    },
    supersedes_engagement_ref: previous === undefined ? null : engagementReference(previous),
    scope_change_reason: reason,
    boundary: {
      engagement_only: true,
      identity_authenticated: false,
      reviewer_independence_verified: false,
      evidence_access_authorized: false,
      review_performed: false,
      opinion_issued: false,
      passport_status_mutated: false,
      performance_claim_allowed: false,
      sla_adjudicated: false,
      certification_issued: false
    }
  };
  const normalizedBody = normalizeEngagementRecord({
    ...body,
    content_fingerprint: fingerprintBody({
      ...body,
      scope: normalizeScope(body.scope, body.tenant_id, createdAt, "input.scope"),
      commissioning_party: normalizeParty(body.commissioning_party, "input.commissioning_party")
    })
  });
  validateLineage(normalizedBody, previous);
  return normalizedBody;
}

export function verifyIndependentReviewEngagement(input) {
  exactObject(input, ["record", "passport_version", "passport_events", "delivery"], ["previous_engagement"], "input");
  const record = normalizeEngagementRecord(input.record);
  const context = engagementContext({
    passportVersion: input.passport_version,
    passportEvents: input.passport_events,
    delivery: input.delivery,
    evaluatedAt: record.created_at
  });
  if (!same(record.scope.passport_ref, context.passportRef)
      || !same(record.scope.delivery_ref, context.deliveryRef)) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, "engagement must bind the exact verified passport version and delivery manifest");
  }
  validateLineage(record, input.previous_engagement);
  return record;
}

export function compareIndependentReviewScope(input) {
  exactObject(input, ["baseline", "candidate"], [], "input");
  const baseline = normalizeEngagementRecord(input.baseline, "input.baseline");
  const candidate = normalizeEngagementRecord(input.candidate, "input.candidate");
  if (baseline.tenant_id !== candidate.tenant_id) {
    fail(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch, "scope comparison cannot cross tenant boundaries");
  }
  const changedFields = changedScopeFields(baseline.scope, candidate.scope);
  const newEngagementSatisfied = changedFields.length > 0
    && baseline.engagement_id !== candidate.engagement_id
    && same(candidate.supersedes_engagement_ref, engagementReference(baseline));
  return deepFreeze({
    schema_version: INDEPENDENT_REVIEW_ENGAGEMENT_VERSION,
    baseline_ref: engagementReference(baseline),
    candidate_ref: engagementReference(candidate),
    scope_changed: changedFields.length > 0,
    changed_fields: changedFields,
    new_engagement_required: changedFields.length > 0,
    new_engagement_satisfied: newEngagementSatisfied
  });
}
