import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { verifyIndependentReviewOpinionLifecycle } from "./opinion.mjs";

export const INDEPENDENT_REVIEW_WORKSPACE_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_SCOPE_MARK_STATES = Object.freeze([
  "eligible",
  "blocked",
  "withdrawn"
]);
export const INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_workspace_input_invalid",
  fieldUnknown: "independent_review_workspace_field_unknown",
  fieldMissing: "independent_review_workspace_field_missing",
  fingerprintMismatch: "independent_review_workspace_fingerprint_mismatch",
  contextMismatch: "independent_review_workspace_context_mismatch",
  timeInvalid: "independent_review_workspace_time_invalid",
  markIneligible: "independent_review_workspace_mark_ineligible",
  fileSetMismatch: "independent_review_workspace_file_set_mismatch",
  checksumMismatch: "independent_review_workspace_checksum_mismatch",
  contentMismatch: "independent_review_workspace_content_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const MARK_ELIGIBLE_STATUSES = new Set(["issued", "corrected"]);
const OPINION_STATUSES = new Set([
  "issued",
  "under-appeal",
  "correction-required",
  "withdrawal-required",
  "corrected",
  "withdrawn"
]);
const OPINION_OUTCOMES = new Set(["consistent", "deviation", "uncertain"]);
const LIMITATIONS = Object.freeze([
  "declared-identity-not-authenticated",
  "reviewer-independence-not-certified",
  "export-authorization-not-externally-verified",
  "historical-state-not-reproduced",
  "no-performance-guarantee",
  "no-sla-adjudication",
  "not-a-legal-conclusion",
  "not-certification"
]);
const WORKFLOW_STEP_IDS = Object.freeze([
  "scope",
  "independence",
  "recalculation",
  "reexecution",
  "opinion",
  "scope-mark"
]);
const WORKFLOW_STATES = new Set([
  "complete",
  "not-required",
  "attention",
  "blocked",
  "withdrawn",
  "ready"
]);
const EXACT_EXPORT_FILES = Object.freeze([
  "README.md",
  "SHA256SUMS",
  "manifest.json",
  "scope-mark.json",
  "workspace.json"
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
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
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
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
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
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function digestText(value) {
  return digestEvidenceBytes(Buffer.from(value, "utf8"));
}

function fingerprintBody(body) {
  return digestText(canonical(body));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const normalized = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (tenantId !== undefined && normalized.tenant_id !== tenantId) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the workspace tenant`);
  }
  return normalized;
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

function normalizeReviewerOrganization(value, label) {
  exactObject(value, ["organization_id", "display_name"], [], label);
  return {
    organization_id: requireId(value.organization_id, `${label}.organization_id`),
    display_name: requireString(value.display_name, `${label}.display_name`, { min: 2, max: 160 })
  };
}

function normalizeLimitations(value, label) {
  if (!Array.isArray(value) || value.length !== LIMITATIONS.length) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} must preserve every CT-621 limitation`);
  }
  const normalized = value.map((entry, index) => requireString(entry, `${label}[${index}]`, { max: 128 }));
  if (!same(normalized, LIMITATIONS)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} must preserve the ordered CT-621 limitation set`);
  }
  return [...LIMITATIONS];
}

function normalizeWorkflowStep(value, label) {
  exactObject(value, ["step_id", "state", "source_fingerprint"], [], label);
  if (!WORKFLOW_STEP_IDS.includes(value.step_id) || !WORKFLOW_STATES.has(value.state)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an unsupported step or state`);
  }
  return {
    step_id: value.step_id,
    state: value.state,
    source_fingerprint: value.source_fingerprint === null
      ? null
      : requireHash(value.source_fingerprint, `${label}.source_fingerprint`)
  };
}

