import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { verifyIndependentReviewEngagement } from "./index.mjs";

export const INDEPENDENT_REVIEW_INDEPENDENCE_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_ROLES = Object.freeze([
  "commissioner",
  "evidence-submitter",
  "review-lead",
  "independence-assessor",
  "opinion-signer"
]);
export const INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS = Object.freeze({
  sameUltimateController: "same-ultimate-controller",
  dutyConflict: "subject-role-conflict",
  outcomeContingentPayment: "outcome-contingent-payment",
  unresolvedConflict: "unresolved-conflict",
  disqualifyingConflict: "disqualifying-conflict"
});
export const INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_independence_input_invalid",
  fieldUnknown: "independent_review_independence_field_unknown",
  fieldMissing: "independent_review_independence_field_missing",
  fingerprintMismatch: "independent_review_independence_fingerprint_mismatch",
  contextMismatch: "independent_review_independence_context_mismatch",
  timeInvalid: "independent_review_independence_time_invalid",
  engagementInvalid: "independent_review_independence_engagement_invalid",
  organizationInvalid: "independent_review_independence_organization_invalid",
  roleInvalid: "independent_review_independence_role_invalid",
  conflictInvalid: "independent_review_independence_conflict_invalid",
  recusalInvalid: "independent_review_independence_recusal_invalid",
  gateMismatch: "independent_review_independence_gate_mismatch",
  opinionIneligible: "independent_review_independence_opinion_ineligible"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ROLE_SET = new Set(INDEPENDENT_REVIEW_ROLES);
const REVIEWER_ROLES = new Set(["review-lead", "independence-assessor", "opinion-signer"]);
const DISCLOSURE_BASES = new Set(["self-declared", "document-reference"]);
const FEE_BASES = new Set(["fixed-fee", "cost-reimbursement", "pro-bono", "other"]);
const CONFLICT_CATEGORIES = new Set([
  "common-control",
  "employment",
  "ownership",
  "advisory",
  "investment",
  "family",
  "prior-work",
  "outcome-contingent-payment",
  "other"
]);
const CONFLICT_RESOLUTIONS = new Set(["unresolved", "recused", "disqualifying"]);
const GATE_STATUSES = new Set(["eligible-on-declared-records", "ineligible"]);
const BLOCKER_SET = new Set(Object.values(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS));

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
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
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
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
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

function requireEnum(value, allowed, label, code = INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid) {
  if (!allowed.has(value)) fail(code, `${label} is invalid`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} must be boolean`);
  return value;
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
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

function uniqueSorted(values, label, normalize, { min = 0, max = 64 } = {}) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} must contain ${min}-${max} entries`);
  }
  const normalized = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const encoded = normalized.map(canonical);
  if (new Set(encoded).size !== normalized.length) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label} contains duplicate entries`);
  }
  return normalized.sort((left, right) => canonical(left).localeCompare(canonical(right)));
}

function requireUnique(values, key, label, code) {
  const identities = values.map((value) => value[key]);
  if (new Set(identities).size !== identities.length) fail(code, `${label} must use unique ${key} values`);
}

function normalizeReference(value, objectType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id", "content_fingerprint"], [], label);
  if (value.object_type !== objectType) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, `${label}.object_type must be ${objectType}`);
  }
  const reference = {
    object_type: objectType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (tenantId !== undefined && reference.tenant_id !== tenantId) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, `${label}.tenant_id must match the assessment tenant`);
  }
  return reference;
}

function engagementReference(engagement) {
  return {
    object_type: "independent_review_engagement",
    object_id: engagement.engagement_id,
    version: engagement.version,
    tenant_id: engagement.tenant_id,
    content_fingerprint: engagement.content_fingerprint
  };
}

function normalizeEvidenceReference(value, label) {
  exactObject(value, ["artifact_id", "content_fingerprint"], [], label);
  return {
    artifact_id: requireId(value.artifact_id, `${label}.artifact_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
}

function normalizeDisclosureEvidence(basis, evidenceRefs, label) {
  const normalized = uniqueSorted(evidenceRefs, `${label}.evidence_refs`, normalizeEvidenceReference, { min: 0, max: 16 });
  requireUnique(normalized, "artifact_id", `${label}.evidence_refs`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid);
  if ((basis === "self-declared" && normalized.length !== 0)
      || (basis === "document-reference" && normalized.length === 0)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid, `${label}.evidence_refs do not match ${basis}`);
  }
  return normalized;
}

