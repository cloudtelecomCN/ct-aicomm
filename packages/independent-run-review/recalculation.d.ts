import type { PassportDeliveryPackage, PassportDeliveryStatistic } from "../link-evidence-passport/delivery.mjs";
import type { PassportEvidenceVersion, PassportVersionTerminalEvent } from "../link-evidence-passport/versioning.mjs";
import type { PassportShareGrant, PassportShareRevocation } from "../link-evidence-passport/sharing.mjs";
import type { IndependentReviewEngagement, IndependentReviewFingerprint } from "./index.mjs";
import type { IndependentReviewIndependenceAssessment } from "./independence.mjs";

export const INDEPENDENT_REVIEW_RECALCULATION_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_RECALCULATION_RESULTS: readonly [
  "exact",
  "within-tolerance",
  "outside-tolerance"
];
export const INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_recalculation_input_invalid";
  fieldUnknown: "independent_review_recalculation_field_unknown";
  fieldMissing: "independent_review_recalculation_field_missing";
  fingerprintMismatch: "independent_review_recalculation_fingerprint_mismatch";
  contextMismatch: "independent_review_recalculation_context_mismatch";
  timeInvalid: "independent_review_recalculation_time_invalid";
  engagementLevelInvalid: "independent_review_recalculation_engagement_level_invalid";
  independenceInvalid: "independent_review_recalculation_independence_invalid";
  shareInvalid: "independent_review_recalculation_share_invalid";
  structureInvalid: "independent_review_recalculation_structure_invalid";
  statisticInvalid: "independent_review_recalculation_statistic_invalid";
  resultCoverageInvalid: "independent_review_recalculation_result_coverage_invalid";
  recordMismatch: "independent_review_recalculation_record_mismatch";
}>;

export type IndependentReviewRecalculationResult = typeof INDEPENDENT_REVIEW_RECALCULATION_RESULTS[number];

export interface IndependentReviewRecalculatedStatistic {
  statistic_id: string;
  observation_ref: PassportDeliveryStatistic["observation_ref"];
  data_origin: PassportDeliveryStatistic["data_origin"];
  metric_key: string;
  metric: string;
  aggregation: PassportDeliveryStatistic["aggregation"];
  normalized_unit: string;
  attempted_samples: number;
  included_samples: number;
  failed_samples: number;
  excluded_samples: number;
  sample_recomputed_value: number | null;
}

export interface IndependentReviewStatisticsCalculation {
  statistics_profile: PassportDeliveryPackage["manifest"]["statistics_profile"];
  sample_count: number;
  statistic_count: number;
  statistics: IndependentReviewRecalculatedStatistic[];
}

export interface IndependentReviewSubmittedStatistic {
  statistic_id: string;
  recalculated_value: number | null;
}

export interface IndependentReviewRecalculationRecord {
  schema_version: "1.0.0";
  record_type: "independent_review_recalculation";
  recalculation_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  recalculated_at: string;
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
  reviewer: {
    subject_id: string;
    organization_id: string;
    role: "review-lead";
  };
  statistics_profile: PassportDeliveryPackage["manifest"]["statistics_profile"];
  implementation: {
    implementation_id: string;
    implementation_version: string;
    runtime: string;
  };
  submitted_statistics: IndependentReviewSubmittedStatistic[];
  structure_checklist: {
    status: "passed";
    checks: Array<{
      check_id:
        | "delivery-integrity"
        | "engagement-binding"
        | "independence-gate"
        | "active-review-share"
        | "statistics-profile"
        | "sample-accounting"
        | "result-coverage";
      status: "passed";
    }>;
  };
  statistics: Array<IndependentReviewRecalculatedStatistic & {
    independently_recalculated_value: number | null;
    result: IndependentReviewRecalculationResult;
    absolute_delta: number;
    relative_delta_percent: number | null;
    tolerance_rule_id: string | null;
    tolerance_comparison: "exact" | "absolute-delta" | "relative-percent";
    tolerance_threshold: number;
    explanation: string;
  }>;
  differences: Array<{
    difference_id: string;
    statistic_id: string;
    classification: "within-tolerance" | "outside-tolerance";
    expected_value: number | null;
    recalculated_value: number | null;
    absolute_delta: number;
    relative_delta_percent: number | null;
    tolerance_rule_id: string | null;
    explanation: string;
  }>;
  summary: {
    outcome: "consistent" | "deviation";
    statistic_count: number;
    exact_count: number;
    within_tolerance_count: number;
    outside_tolerance_count: number;
    difference_count: number;
    sample_count: number;
  };
  boundary: {
    limited_review_work_recorded: true;
    active_share_record_checked: true;
    structure_checks_performed: true;
    statistics_recalculated: true;
    implementation_identity_self_declared: true;
    principal_authentication_verified: false;
    organization_control_externally_verified: false;
    export_authorization_externally_verified: false;
    reviewer_independence_certified: false;
    supervised_reexecution_performed: false;
    opinion_issued: false;
    passport_status_mutated: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewRecalculationContext {
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
}

export interface IndependentReviewRecalculationInput extends IndependentReviewRecalculationContext {
  recalculation_id: string;
  version: string;
  created_by: string;
  recalculated_at: string;
  implementation: IndependentReviewRecalculationRecord["implementation"];
  recalculated_statistics: IndependentReviewSubmittedStatistic[];
}

export function recalculateIndependentReviewStatistics(input: {
  delivery: PassportDeliveryPackage;
}): IndependentReviewStatisticsCalculation;

export function createIndependentReviewRecalculation(
  input: IndependentReviewRecalculationInput
): IndependentReviewRecalculationRecord;

export function verifyIndependentReviewRecalculation(input: IndependentReviewRecalculationContext & {
  record: IndependentReviewRecalculationRecord;
}): IndependentReviewRecalculationRecord;