function normalizeScope(value, tenantId, label) {
  exactObject(value, [
    "review_level", "intended_use", "purpose_statement", "tolerance_mode",
    "deliverables", "passport_ref", "delivery_ref"
  ], [], label);
  if (!Array.isArray(value.deliverables) || value.deliverables.length === 0 || value.deliverables.length > 16) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.deliverables must be a non-empty bounded array`);
  }
  return {
    review_level: requireString(value.review_level, `${label}.review_level`, { max: 64 }),
    intended_use: requireString(value.intended_use, `${label}.intended_use`, { max: 64 }),
    purpose_statement: requireString(value.purpose_statement, `${label}.purpose_statement`, { min: 3, max: 500 }),
    tolerance_mode: requireString(value.tolerance_mode, `${label}.tolerance_mode`, { max: 64 }),
    deliverables: value.deliverables.map((entry, index) => requireString(entry, `${label}.deliverables[${index}]`, { max: 128 })),
    passport_ref: normalizeReference(value.passport_ref, "passport_evidence_version", tenantId, `${label}.passport_ref`),
    delivery_ref: normalizeReference(value.delivery_ref, "passport_delivery_manifest", tenantId, `${label}.delivery_ref`)
  };
}

function normalizeOpinionSummary(value, tenantId, label) {
  exactObject(value, [
    "opinion_ref", "original_issued_at", "effective_at", "status", "outcome",
    "statement", "reason_codes", "finding_fingerprint", "event_count",
    "appeal_count", "correction_count", "open_appeal_count"
  ], [], label);
  if (!Array.isArray(value.reason_codes) || value.reason_codes.length > 32) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.reason_codes must be a bounded array`);
  }
  for (const field of ["event_count", "appeal_count", "correction_count", "open_appeal_count"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.${field} must be a non-negative integer`);
    }
  }
  if (!OPINION_STATUSES.has(value.status) || !OPINION_OUTCOMES.has(value.outcome)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an unsupported status or outcome`);
  }
  return {
    opinion_ref: normalizeReference(value.opinion_ref, "independent_review_opinion", tenantId, `${label}.opinion_ref`),
    original_issued_at: canonicalInstant(value.original_issued_at, `${label}.original_issued_at`),
    effective_at: canonicalInstant(value.effective_at, `${label}.effective_at`),
    status: requireString(value.status, `${label}.status`, { max: 64 }),
    outcome: requireString(value.outcome, `${label}.outcome`, { max: 32 }),
    statement: requireString(value.statement, `${label}.statement`, { min: 3, max: 1000 }),
    reason_codes: value.reason_codes.map((entry, index) => requireString(entry, `${label}.reason_codes[${index}]`, { max: 128 })),
    finding_fingerprint: requireHash(value.finding_fingerprint, `${label}.finding_fingerprint`),
    event_count: value.event_count,
    appeal_count: value.appeal_count,
    correction_count: value.correction_count,
    open_appeal_count: value.open_appeal_count
  };
}

function normalizeEligibility(value, label) {
  exactObject(value, ["eligible", "state", "blockers"], [], label);
  if (typeof value.eligible !== "boolean" || !INDEPENDENT_REVIEW_SCOPE_MARK_STATES.includes(value.state)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an invalid state`);
  }
  if (!Array.isArray(value.blockers) || value.blockers.length > 8) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.blockers must be a bounded array`);
  }
  const blockers = value.blockers.map((entry, index) => requireString(entry, `${label}.blockers[${index}]`, { max: 128 }));
  if (value.eligible !== (value.state === "eligible") || (value.eligible && blockers.length > 0)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} eligibility does not match its state and blockers`);
  }
  return { eligible: value.eligible, state: value.state, blockers };
}

function normalizeBoundary(value, label, kind) {
  const common = [
    "scope_bound", "identity_authenticated", "organization_control_externally_verified",
    "export_authorization_externally_verified", "reviewer_independence_certified",
    "historical_state_reproduced", "performance_claim_allowed", "sla_adjudicated",
    "legal_conclusion_issued", "certification_issued"
  ];
  const fields = kind === "workspace"
    ? [...common, "read_model_only", "customer_data_persisted"]
    : [...common, "trusted_signature_attached"];
  exactObject(value, fields, [], label);
  const trueFields = kind === "workspace"
    ? new Set(["scope_bound", "read_model_only"])
    : new Set(["scope_bound"]);
  if (fields.some((field) => value[field] !== trueFields.has(field))) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} must remain scope-bound, non-authoritative, and non-certifying`);
  }
  return Object.fromEntries(fields.map((field) => [field, trueFields.has(field)]));
}