function normalizeSubject(value, label) {
  exactObject(value, ["subject_id", "organization_id", "identity_basis", "evidence_refs"], [], label);
  const identityBasis = requireEnum(value.identity_basis, DISCLOSURE_BASES, `${label}.identity_basis`);
  return {
    subject_id: requireId(value.subject_id, `${label}.subject_id`),
    organization_id: requireId(value.organization_id, `${label}.organization_id`),
    identity_basis: identityBasis,
    evidence_refs: normalizeDisclosureEvidence(identityBasis, value.evidence_refs, label)
  };
}

function normalizeOrganization(value, label) {
  exactObject(value, ["organization_id", "ultimate_controller_id", "control_basis", "evidence_refs"], [], label);
  const controlBasis = requireEnum(value.control_basis, DISCLOSURE_BASES, `${label}.control_basis`);
  return {
    organization_id: requireId(value.organization_id, `${label}.organization_id`),
    ultimate_controller_id: requireId(value.ultimate_controller_id, `${label}.ultimate_controller_id`),
    control_basis: controlBasis,
    evidence_refs: normalizeDisclosureEvidence(controlBasis, value.evidence_refs, label)
  };
}

function normalizeRoleAssignment(value, label) {
  exactObject(value, ["role", "subject_id"], [], label);
  return {
    role: requireEnum(value.role, ROLE_SET, `${label}.role`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.roleInvalid),
    subject_id: requireId(value.subject_id, `${label}.subject_id`)
  };
}

function normalizePaymentDisclosure(value, label) {
  exactObject(value, ["payer_organization_id", "payee_organization_id", "fee_basis", "outcome_contingent"], [], label);
  return {
    payer_organization_id: requireId(value.payer_organization_id, `${label}.payer_organization_id`),
    payee_organization_id: requireId(value.payee_organization_id, `${label}.payee_organization_id`),
    fee_basis: requireEnum(value.fee_basis, FEE_BASES, `${label}.fee_basis`),
    outcome_contingent: requireBoolean(value.outcome_contingent, `${label}.outcome_contingent`)
  };
}

function normalizeConflict(value, label) {
  exactObject(value, [
    "conflict_id", "category", "affected_subject_id", "affected_role",
    "description", "resolution", "recusal_id"
  ], [], label);
  const resolution = requireEnum(value.resolution, CONFLICT_RESOLUTIONS, `${label}.resolution`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid);
  const recusalId = value.recusal_id === null ? null : requireId(value.recusal_id, `${label}.recusal_id`);
  if ((resolution === "recused") !== (recusalId !== null)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid, `${label}.recusal_id must exist only for a recused conflict`);
  }
  return {
    conflict_id: requireId(value.conflict_id, `${label}.conflict_id`),
    category: requireEnum(value.category, CONFLICT_CATEGORIES, `${label}.category`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid),
    affected_subject_id: requireId(value.affected_subject_id, `${label}.affected_subject_id`),
    affected_role: requireEnum(value.affected_role, ROLE_SET, `${label}.affected_role`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid),
    description: requireString(value.description, `${label}.description`, { min: 3, max: 500 }),
    resolution,
    recusal_id: recusalId
  };
}

function normalizeRecusal(value, label) {
  exactObject(value, [
    "recusal_id", "conflict_id", "subject_id", "role", "replacement_subject_id",
    "effective_at", "reason"
  ], [], label);
  const subjectId = requireId(value.subject_id, `${label}.subject_id`);
  const replacementSubjectId = requireId(value.replacement_subject_id, `${label}.replacement_subject_id`);
  if (subjectId === replacementSubjectId) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid, `${label}.replacement_subject_id must be different`);
  }
  return {
    recusal_id: requireId(value.recusal_id, `${label}.recusal_id`),
    conflict_id: requireId(value.conflict_id, `${label}.conflict_id`),
    subject_id: subjectId,
    role: requireEnum(value.role, ROLE_SET, `${label}.role`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid),
    replacement_subject_id: replacementSubjectId,
    effective_at: canonicalInstant(value.effective_at, `${label}.effective_at`),
    reason: requireString(value.reason, `${label}.reason`, { min: 3, max: 500 })
  };
}

