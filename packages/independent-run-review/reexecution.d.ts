import type { PassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import type { PassportEvidenceVersion, PassportVersionTerminalEvent } from "../link-evidence-passport/versioning.mjs";
import type { PassportShareGrant, PassportShareRevocation } from "../link-evidence-passport/sharing.mjs";
import type { IndependentReviewEngagement, IndependentReviewFingerprint } from "./index.mjs";
import type { IndependentReviewIndependenceAssessment } from "./independence.mjs";
import type { IndependentReviewRecalculationRecord } from "./recalculation.mjs";

export const INDEPENDENT_REVIEW_REEXECUTION_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS: readonly [
  "sites",
  "protocol",
  "workload",
  "method",
  "compute",
  "software",
  "network"
];
export const INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_reexecution_input_invalid";
  fieldUnknown: "independent_review_reexecution_field_unknown";
  fieldMissing: "independent_review_reexecution_field_missing";
  fingerprintMismatch: "independent_review_reexecution_fingerprint_mismatch";
  contextMismatch: "independent_review_reexecution_context_mismatch";
  timeInvalid: "independent_review_reexecution_time_invalid";
  engagementLevelInvalid: "independent_review_reexecution_engagement_level_invalid";
  independenceInvalid: "independent_review_reexecution_independence_invalid";
  shareInvalid: "independent_review_reexecution_share_invalid";
  deliveryInvalid: "independent_review_reexecution_delivery_invalid";
  recalculationInvalid: "independent_review_reexecution_recalculation_invalid";
  environmentInvalid: "independent_review_reexecution_environment_invalid";
  supervisionInvalid: "independent_review_reexecution_supervision_invalid";
  recordMismatch: "independent_review_reexecution_record_mismatch";
}>;

export type IndependentReviewEnvironmentDimension = typeof INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS[number];
export type IndependentReviewEnvironmentBasis = "declared" | "observed" | "unknown";
export type IndependentReviewEnvironmentComparison = "same" | "changed" | "unknown";

export interface IndependentReviewEnvironmentSnapshot {
  dimensions: Array<{
    dimension: IndependentReviewEnvironmentDimension;
    basis: IndependentReviewEnvironmentBasis;
    fingerprint: IndependentReviewFingerprint | null;
  }>;
}

export interface IndependentReviewEnvironmentDifference {
  dimension: IndependentReviewEnvironmentDimension;
  historical: {
    dimension: IndependentReviewEnvironmentDimension;
    basis: "historical-package" | "unknown";
    fingerprint: IndependentReviewFingerprint | null;
  };
  current: IndependentReviewEnvironmentSnapshot["dimensions"][number];
  classification: IndependentReviewEnvironmentComparison;
}

export interface IndependentReviewEnvironmentComparisonResult {
  current_environment: IndependentReviewEnvironmentSnapshot;
  differences: IndependentReviewEnvironmentDifference[];
  summary: {
    dimension_count: 7;
    same_count: number;
    changed_count: number;
    unknown_count: number;
    historical_state_reproduced: false;
  };
}

export interface IndependentReviewSupervisedReexecutionRecord {
  schema_version: "1.0.0";
  record_type: "independent_review_supervised_reexecution";
  reexecution_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  recorded_at: string;
  engagement_ref: {
    object_type: "independent_review_engagement";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: IndependentReviewFingerprint;
  };
  independence_assessment_ref: {
    object_type: "independent_review_independence_assessment";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: IndependentReviewFingerprint;
  };
  share_ref: {
    object_type: "passport_share_grant";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: IndependentReviewFingerprint;
  };
  passport_ref: IndependentReviewEngagement["scope"]["passport_ref"];
  delivery_ref: IndependentReviewEngagement["scope"]["delivery_ref"];
  historical_recalculation_ref: {
    object_type: "independent_review_recalculation";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: IndependentReviewFingerprint;
  };
  historical_run_ref: PassportDeliveryPackage["manifest"]["run_ref"];
  reviewer: {
    subject_id: string;
    organization_id: string;
    role: "review-lead";
  };
  new_run: {
    run_id: string;
    version: string;
    tenant_id: string;
    started_at: string;
    completed_at: string;
    data_origin: "measured" | "synthetic" | "inferred" | "declared";
    artifact_manifest_fingerprint: IndependentReviewFingerprint;
    environment_snapshot: IndependentReviewEnvironmentSnapshot;
    content_fingerprint: IndependentReviewFingerprint;
  };
  supervision: {
    mode: "live-observation";
    supervisor_subject_id: string;
    supervisor_organization_id: string;
    started_at: string;
    completed_at: string;
    event_count: number;
    event_log_fingerprint: IndependentReviewFingerprint;
  };
  temporal_relation: {
    classification: "later-execution";
    historical_delivery_created_at: string;
    historical_recalculated_at: string;
    new_run_started_at: string;
    historical_state_reproduced: false;
  };
  environment_difference_register: IndependentReviewEnvironmentDifference[];
  summary: IndependentReviewEnvironmentComparisonResult["summary"] & {
    supervision_covers_complete_run: true;
    comparison_status: "environment-differences-recorded";
    performance_conclusion: "not-issued";
  };
  boundary: {
    historical_package_referenced: true;
    later_run_recorded: true;
    supervision_recorded: true;
    environment_differences_recorded: true;
    historical_state_reproduced: false;
    supervision_externally_attested: false;
    principal_authentication_verified: false;
    organization_control_externally_verified: false;
    export_authorization_externally_verified: false;
    reviewer_independence_certified: false;
    opinion_issued: false;
    passport_status_mutated: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewSupervisedReexecutionContext {
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
  historical_recalculation: IndependentReviewRecalculationRecord;
  previous_engagement?: IndependentReviewEngagement;
}

export interface IndependentReviewSupervisedReexecutionInput extends IndependentReviewSupervisedReexecutionContext {
  reexecution_id: string;
  version: string;
  created_by: string;
  recorded_at: string;
  new_run: Omit<IndependentReviewSupervisedReexecutionRecord["new_run"], "content_fingerprint">;
  supervision: IndependentReviewSupervisedReexecutionRecord["supervision"];
}

export function compareIndependentReviewRunEnvironment(input: {
  delivery: PassportDeliveryPackage;
  current_environment: IndependentReviewEnvironmentSnapshot;
}): IndependentReviewEnvironmentComparisonResult;

export function createIndependentReviewSupervisedReexecution(
  input: IndependentReviewSupervisedReexecutionInput
): IndependentReviewSupervisedReexecutionRecord;

export function verifyIndependentReviewSupervisedReexecution(
  input: IndependentReviewSupervisedReexecutionContext & {
    record: IndependentReviewSupervisedReexecutionRecord;
  }
): IndependentReviewSupervisedReexecutionRecord;