function normalizeWorkspaceRecord(value, label = "workspace") {
  exactObject(value, [
    "schema_version", "record_type", "workspace_id", "version", "tenant_id", "created_by",
    "generated_at", "reviewer_organization", "engagement_ref", "independence_assessment_ref",
    "recalculation_ref", "reexecution_ref", "lifecycle_ref", "scope", "opinion",
    "workflow_steps", "scope_mark_eligibility", "limitations", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_WORKSPACE_VERSION
      || value.record_type !== "independent_review_workspace_snapshot") {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  if (!Array.isArray(value.workflow_steps) || value.workflow_steps.length !== WORKFLOW_STEP_IDS.length) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.workflow_steps must contain the fixed CT-621 workflow`);
  }
  const workflowSteps = value.workflow_steps.map((entry, index) => normalizeWorkflowStep(entry, `${label}.workflow_steps[${index}]`));
  if (!same(workflowSteps.map(({ step_id: stepId }) => stepId), WORKFLOW_STEP_IDS)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.workflow_steps are out of order`);
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_workspace_snapshot",
    workspace_id: requireId(value.workspace_id, `${label}.workspace_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    generated_at: canonicalInstant(value.generated_at, `${label}.generated_at`),
    reviewer_organization: normalizeReviewerOrganization(value.reviewer_organization, `${label}.reviewer_organization`),
    engagement_ref: normalizeReference(value.engagement_ref, "independent_review_engagement", tenantId, `${label}.engagement_ref`),
    independence_assessment_ref: normalizeReference(value.independence_assessment_ref, "independent_review_independence_assessment", tenantId, `${label}.independence_assessment_ref`),
    recalculation_ref: normalizeReference(value.recalculation_ref, "independent_review_recalculation", tenantId, `${label}.recalculation_ref`),
    reexecution_ref: value.reexecution_ref === null
      ? null
      : normalizeReference(value.reexecution_ref, "independent_review_supervised_reexecution", tenantId, `${label}.reexecution_ref`),
    lifecycle_ref: normalizeReference(value.lifecycle_ref, "independent_review_opinion_lifecycle", tenantId, `${label}.lifecycle_ref`),
    scope: normalizeScope(value.scope, tenantId, `${label}.scope`),
    opinion: normalizeOpinionSummary(value.opinion, tenantId, `${label}.opinion`),
    workflow_steps: workflowSteps,
    scope_mark_eligibility: normalizeEligibility(value.scope_mark_eligibility, `${label}.scope_mark_eligibility`),
    limitations: normalizeLimitations(value.limitations, `${label}.limitations`),
    boundary: normalizeBoundary(value.boundary, `${label}.boundary`, "workspace")
  };
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized workspace`);
  }
  return deepFreeze({ ...body, content_fingerprint: fingerprint });
}

function markEligibility(projection) {
  if (projection.status === "withdrawn") {
    return { eligible: false, state: "withdrawn", blockers: ["opinion-withdrawn"] };
  }
  const blockers = [];
  if (!MARK_ELIGIBLE_STATUSES.has(projection.status)) blockers.push("opinion-not-current");
  if (projection.open_appeal_count > 0) blockers.push("open-appeal");
  return blockers.length === 0
    ? { eligible: true, state: "eligible", blockers: [] }
    : { eligible: false, state: "blocked", blockers };
}

function effectiveOpinionTime(lifecycle) {
  const correction = [...lifecycle.events].reverse().find(({ event_type: eventType }) => eventType === "correction-issued");
  return correction?.occurred_at ?? lifecycle.opinion.issued_at;
}

function workflowSteps(lifecycle) {
  const projection = lifecycle.projection;
  const opinionState = projection.status === "withdrawn"
    ? "withdrawn"
    : MARK_ELIGIBLE_STATUSES.has(projection.status) && projection.open_appeal_count === 0
      ? "complete"
      : "attention";
  const eligibility = markEligibility(projection);
  return [
    { step_id: "scope", state: "complete", source_fingerprint: lifecycle.opinion.engagement_ref.content_fingerprint },
    { step_id: "independence", state: "complete", source_fingerprint: lifecycle.opinion.independence_assessment_ref.content_fingerprint },
    { step_id: "recalculation", state: "complete", source_fingerprint: lifecycle.projection.current_sources.recalculation_ref.content_fingerprint },
    {
      step_id: "reexecution",
      state: lifecycle.projection.current_sources.reexecution_ref === null ? "not-required" : "complete",
      source_fingerprint: lifecycle.projection.current_sources.reexecution_ref?.content_fingerprint ?? null
    },
    { step_id: "opinion", state: opinionState, source_fingerprint: lifecycle.content_fingerprint },
    {
      step_id: "scope-mark",
      state: eligibility.eligible ? "ready" : eligibility.state === "withdrawn" ? "withdrawn" : "blocked",
      source_fingerprint: eligibility.eligible ? lifecycle.content_fingerprint : null
    }
  ];
}

