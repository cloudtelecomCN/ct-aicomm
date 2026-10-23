import type { PassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import type { PassportEvidenceVersion, PassportVersionTerminalEvent } from "../link-evidence-passport/versioning.mjs";
import type { PassportShareGrant, PassportShareRevocation } from "../link-evidence-passport/sharing.mjs";
import type { IndependentReviewEngagement, IndependentReviewFingerprint, IndependentReviewReference } from "./index.mjs";
import type { IndependentReviewIndependenceAssessment } from "./independence.mjs";
import type { IndependentReviewRecalculationRecord } from "./recalculation.mjs";
import type { IndependentReviewSupervisedReexecutionRecord } from "./reexecution.mjs";

export const INDEPENDENT_REVIEW_OPINION_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_OPINION_OUTCOMES: readonly ["consistent", "deviation", "uncertain"];
export const INDEPENDENT_REVIEW_OPINION_EVENT_TYPES: readonly [
  "appeal-filed",
  "appeal-resolved",
  "correction-issued",
  "withdrawal-issued"
];
export const INDEPENDENT_REVIEW_OPINION_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_opinion_input_invalid";
  fieldUnknown: "independent_review_opinion_field_unknown";
  fieldMissing: "independent_review_opinion_field_missing";
  fingerprintMismatch: "independent_review_opinion_fingerprint_mismatch";
  contextMismatch: "independent_review_opinion_context_mismatch";
  timeInvalid: "independent_review_opinion_time_invalid";
  signerIneligible: "independent_review_opinion_signer_ineligible";
  sourceInvalid: "independent_review_opinion_source_invalid";
  actorUnauthorized: "independent_review_opinion_actor_unauthorized";
  eventInvalid: "independent_review_opinion_event_invalid";
  historyInvalid: "independent_review_opinion_history_invalid";
  correctionInvalid: "independent_review_opinion_correction_invalid";
  recordMismatch: "independent_review_opinion_record_mismatch";
}>;

export type IndependentReviewOpinionOutcome = typeof INDEPENDENT_REVIEW_OPINION_OUTCOMES[number];
export type IndependentReviewOpinionEventType = typeof INDEPENDENT_REVIEW_OPINION_EVENT_TYPES[number];
export type IndependentReviewOpinionActorRole = "commissioner" | "evidence-submitter" | "sales" | "opinion-signer";