function normalizeGate(value, label) {
  const fields = [
    "basis", "status", "blocker_codes", "opinion_signer_subject_id",
    "opinion_signer_organization_id", "duties_separated",
    "ultimate_control_separated", "payment_independence_satisfied",
    "all_conflicts_resolved", "recusals_effective",
    "eligible_to_sign_independent_opinion"
  ];
  exactObject(value, fields, [], label);
  if (value.basis !== "declared-records-only") {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch, `${label}.basis must remain declared-records-only`);
  }
  const blockerCodes = uniqueSorted(
    value.blocker_codes,
    `${label}.blocker_codes`,
    (entry, entryLabel) => requireEnum(entry, BLOCKER_SET, entryLabel, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch),
    { min: 0, max: BLOCKER_SET.size }
  );
  const status = requireEnum(value.status, GATE_STATUSES, `${label}.status`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch);
  const eligible = requireBoolean(value.eligible_to_sign_independent_opinion, `${label}.eligible_to_sign_independent_opinion`);
  if ((status === "eligible-on-declared-records") !== eligible || (eligible && blockerCodes.length !== 0) || (!eligible && blockerCodes.length === 0)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch, `${label} status, blockers, and eligibility are inconsistent`);
  }
  return {
    basis: "declared-records-only",
    status,
    blocker_codes: blockerCodes,
    opinion_signer_subject_id: requireId(value.opinion_signer_subject_id, `${label}.opinion_signer_subject_id`),
    opinion_signer_organization_id: requireId(value.opinion_signer_organization_id, `${label}.opinion_signer_organization_id`),
    duties_separated: requireBoolean(value.duties_separated, `${label}.duties_separated`),
    ultimate_control_separated: requireBoolean(value.ultimate_control_separated, `${label}.ultimate_control_separated`),
    payment_independence_satisfied: requireBoolean(value.payment_independence_satisfied, `${label}.payment_independence_satisfied`),
    all_conflicts_resolved: requireBoolean(value.all_conflicts_resolved, `${label}.all_conflicts_resolved`),
    recusals_effective: requireBoolean(value.recusals_effective, `${label}.recusals_effective`),
    eligible_to_sign_independent_opinion: eligible
  };
}

function normalizeBoundary(value, label) {
  const fields = [
    "assessment_only", "declared_records_only", "independence_gate_evaluated",
    "identity_authenticated", "organization_control_externally_verified",
    "reviewer_independence_certified", "evidence_access_authorized",
    "review_performed", "opinion_issued", "passport_status_mutated",
    "performance_claim_allowed", "sla_adjudicated", "certification_issued"
  ];
  exactObject(value, fields, [], label);
  const requiredTrue = ["assessment_only", "declared_records_only", "independence_gate_evaluated"];
  const requiredFalse = fields.filter((field) => !requiredTrue.includes(field));
  if (requiredTrue.some((field) => value[field] !== true) || requiredFalse.some((field) => value[field] !== false)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, `${label} must remain declaration-bound, non-executing, and non-certifying`);
  }
  return Object.fromEntries([
    ...requiredTrue.map((field) => [field, true]),
    ...requiredFalse.map((field) => [field, false])
  ]);
}

function normalizeCollections(value, label) {
  const subjects = uniqueSorted(value.subjects, `${label}.subjects`, normalizeSubject, { min: 5, max: 32 });
  const organizations = uniqueSorted(value.organizations, `${label}.organizations`, normalizeOrganization, { min: 2, max: 32 });
  const roleAssignments = uniqueSorted(value.role_assignments, `${label}.role_assignments`, normalizeRoleAssignment, {
    min: INDEPENDENT_REVIEW_ROLES.length,
    max: INDEPENDENT_REVIEW_ROLES.length
  });
  const conflicts = uniqueSorted(value.conflicts, `${label}.conflicts`, normalizeConflict, { min: 0, max: 64 });
  const recusals = uniqueSorted(value.recusals, `${label}.recusals`, normalizeRecusal, { min: 0, max: 64 });
  requireUnique(subjects, "subject_id", `${label}.subjects`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.inputInvalid);
  requireUnique(organizations, "organization_id", `${label}.organizations`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.organizationInvalid);
  requireUnique(roleAssignments, "role", `${label}.role_assignments`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.roleInvalid);
  requireUnique(conflicts, "conflict_id", `${label}.conflicts`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid);
  requireUnique(recusals, "recusal_id", `${label}.recusals`, INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid);
  if (!same(roleAssignments.map(({ role }) => role).sort(), [...INDEPENDENT_REVIEW_ROLES].sort())) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.roleInvalid, `${label}.role_assignments must assign every required role exactly once`);
  }
  return { subjects, organizations, roleAssignments, conflicts, recusals };
}