function opinionContext(input) {
  return {
    engagement: input.engagement,
    independence_assessment: input.independence_assessment,
    share_grant: input.share_grant,
    share_revocations: input.share_revocations,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    recalculation: input.recalculation,
    ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement }),
    ...(input.reexecution === undefined ? {} : { reexecution: input.reexecution })
  };
}

const CONTEXT_REQUIRED = Object.freeze([
  "lifecycle", "correction_sources", "engagement", "independence_assessment", "share_grant",
  "share_revocations", "passport_version", "passport_events", "delivery", "recalculation"
]);
const CONTEXT_OPTIONAL = Object.freeze(["previous_engagement", "reexecution"]);

function verifyLifecycleInput(input) {
  return verifyIndependentReviewOpinionLifecycle({
    lifecycle: input.lifecycle,
    correction_sources: input.correction_sources,
    ...opinionContext(input)
  });
}

export function createIndependentReviewWorkspace(input) {
  exactObject(input, [
    "workspace_id", "version", "created_by", "generated_at", "reviewer_organization",
    ...CONTEXT_REQUIRED
  ], CONTEXT_OPTIONAL, "input");
  const lifecycle = verifyLifecycleInput(input);
  const engagement = input.engagement;
  const independence = input.independence_assessment;
  const generatedAt = canonicalInstant(input.generated_at, "input.generated_at");
  const reviewerOrganization = normalizeReviewerOrganization(input.reviewer_organization, "input.reviewer_organization");
  if (reviewerOrganization.organization_id !== lifecycle.opinion.signer.organization_id
      || reviewerOrganization.organization_id !== engagement.intended_reviewer_organization_id) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, "reviewer organization must match the engagement and opinion signer organization");
  }
  const latestLifecycleTime = lifecycle.events.at(-1)?.occurred_at ?? lifecycle.opinion.issued_at;
  if (Date.parse(generatedAt) < Date.parse(latestLifecycleTime)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.timeInvalid, "workspace generation cannot precede the latest opinion lifecycle event");
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_workspace_snapshot",
    workspace_id: input.workspace_id,
    version: input.version,
    tenant_id: lifecycle.opinion.tenant_id,
    created_by: input.created_by,
    generated_at: generatedAt,
    reviewer_organization: reviewerOrganization,
    engagement_ref: recordReference(engagement, "independent_review_engagement", "engagement_id"),
    independence_assessment_ref: recordReference(independence, "independent_review_independence_assessment", "assessment_id"),
    recalculation_ref: lifecycle.projection.current_sources.recalculation_ref,
    reexecution_ref: lifecycle.projection.current_sources.reexecution_ref,
    lifecycle_ref: {
      object_type: "independent_review_opinion_lifecycle",
      object_id: lifecycle.opinion.opinion_id,
      version: lifecycle.opinion.version,
      tenant_id: lifecycle.opinion.tenant_id,
      content_fingerprint: lifecycle.content_fingerprint
    },
    scope: {
      review_level: engagement.scope.review_level,
      intended_use: engagement.scope.purpose.intended_use,
      purpose_statement: engagement.scope.purpose.statement,
      tolerance_mode: engagement.scope.tolerance_policy.mode,
      deliverables: engagement.scope.delivery_agreement.deliverables,
      passport_ref: engagement.scope.passport_ref,
      delivery_ref: engagement.scope.delivery_ref
    },
    opinion: {
      opinion_ref: recordReference(lifecycle.opinion, "independent_review_opinion", "opinion_id"),
      original_issued_at: lifecycle.opinion.issued_at,
      effective_at: effectiveOpinionTime(lifecycle),
      status: lifecycle.projection.status,
      outcome: lifecycle.projection.current_finding.outcome,
      statement: lifecycle.projection.current_finding.statement,
      reason_codes: lifecycle.projection.current_finding.reason_codes,
      finding_fingerprint: lifecycle.projection.current_finding.finding_fingerprint,
      event_count: lifecycle.projection.event_count,
      appeal_count: lifecycle.projection.appeal_count,
      correction_count: lifecycle.projection.correction_count,
      open_appeal_count: lifecycle.projection.open_appeal_count
    },
    workflow_steps: workflowSteps(lifecycle),
    scope_mark_eligibility: markEligibility(lifecycle.projection),
    limitations: [...LIMITATIONS],
    boundary: {
      scope_bound: true,
      read_model_only: true,
      customer_data_persisted: false,
      identity_authenticated: false,
      organization_control_externally_verified: false,
      export_authorization_externally_verified: false,
      reviewer_independence_certified: false,
      historical_state_reproduced: false,
      performance_claim_allowed: false,
      sla_adjudicated: false,
      legal_conclusion_issued: false,
      certification_issued: false
    }
  };
  return normalizeWorkspaceRecord({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyIndependentReviewWorkspace(input) {
  exactObject(input, ["workspace", ...CONTEXT_REQUIRED], CONTEXT_OPTIONAL, "input");
  const workspace = normalizeWorkspaceRecord(input.workspace);
  const rebuilt = createIndependentReviewWorkspace({
    workspace_id: workspace.workspace_id,
    version: workspace.version,
    created_by: workspace.created_by,
    generated_at: workspace.generated_at,
    reviewer_organization: workspace.reviewer_organization,
    ...Object.fromEntries([...CONTEXT_REQUIRED, ...CONTEXT_OPTIONAL]
      .filter((key) => key !== "lifecycle" && Object.hasOwn(input, key))
      .map((key) => [key, input[key]])),
    lifecycle: input.lifecycle
  });
  if (!same(workspace, rebuilt)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, "workspace cannot be reproduced from the supplied opinion lifecycle sources");
  }
  return workspace;
}

function normalizeDisplay(value, label) {
  exactObject(value, ["label", "institution", "date", "scope", "outcome", "limitation"], [], label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.date must use YYYY-MM-DD`);
  }
  return {
    label: requireString(value.label, `${label}.label`, { min: 3, max: 160 }),
    institution: requireString(value.institution, `${label}.institution`, { min: 2, max: 160 }),
    date: value.date,
    scope: requireString(value.scope, `${label}.scope`, { min: 3, max: 500 }),
    outcome: requireString(value.outcome, `${label}.outcome`, { max: 64 }),
    limitation: requireString(value.limitation, `${label}.limitation`, { min: 3, max: 500 })
  };
}

function normalizeScopeMarkRecord(value, label = "scope_mark") {
  exactObject(value, [
    "schema_version", "record_type", "mark_id", "version", "tenant_id", "created_by",
    "issued_at", "workspace_ref", "reviewer_organization", "opinion_date", "scope",
    "opinion", "limitations", "display", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_WORKSPACE_VERSION
      || value.record_type !== "independent_review_scope_mark") {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const opinionDate = requireString(value.opinion_date, `${label}.opinion_date`, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opinionDate)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.opinion_date must use YYYY-MM-DD`);
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_scope_mark",
    mark_id: requireId(value.mark_id, `${label}.mark_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    issued_at: canonicalInstant(value.issued_at, `${label}.issued_at`),
    workspace_ref: normalizeReference(value.workspace_ref, "independent_review_workspace_snapshot", tenantId, `${label}.workspace_ref`),
    reviewer_organization: normalizeReviewerOrganization(value.reviewer_organization, `${label}.reviewer_organization`),
    opinion_date: opinionDate,
    scope: normalizeScope(value.scope, tenantId, `${label}.scope`),
    opinion: normalizeOpinionSummary(value.opinion, tenantId, `${label}.opinion`),
    limitations: normalizeLimitations(value.limitations, `${label}.limitations`),
    display: normalizeDisplay(value.display, `${label}.display`),
    boundary: normalizeBoundary(value.boundary, `${label}.boundary`, "mark")
  };
  if (!MARK_ELIGIBLE_STATUSES.has(body.opinion.status) || body.opinion.open_appeal_count !== 0) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.markIneligible, `${label} cannot represent a non-current opinion`);
  }
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized mark`);
  }
  return deepFreeze({ ...body, content_fingerprint: fingerprint });
}