export interface IndependentReviewOpinionFinding {
  outcome: IndependentReviewOpinionOutcome;
  basis: "statistical-recalculation" | "recalculation-and-later-execution";
  statement: string;
  reason_codes: Array<
    | "outside-declared-tolerance"
    | "later-execution-environment-changed"
    | "later-execution-environment-unknown"
    | "within-declared-tolerance"
  >;
  source_recalculation_fingerprint: IndependentReviewFingerprint;
  source_reexecution_fingerprint: IndependentReviewFingerprint | null;
  statistic_findings: Array<{
    finding_id: string;
    source_type: "recalculation-statistic";
    source_id: string;
    outcome: "consistent" | "deviation";
    source_result: "exact" | "within-tolerance" | "outside-tolerance";
    explanation: string;
  }>;
  environment_findings: Array<{
    finding_id: string;
    source_type: "environment-dimension";
    source_id: string;
    outcome: "consistent" | "uncertain";
    source_result: "same" | "changed" | "unknown";
    explanation: string;
  }>;
  historical_state_reproduced: false;
  performance_conclusion_issued: false;
  finding_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewOpinionRecord {
  schema_version: "1.0.0";
  record_type: "independent_review_opinion";
  opinion_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  issued_at: string;
  engagement_ref: IndependentReviewReference & { object_type: "independent_review_engagement" };
  independence_assessment_ref: IndependentReviewReference & { object_type: "independent_review_independence_assessment" };
  recalculation_ref: IndependentReviewReference & { object_type: "independent_review_recalculation" };
  reexecution_ref: (IndependentReviewReference & { object_type: "independent_review_supervised_reexecution" }) | null;
  signer: {
    subject_id: string;
    organization_id: string;
    role: "opinion-signer";
  };
  finding: IndependentReviewOpinionFinding;
  boundary: {
    opinion_issued: true;
    finding_derived_from_verified_sources: true;
    append_only_lifecycle_required: true;
    submitter_may_modify_finding: false;
    sales_may_modify_finding: false;
    independence_basis: "declared-records-only";
    principal_authentication_verified: false;
    organization_control_externally_verified: false;
    export_authorization_externally_verified: false;
    reviewer_independence_certified: false;
    historical_state_reproduced: false;
    passport_status_mutated: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewOpinionActor {
  subject_id: string;
  organization_id: string;
  role: IndependentReviewOpinionActorRole;
}

export interface IndependentReviewOpinionEvent {
  schema_version: "1.0.0";
  record_type: "independent_review_opinion_event";
  event_id: string;
  version: string;
  tenant_id: string;
  opinion_ref: IndependentReviewReference & { object_type: "independent_review_opinion" };
  sequence: number;
  event_type: IndependentReviewOpinionEventType;
  occurred_at: string;
  actor: IndependentReviewOpinionActor;
  reason: string;
  appeal_id: string | null;
  requested_remedy: "uphold" | "correct" | "withdraw" | null;
  resolution: "upheld" | "correction-required" | "withdrawal-required" | null;
  replacement: {
    recalculation_ref: IndependentReviewOpinionRecord["recalculation_ref"];
    reexecution_ref: IndependentReviewOpinionRecord["reexecution_ref"];
    finding: IndependentReviewOpinionFinding;
  } | null;
  previous_event_fingerprint: IndependentReviewFingerprint | null;
  boundary: {
    append_only: true;
    prior_opinion_retained: true;
    finding_modified: boolean;
    submitter_may_modify_finding: false;
    sales_may_modify_finding: false;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewOpinionProjection {
  opinion_ref: IndependentReviewOpinionEvent["opinion_ref"];
  status: "issued" | "under-appeal" | "correction-required" | "withdrawal-required" | "corrected" | "withdrawn";
  current_finding: IndependentReviewOpinionFinding;
  current_sources: {
    recalculation_ref: IndependentReviewOpinionRecord["recalculation_ref"];
    reexecution_ref: IndependentReviewOpinionRecord["reexecution_ref"];
  };
  event_count: number;
  correction_count: number;
  appeal_count: number;
  open_appeal_count: number;
  appeals: Array<{
    appeal_id: string;
    status: "open" | "remedy-required" | "closed";
    requested_remedy: "uphold" | "correct" | "withdraw";
    disputed_finding_fingerprint: IndependentReviewFingerprint;
    filed_event_id: string;
    resolution: "upheld" | "correction-required" | "withdrawal-required" | null;
    resolved_event_id: string | null;
    remedy_event_id: string | null;
  }>;
  last_event_fingerprint: IndependentReviewFingerprint | null;
  withdrawn_at: string | null;
  history_complete: true;
  original_opinion_retained: true;
}

export interface IndependentReviewOpinionLifecycle {
  schema_version: "1.0.0";
  record_type: "independent_review_opinion_lifecycle";
  opinion: IndependentReviewOpinionRecord;
  events: IndependentReviewOpinionEvent[];
  projection: IndependentReviewOpinionProjection;
  boundary: {
    complete_append_only_history: true;
    original_opinion_retained: true;
    appeals_do_not_modify_findings: true;
    only_eligible_signer_may_correct_or_withdraw: true;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewOpinionContext {
  engagement: IndependentReviewEngagement;
  independence_assessment: IndependentReviewIndependenceAssessment;
  share_grant: PassportShareGrant;
  share_revocations: PassportShareRevocation[];
  passport_version: PassportEvidenceVersion;
  passport_events: Array<{
    event: PassportVersionTerminalEvent;
    replacement_version: PassportEvidenceVersion | null;
  }>;
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
  recalculation: IndependentReviewRecalculationRecord;
  reexecution?: IndependentReviewSupervisedReexecutionRecord | null;
}

export interface IndependentReviewOpinionInput extends IndependentReviewOpinionContext {
  opinion_id: string;
  version: string;
  created_by: string;
  issued_at: string;
}

export interface IndependentReviewOpinionEventInput extends IndependentReviewOpinionContext {
  event_id: string;
  version: string;
  event_type: IndependentReviewOpinionEventType;
  occurred_at: string;
  actor: IndependentReviewOpinionActor;
  reason: string;
  opinion: IndependentReviewOpinionRecord;
  events: IndependentReviewOpinionEvent[];
  appeal_id?: string | null;
  requested_remedy?: "uphold" | "correct" | "withdraw";
  resolution?: "upheld" | "correction-required" | "withdrawal-required";
  replacement_source?: {
    recalculation: IndependentReviewRecalculationRecord;
    reexecution?: IndependentReviewSupervisedReexecutionRecord | null;
  };
}

export function createIndependentReviewOpinion(input: IndependentReviewOpinionInput): IndependentReviewOpinionRecord;
export function verifyIndependentReviewOpinion(input: IndependentReviewOpinionContext & {
  opinion: IndependentReviewOpinionRecord;
}): IndependentReviewOpinionRecord;
export function createIndependentReviewOpinionEvent(input: IndependentReviewOpinionEventInput): IndependentReviewOpinionEvent;
export function projectIndependentReviewOpinion(input: {
  opinion: IndependentReviewOpinionRecord;
  events: IndependentReviewOpinionEvent[];
}): IndependentReviewOpinionProjection;
export function createIndependentReviewOpinionLifecycle(input: {
  opinion: IndependentReviewOpinionRecord;
  events: IndependentReviewOpinionEvent[];
}): IndependentReviewOpinionLifecycle;
export function verifyIndependentReviewOpinionLifecycle(input: IndependentReviewOpinionContext & {
  lifecycle: IndependentReviewOpinionLifecycle;
  correction_sources: Array<{
    event_id: string;
    recalculation: IndependentReviewRecalculationRecord;
    reexecution?: IndependentReviewSupervisedReexecutionRecord | null;
  }>;
}): IndependentReviewOpinionLifecycle;