function buildIndependenceGate({ engagement, assessedAt, subjects, organizations, roleAssignments, paymentDisclosure, conflicts, recusals }) {
  const subjectById = new Map(subjects.map((subject) => [subject.subject_id, subject]));
  const organizationById = new Map(organizations.map((organization) => [organization.organization_id, organization]));
  const assignmentByRole = new Map(roleAssignments.map((assignment) => [assignment.role, assignment]));
  const conflictById = new Map(conflicts.map((conflict) => [conflict.conflict_id, conflict]));
  const recusalById = new Map(recusals.map((recusal) => [recusal.recusal_id, recusal]));

  for (const subject of subjects) {
    if (!organizationById.has(subject.organization_id)) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.organizationInvalid, `subject ${subject.subject_id} references an unknown organization`);
    }
  }
  for (const assignment of roleAssignments) {
    if (!subjectById.has(assignment.subject_id)) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.roleInvalid, `${assignment.role} references an unknown subject`);
    }
  }
  for (const organizationId of [paymentDisclosure.payer_organization_id, paymentDisclosure.payee_organization_id]) {
    if (!organizationById.has(organizationId)) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.organizationInvalid, `payment references unknown organization ${organizationId}`);
    }
  }
  if (paymentDisclosure.payee_organization_id !== engagement.intended_reviewer_organization_id
      || paymentDisclosure.payer_organization_id === paymentDisclosure.payee_organization_id) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, "payment must name a distinct payer and the intended reviewer organization as payee");
  }

  const commissionerAssignment = assignmentByRole.get("commissioner");
  const commissionerSubject = subjectById.get(commissionerAssignment.subject_id);
  if (commissionerSubject.subject_id !== engagement.commissioning_party.subject_id
      || commissionerSubject.organization_id !== engagement.commissioning_party.organization_id) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, "commissioner role must match the exact engagement commissioning party");
  }
  for (const role of REVIEWER_ROLES) {
    const subject = subjectById.get(assignmentByRole.get(role).subject_id);
    if (subject.organization_id !== engagement.intended_reviewer_organization_id) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, `${role} must belong to the intended reviewer organization`);
    }
  }

  for (const conflict of conflicts) {
    if (!subjectById.has(conflict.affected_subject_id)) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.conflictInvalid, `conflict ${conflict.conflict_id} references an unknown subject`);
    }
    if (conflict.resolution === "recused") {
      const recusal = recusalById.get(conflict.recusal_id);
      if (!recusal
          || recusal.conflict_id !== conflict.conflict_id
          || recusal.subject_id !== conflict.affected_subject_id
          || recusal.role !== conflict.affected_role) {
        fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid, `conflict ${conflict.conflict_id} lacks an exact recusal`);
      }
      const currentAssignment = assignmentByRole.get(recusal.role);
      if (!subjectById.has(recusal.replacement_subject_id)
          || currentAssignment.subject_id !== recusal.replacement_subject_id
          || currentAssignment.subject_id === recusal.subject_id
          || Date.parse(recusal.effective_at) < Date.parse(engagement.created_at)
          || Date.parse(recusal.effective_at) > Date.parse(assessedAt)) {
        fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid, `recusal ${recusal.recusal_id} is not effective for the current assignment`);
      }
    }
  }
  for (const recusal of recusals) {
    const conflict = conflictById.get(recusal.conflict_id);
    if (!conflict || conflict.resolution !== "recused" || conflict.recusal_id !== recusal.recusal_id) {
      fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid, `recusal ${recusal.recusal_id} is not bound to one recused conflict`);
    }
  }

  const roleSubject = (role) => assignmentByRole.get(role).subject_id;
  const prohibitedPairs = [
    ["commissioner", "review-lead"],
    ["commissioner", "independence-assessor"],
    ["commissioner", "opinion-signer"],
    ["evidence-submitter", "review-lead"],
    ["evidence-submitter", "independence-assessor"],
    ["evidence-submitter", "opinion-signer"],
    ["review-lead", "independence-assessor"],
    ["review-lead", "opinion-signer"],
    ["independence-assessor", "opinion-signer"]
  ];
  const dutiesSeparated = prohibitedPairs.every(([left, right]) => roleSubject(left) !== roleSubject(right));

  const signerSubject = subjectById.get(roleSubject("opinion-signer"));
  const signerOrganization = organizationById.get(signerSubject.organization_id);
  const interestedOrganizationIds = new Set([
    commissionerSubject.organization_id,
    subjectById.get(roleSubject("evidence-submitter")).organization_id,
    paymentDisclosure.payer_organization_id
  ]);
  const ultimateControlSeparated = [...interestedOrganizationIds].every((organizationId) => (
    organizationById.get(organizationId).ultimate_controller_id !== signerOrganization.ultimate_controller_id
  ));
  const paymentIndependenceSatisfied = !paymentDisclosure.outcome_contingent
    && organizationById.get(paymentDisclosure.payer_organization_id).ultimate_controller_id !== signerOrganization.ultimate_controller_id;
  const allConflictsResolved = conflicts.every(({ resolution }) => resolution === "recused");
  const recusalsEffective = conflicts
    .filter(({ resolution }) => resolution === "recused")
    .every(({ recusal_id: recusalId }) => recusalById.has(recusalId));

  const blockerCodes = [];
  if (!ultimateControlSeparated) blockerCodes.push(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.sameUltimateController);
  if (!dutiesSeparated) blockerCodes.push(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.dutyConflict);
  if (paymentDisclosure.outcome_contingent) blockerCodes.push(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.outcomeContingentPayment);
  if (conflicts.some(({ resolution }) => resolution === "unresolved")) blockerCodes.push(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.unresolvedConflict);
  if (conflicts.some(({ resolution }) => resolution === "disqualifying")) blockerCodes.push(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.disqualifyingConflict);
  const normalizedBlockers = [...new Set(blockerCodes)].sort();
  const eligible = normalizedBlockers.length === 0;
  return {
    basis: "declared-records-only",
    status: eligible ? "eligible-on-declared-records" : "ineligible",
    blocker_codes: normalizedBlockers,
    opinion_signer_subject_id: signerSubject.subject_id,
    opinion_signer_organization_id: signerSubject.organization_id,
    duties_separated: dutiesSeparated,
    ultimate_control_separated: ultimateControlSeparated,
    payment_independence_satisfied: paymentIndependenceSatisfied,
    all_conflicts_resolved: allConflictsResolved,
    recusals_effective: recusalsEffective,
    eligible_to_sign_independent_opinion: eligible
  };
}