function workspaceVerificationInput(input) {
  return Object.fromEntries(["workspace", ...CONTEXT_REQUIRED, ...CONTEXT_OPTIONAL]
    .filter((key) => Object.hasOwn(input, key))
    .map((key) => [key, input[key]]));
}

export function createIndependentReviewScopeMark(input) {
  exactObject(input, [
    "mark_id", "version", "created_by", "issued_at", "workspace", ...CONTEXT_REQUIRED
  ], CONTEXT_OPTIONAL, "input");
  const workspace = verifyIndependentReviewWorkspace(workspaceVerificationInput(input));
  if (!workspace.scope_mark_eligibility.eligible) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.markIneligible, `scope mark is blocked: ${workspace.scope_mark_eligibility.blockers.join(", ")}`);
  }
  const issuedAt = canonicalInstant(input.issued_at, "input.issued_at");
  if (Date.parse(issuedAt) < Date.parse(workspace.generated_at)
      || Date.parse(issuedAt) < Date.parse(workspace.opinion.effective_at)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.timeInvalid, "scope mark issuance cannot precede the workspace or effective opinion");
  }
  const scopeText = [
    workspace.scope.review_level,
    `${workspace.scope.passport_ref.object_id}@${workspace.scope.passport_ref.version}`,
    workspace.scope.intended_use
  ].join(" | ");
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_scope_mark",
    mark_id: input.mark_id,
    version: input.version,
    tenant_id: workspace.tenant_id,
    created_by: input.created_by,
    issued_at: issuedAt,
    workspace_ref: recordReference(workspace, "independent_review_workspace_snapshot", "workspace_id"),
    reviewer_organization: workspace.reviewer_organization,
    opinion_date: workspace.opinion.effective_at.slice(0, 10),
    scope: workspace.scope,
    opinion: workspace.opinion,
    limitations: workspace.limitations,
    display: {
      label: "Scope-bound independent review opinion",
      institution: workspace.reviewer_organization.display_name,
      date: workspace.opinion.effective_at.slice(0, 10),
      scope: scopeText,
      outcome: workspace.opinion.outcome,
      limitation: "Limited to the identified Passport, delivery, method, and review scope. Not certification, legal advice, an SLA adjudication, or a performance guarantee."
    },
    boundary: {
      scope_bound: true,
      trusted_signature_attached: false,
      identity_authenticated: false,
      organization_control_externally_verified: false,
      export_authorization_externally_verified: false,
      reviewer_independence_certified: false,
      historical_state_reproduced: false,
      performance_claim_allowed: false,
      sla_adjudicated: false,
      legal_conclusion_issued: false,
      certification_issued: false
    }
  };
  return normalizeScopeMarkRecord({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyIndependentReviewScopeMark(input) {
  exactObject(input, ["scope_mark", "workspace", ...CONTEXT_REQUIRED], CONTEXT_OPTIONAL, "input");
  const scopeMark = normalizeScopeMarkRecord(input.scope_mark);
  const rebuilt = createIndependentReviewScopeMark({
    mark_id: scopeMark.mark_id,
    version: scopeMark.version,
    created_by: scopeMark.created_by,
    issued_at: scopeMark.issued_at,
    ...Object.fromEntries(["workspace", ...CONTEXT_REQUIRED, ...CONTEXT_OPTIONAL]
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, input[key]]))
  });
  if (!same(scopeMark, rebuilt)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, "scope mark cannot be reproduced from the supplied workspace and sources");
  }
  return scopeMark;
}

