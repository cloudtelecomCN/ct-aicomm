import type { PassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import type { PassportEvidenceVersion, PassportVersionTerminalEvent } from "../link-evidence-passport/versioning.mjs";
import type { IndependentReviewEngagement, IndependentReviewFingerprint } from "./index.mjs";

export const INDEPENDENT_REVIEW_INDEPENDENCE_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_ROLES: readonly [
  "commissioner",
  "evidence-submitter",
  "review-lead",
  "independence-assessor",
  "opinion-signer"
];
export const INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS: Readonly<{
  sameUltimateController: "same-ultimate-controller";
  dutyConflict: "subject-role-conflict";
  outcomeContingentPayment: "outcome-contingent-payment";
  unresolvedConflict: "unresolved-conflict";
  disqualifyingConflict: "disqualifying-conflict";
}>;
export const INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_independence_input_invalid";
  fieldUnknown: "independent_review_independence_field_unknown";
  fieldMissing: "independent_review_independence_field_missing";
  fingerprintMismatch: "independent_review_independence_fingerprint_mismatch";
  contextMismatch: "independent_review_independence_context_mismatch";
  timeInvalid: "independent_review_independence_time_invalid";
  engagementInvalid: "independent_review_independence_engagement_invalid";
  organizationInvalid: "independent_review_independence_organization_invalid";
  roleInvalid: "independent_review_independence_role_invalid";
  conflictInvalid: "independent_review_independence_conflict_invalid";
  recusalInvalid: "independent_review_independence_recusal_invalid";
  gateMismatch: "independent_review_independence_gate_mismatch";
  opinionIneligible: "independent_review_independence_opinion_ineligible";
}>;

export type IndependentReviewRole = typeof INDEPENDENT_REVIEW_ROLES[number];
export type IndependentReviewIndependenceBlocker = typeof INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS[keyof typeof INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS];

export interface IndependentReviewDisclosureReference {
  artifact_id: string;
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewSubjectDisclosure {
  subject_id: string;
  organization_id: string;
  identity_basis: "self-declared" | "document-reference";
  evidence_refs: IndependentReviewDisclosureReference[];
}

export interface IndependentReviewOrganizationDisclosure {
  organization_id: string;
  ultimate_controller_id: string;
  control_basis: "self-declared" | "document-reference";
  evidence_refs: IndependentReviewDisclosureReference[];
}

export interface IndependentReviewRoleAssignment {
  role: IndependentReviewRole;
  subject_id: string;
}

export interface IndependentReviewPaymentDisclosure {
  payer_organization_id: string;
  payee_organization_id: string;
  fee_basis: "fixed-fee" | "cost-reimbursement" | "pro-bono" | "other";
  outcome_contingent: boolean;
}

export interface IndependentReviewConflictDisclosure {
  conflict_id: string;
  category:
    | "common-control"
    | "employment"
    | "ownership"
    | "advisory"
    | "investment"
    | "family"
    | "prior-work"
    | "outcome-contingent-payment"
    | "other";
  affected_subject_id: string;
  affected_role: IndependentReviewRole;
  description: string;
  resolution: "unresolved" | "recused" | "disqualifying";
  recusal_id: string | null;
}

export interface IndependentReviewRecusal {
  recusal_id: string;
  conflict_id: string;
  subject_id: string;
  role: IndependentReviewRole;
  replacement_subject_id: string;
  effective_at: string;
  reason: string;
}

export interface IndependentReviewIndependenceAssessment {
  schema_version: "1.0.0";
  record_type: "independent_review_independence_assessment";
  assessment_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  assessed_at: string;
  engagement_ref: {
    object_type: "independent_review_engagement";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: IndependentReviewFingerprint;
  };
  subjects: IndependentReviewSubjectDisclosure[];
  organizations: IndependentReviewOrganizationDisclosure[];
  role_assignments: IndependentReviewRoleAssignment[];
  payment_disclosure: IndependentReviewPaymentDisclosure;
  conflicts: IndependentReviewConflictDisclosure[];
  recusals: IndependentReviewRecusal[];
  gate: {
    basis: "declared-records-only";
    status: "eligible-on-declared-records" | "ineligible";
    blocker_codes: IndependentReviewIndependenceBlocker[];
    opinion_signer_subject_id: string;
    opinion_signer_organization_id: string;
    duties_separated: boolean;
    ultimate_control_separated: boolean;
    payment_independence_satisfied: boolean;
    all_conflicts_resolved: boolean;
    recusals_effective: boolean;
    eligible_to_sign_independent_opinion: boolean;
  };
  boundary: {
    assessment_only: true;
    declared_records_only: true;
    independence_gate_evaluated: true;
    identity_authenticated: false;
    organization_control_externally_verified: false;
    reviewer_independence_certified: false;
    evidence_access_authorized: false;
    review_performed: false;
    opinion_issued: false;
    passport_status_mutated: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewIndependenceInput {
  assessment_id: string;
  version: string;
  created_by: string;
  assessed_at: string;
  engagement: IndependentReviewEngagement;
  passport_version: PassportEvidenceVersion;
  passport_events: Array<{
    event: PassportVersionTerminalEvent;
    replacement_version: PassportEvidenceVersion | null;
  }>;
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
  subjects: IndependentReviewSubjectDisclosure[];
  organizations: IndependentReviewOrganizationDisclosure[];
  role_assignments: IndependentReviewRoleAssignment[];
  payment_disclosure: IndependentReviewPaymentDisclosure;
  conflicts: IndependentReviewConflictDisclosure[];
  recusals: IndependentReviewRecusal[];
}

export function createIndependentReviewIndependenceAssessment(
  input: IndependentReviewIndependenceInput
): IndependentReviewIndependenceAssessment;

export function verifyIndependentReviewIndependenceAssessment(input: {
  record: IndependentReviewIndependenceAssessment;
  engagement: IndependentReviewEngagement;
  passport_version: PassportEvidenceVersion;
  passport_events: IndependentReviewIndependenceInput["passport_events"];
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
}): IndependentReviewIndependenceAssessment;

export function assertIndependentOpinionSignerEligible(input: {
  record: IndependentReviewIndependenceAssessment;
  engagement: IndependentReviewEngagement;
  passport_version: PassportEvidenceVersion;
  passport_events: IndependentReviewIndependenceInput["passport_events"];
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
}): IndependentReviewIndependenceAssessment;