function normalizeAssessmentRecord(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "assessment_id", "version", "tenant_id",
    "created_by", "assessed_at", "engagement_ref", "subjects", "organizations",
    "role_assignments", "payment_disclosure", "conflicts", "recusals", "gate",
    "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_INDEPENDENCE_VERSION
      || value.record_type !== "independent_review_independence_assessment") {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, `${label} has an unsupported schema or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const collections = normalizeCollections(value, label);
  const body = {
    schema_version: INDEPENDENT_REVIEW_INDEPENDENCE_VERSION,
    record_type: "independent_review_independence_assessment",
    assessment_id: requireId(value.assessment_id, `${label}.assessment_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    assessed_at: canonicalInstant(value.assessed_at, `${label}.assessed_at`),
    engagement_ref: normalizeReference(value.engagement_ref, "independent_review_engagement", tenantId, `${label}.engagement_ref`),
    subjects: collections.subjects,
    organizations: collections.organizations,
    role_assignments: collections.roleAssignments,
    payment_disclosure: normalizePaymentDisclosure(value.payment_disclosure, `${label}.payment_disclosure`),
    conflicts: collections.conflicts,
    recusals: collections.recusals,
    gate: normalizeGate(value.gate, `${label}.gate`),
    boundary: normalizeBoundary(value.boundary, `${label}.boundary`)
  };
  const fingerprint = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (fingerprintBody(body) !== fingerprint) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the normalized assessment`);
  }
  return deepFreeze({ ...body, content_fingerprint: fingerprint });
}

function verifiedEngagement(input, label) {
  try {
    return verifyIndependentReviewEngagement({
      record: input.engagement,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.engagementInvalid, `${label} is not a verified engagement: ${error.message}`);
  }
}

function assessmentBoundary() {
  return {
    assessment_only: true,
    declared_records_only: true,
    independence_gate_evaluated: true,
    identity_authenticated: false,
    organization_control_externally_verified: false,
    reviewer_independence_certified: false,
    evidence_access_authorized: false,
    review_performed: false,
    opinion_issued: false,
    passport_status_mutated: false,
    performance_claim_allowed: false,
    sla_adjudicated: false,
    certification_issued: false
  };
}

export function createIndependentReviewIndependenceAssessment(input) {
  exactObject(input, [
    "assessment_id", "version", "created_by", "assessed_at", "engagement",
    "passport_version", "passport_events", "delivery", "subjects", "organizations",
    "role_assignments", "payment_disclosure", "conflicts", "recusals"
  ], ["previous_engagement"], "input");
  const engagement = verifiedEngagement(input, "input.engagement");
  const assessedAt = canonicalInstant(input.assessed_at, "input.assessed_at");
  if (Date.parse(assessedAt) < Date.parse(engagement.created_at)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.timeInvalid, "assessment cannot predate its engagement");
  }
  const collections = normalizeCollections(input, "input");
  const paymentDisclosure = normalizePaymentDisclosure(input.payment_disclosure, "input.payment_disclosure");
  const gate = buildIndependenceGate({
    engagement,
    assessedAt,
    subjects: collections.subjects,
    organizations: collections.organizations,
    roleAssignments: collections.roleAssignments,
    paymentDisclosure,
    conflicts: collections.conflicts,
    recusals: collections.recusals
  });
  const body = {
    schema_version: INDEPENDENT_REVIEW_INDEPENDENCE_VERSION,
    record_type: "independent_review_independence_assessment",
    assessment_id: input.assessment_id,
    version: input.version,
    tenant_id: engagement.tenant_id,
    created_by: input.created_by,
    assessed_at: assessedAt,
    engagement_ref: engagementReference(engagement),
    subjects: collections.subjects,
    organizations: collections.organizations,
    role_assignments: collections.roleAssignments,
    payment_disclosure: paymentDisclosure,
    conflicts: collections.conflicts,
    recusals: collections.recusals,
    gate,
    boundary: assessmentBoundary()
  };
  return normalizeAssessmentRecord({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyIndependentReviewIndependenceAssessment(input) {
  exactObject(input, ["record", "engagement", "passport_version", "passport_events", "delivery"], ["previous_engagement"], "input");
  const record = normalizeAssessmentRecord(input.record);
  const engagement = verifiedEngagement(input, "input.engagement");
  if (Date.parse(record.assessed_at) < Date.parse(engagement.created_at)
      || !same(record.engagement_ref, engagementReference(engagement))) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.contextMismatch, "assessment must bind the exact verified engagement at or after engagement creation");
  }
  const expectedGate = buildIndependenceGate({
    engagement,
    assessedAt: record.assessed_at,
    subjects: record.subjects,
    organizations: record.organizations,
    roleAssignments: record.role_assignments,
    paymentDisclosure: record.payment_disclosure,
    conflicts: record.conflicts,
    recusals: record.recusals
  });
  if (!same(record.gate, expectedGate)) {
    fail(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch, "record.gate does not match the disclosed organizations, roles, payment, conflicts, and recusals");
  }
  return record;
}

export function assertIndependentOpinionSignerEligible(input) {
  const record = verifyIndependentReviewIndependenceAssessment(input);
  if (!record.gate.eligible_to_sign_independent_opinion) {
    fail(
      INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.opinionIneligible,
      `opinion signer is ineligible: ${record.gate.blocker_codes.join(", ")}`
    );
  }
  return record;
}