function normalizeFile(value, label) {
  exactObject(value, ["path", "content"], [], label);
  if (typeof value.content !== "string" || value.content.length > 2_000_000) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.content must be a bounded string`);
  }
  return {
    path: requireString(value.path, `${label}.path`, { max: 128 }),
    content: value.content
  };
}

function artifact(path, content, role, mediaType) {
  return {
    path,
    media_type: mediaType,
    role,
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: digestText(content)
  };
}

function normalizeArtifact(value, label) {
  exactObject(value, ["path", "media_type", "role", "bytes", "sha256"], [], label);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.inputInvalid, `${label}.bytes must be a non-negative integer`);
  }
  return {
    path: requireString(value.path, `${label}.path`, { max: 128 }),
    media_type: requireString(value.media_type, `${label}.media_type`, { max: 128 }),
    role: requireString(value.role, `${label}.role`, { max: 128 }),
    bytes: value.bytes,
    sha256: requireHash(value.sha256, `${label}.sha256`)
  };
}

function normalizeExportManifest(value, label = "manifest") {
  exactObject(value, [
    "schema_version", "record_type", "export_id", "version", "tenant_id", "created_by",
    "created_at", "workspace_ref", "scope_mark_ref", "artifacts", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_WORKSPACE_VERSION
      || value.record_type !== "independent_review_workspace_export_manifest") {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  if (!Array.isArray(value.artifacts) || value.artifacts.length !== 3) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.artifacts must contain the three CT-621 content files`);
  }
  const artifacts = value.artifacts.map((entry, index) => normalizeArtifact(entry, `${label}.artifacts[${index}]`));
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_workspace_export_manifest",
    export_id: requireId(value.export_id, `${label}.export_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: canonicalInstant(value.created_at, `${label}.created_at`),
    workspace_ref: normalizeReference(value.workspace_ref, "independent_review_workspace_snapshot", tenantId, `${label}.workspace_ref`),
    scope_mark_ref: normalizeReference(value.scope_mark_ref, "independent_review_scope_mark", tenantId, `${label}.scope_mark_ref`),
    artifacts,
    boundary: (() => {
      const fields = [
        "integrity_only", "raw_samples_included", "customer_identifiers_included",
        "source_records_embedded", "offline_source_reverification", "trusted_signature_attached",
        "performance_claim_allowed", "sla_adjudicated", "legal_conclusion_issued", "certification_issued"
      ];
      exactObject(value.boundary, fields, [], `${label}.boundary`);
      if (value.boundary.integrity_only !== true || fields.slice(1).some((field) => value.boundary[field] !== false)) {
        fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, `${label}.boundary overstates the export package`);
      }
      return Object.fromEntries(fields.map((field) => [field, field === "integrity_only"]));
    })()
  };
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized manifest`);
  }
  return deepFreeze({ ...body, content_fingerprint: fingerprint });
}

function exportReadme(workspace, scopeMark) {
  return `# CT-AIComm scope-bound review export\n\n`
    + `Institution: ${scopeMark.display.institution}\n\n`
    + `Opinion date: ${scopeMark.display.date}\n\n`
    + `Scope: ${scopeMark.display.scope}\n\n`
    + `Outcome: ${scopeMark.display.outcome}\n\n`
    + `Status: ${workspace.opinion.status}\n\n`
    + `Limit: ${scopeMark.display.limitation}\n\n`
    + `This package verifies its own bytes and record fingerprints only. It does not embed raw samples, authenticate identities, verify export authorization, attach a trusted signature, reproduce source review work, or issue certification.\n`;
}

function renderChecksums(files) {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  return `${EXACT_EXPORT_FILES
    .filter((path) => path !== "SHA256SUMS")
    .map((path) => filesByPath.get(path))
    .map(({ path, content }) => `${digestText(content).slice("sha256:".length)}  ${path}`)
    .join("\n")}\n`;
}

export function createIndependentReviewWorkspaceExport(input) {
  exactObject(input, [
    "export_id", "version", "created_by", "created_at", "workspace", "scope_mark"
  ], [], "input");
  const workspace = normalizeWorkspaceRecord(input.workspace);
  const scopeMark = normalizeScopeMarkRecord(input.scope_mark);
  if (!same(scopeMark.workspace_ref, recordReference(workspace, "independent_review_workspace_snapshot", "workspace_id"))) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch, "scope mark must bind the exact exported workspace");
  }
  const createdAt = canonicalInstant(input.created_at, "input.created_at");
  if (Date.parse(createdAt) < Date.parse(scopeMark.issued_at)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.timeInvalid, "export creation cannot precede scope mark issuance");
  }
  const contentFiles = [
    { path: "workspace.json", content: jsonText(workspace), role: "review-workspace-snapshot", mediaType: "application/json" },
    { path: "scope-mark.json", content: jsonText(scopeMark), role: "scope-bound-review-mark", mediaType: "application/json" },
    { path: "README.md", content: exportReadme(workspace, scopeMark), role: "human-readable-boundary", mediaType: "text/markdown" }
  ];
  const body = {
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    record_type: "independent_review_workspace_export_manifest",
    export_id: input.export_id,
    version: input.version,
    tenant_id: workspace.tenant_id,
    created_by: input.created_by,
    created_at: createdAt,
    workspace_ref: recordReference(workspace, "independent_review_workspace_snapshot", "workspace_id"),
    scope_mark_ref: recordReference(scopeMark, "independent_review_scope_mark", "mark_id"),
    artifacts: contentFiles.map(({ path, content, role, mediaType }) => artifact(path, content, role, mediaType)),
    boundary: {
      integrity_only: true,
      raw_samples_included: false,
      customer_identifiers_included: false,
      source_records_embedded: false,
      offline_source_reverification: false,
      trusted_signature_attached: false,
      performance_claim_allowed: false,
      sla_adjudicated: false,
      legal_conclusion_issued: false,
      certification_issued: false
    }
  };
  const manifest = normalizeExportManifest({ ...body, content_fingerprint: fingerprintBody(body) });
  const manifestFile = { path: "manifest.json", content: jsonText(manifest) };
  const checksumFile = {
    path: "SHA256SUMS",
    content: renderChecksums([...contentFiles, manifestFile])
  };
  const filesByPath = new Map(
    [...contentFiles.map(({ path, content }) => ({ path, content })), manifestFile, checksumFile]
      .map((file) => [file.path, file])
  );
  const files = EXACT_EXPORT_FILES.map((path) => filesByPath.get(path));
  return deepFreeze({ manifest, files });
}

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contentMismatch, `${label} must contain valid JSON`);
  }
}

function verifyChecksums(filesByPath) {
  const lines = filesByPath.get("SHA256SUMS").trim().split("\n");
  const expectedPaths = EXACT_EXPORT_FILES.filter((path) => path !== "SHA256SUMS").sort();
  if (lines.length !== expectedPaths.length) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.checksumMismatch, "SHA256SUMS has an unexpected entry count");
  }
  const observed = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9.-]+)$/);
    if (!match || observed.has(match[2])) {
      fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.checksumMismatch, "SHA256SUMS contains an invalid or duplicate entry");
    }
    observed.set(match[2], match[1]);
  }
  if (!same([...observed.keys()].sort(), expectedPaths)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.checksumMismatch, "SHA256SUMS does not cover the exact export file set");
  }
  for (const path of expectedPaths) {
    const actual = digestText(filesByPath.get(path)).slice("sha256:".length);
    if (observed.get(path) !== actual) {
      fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.checksumMismatch, `${path} checksum does not match`);
    }
  }
}

export function verifyIndependentReviewWorkspaceExport(input) {
  exactObject(input, ["files"], [], "input");
  if (!Array.isArray(input.files) || input.files.length !== EXACT_EXPORT_FILES.length) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fileSetMismatch, "export must contain the exact CT-621 file set");
  }
  const files = input.files.map((entry, index) => normalizeFile(entry, `input.files[${index}]`));
  const filesByPath = new Map(files.map(({ path, content }) => [path, content]));
  if (filesByPath.size !== files.length || !same([...filesByPath.keys()].sort(), [...EXACT_EXPORT_FILES].sort())) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fileSetMismatch, "export must contain each required file exactly once");
  }
  verifyChecksums(filesByPath);
  const manifest = normalizeExportManifest(parseJson(filesByPath.get("manifest.json"), "manifest.json"));
  const workspace = normalizeWorkspaceRecord(parseJson(filesByPath.get("workspace.json"), "workspace.json"));
  const scopeMark = normalizeScopeMarkRecord(parseJson(filesByPath.get("scope-mark.json"), "scope-mark.json"));
  if (!same(manifest.workspace_ref, recordReference(workspace, "independent_review_workspace_snapshot", "workspace_id"))
      || !same(manifest.scope_mark_ref, recordReference(scopeMark, "independent_review_scope_mark", "mark_id"))
      || !same(scopeMark.workspace_ref, manifest.workspace_ref)) {
    fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contentMismatch, "export records do not share exact references");
  }
  const rebuilt = createIndependentReviewWorkspaceExport({
    export_id: manifest.export_id,
    version: manifest.version,
    created_by: manifest.created_by,
    created_at: manifest.created_at,
    workspace,
    scope_mark: scopeMark
  });
  const rebuiltByPath = new Map(rebuilt.files.map(({ path, content }) => [path, content]));
  for (const [path, content] of filesByPath) {
    if (rebuiltByPath.get(path) !== content) {
      fail(INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contentMismatch, `${path} cannot be reproduced from the export records`);
    }
  }
  return deepFreeze({
    schema_version: INDEPENDENT_REVIEW_WORKSPACE_VERSION,
    export_id: manifest.export_id,
    workspace_id: workspace.workspace_id,
    mark_id: scopeMark.mark_id,
    institution: scopeMark.display.institution,
    opinion_date: scopeMark.display.date,
    review_level: scopeMark.scope.review_level,
    opinion_status: scopeMark.opinion.status,
    opinion_outcome: scopeMark.opinion.outcome,
    checksums_verified: true,
    record_fingerprints_verified: true,
    exact_scope_binding_verified: true,
    raw_samples_included: false,
    customer_identifiers_included: false,
    source_records_embedded: false,
    offline_source_reverification: false,
    trusted_signature_attached: false,
    performance_claim_allowed: false,
    certification_issued: false,
    external_network_used: false
  });
}
