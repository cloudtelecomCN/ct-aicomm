import type { PassportDeliveryPackage } from "../link-evidence-passport/delivery.mjs";
import type {
  PassportEvidenceVersion,
  PassportVersionReference,
  PassportVersionTerminalEvent
} from "../link-evidence-passport/versioning.mjs";

export const INDEPENDENT_REVIEW_ENGAGEMENT_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_LEVELS: readonly [
  "structure-only",
  "statistical-recalculation",
  "supervised-reexecution"
];
export const INDEPENDENT_REVIEW_TOLERANCE_MODES: readonly ["exact", "declared-thresholds"];
export const INDEPENDENT_REVIEW_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_engagement_input_invalid";
  fieldUnknown: "independent_review_engagement_field_unknown";
  fieldMissing: "independent_review_engagement_field_missing";
  fingerprintMismatch: "independent_review_engagement_fingerprint_mismatch";
  contextMismatch: "independent_review_engagement_context_mismatch";
  timeInvalid: "independent_review_engagement_time_invalid";
  toleranceInvalid: "independent_review_engagement_tolerance_invalid";
  deliveryAgreementInvalid: "independent_review_engagement_delivery_agreement_invalid";
  lineageInvalid: "independent_review_engagement_lineage_invalid";
  scopeUnchanged: "independent_review_engagement_scope_unchanged";
  newEngagementRequired: "independent_review_engagement_new_id_required";
}>;

export type IndependentReviewLevel = typeof INDEPENDENT_REVIEW_LEVELS[number];
export type IndependentReviewToleranceMode = typeof INDEPENDENT_REVIEW_TOLERANCE_MODES[number];
export type IndependentReviewFingerprint = `sha256:${string}`;

export interface IndependentReviewReference {
  object_type: string;
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewToleranceRule {
  rule_id: string;
  metric: string;
  unit: string;
  comparison: "absolute-delta" | "relative-percent";
  threshold: number;
}

export interface IndependentReviewTolerancePolicy {
  mode: IndependentReviewToleranceMode;
  rules: IndependentReviewToleranceRule[];
}

export interface IndependentReviewPurpose {
  intended_use:
    | "buyer-due-diligence"
    | "seller-assurance"
    | "internal-governance"
    | "sla-evidence-preparation"
    | "other";
  statement: string;
  prohibited_uses: Array<
    | "certification"
    | "legal-conclusion"
    | "performance-guarantee"
    | "production-control-authorization"
    | "sla-adjudication"
  >;
}

export interface IndependentReviewDeliveryAgreement {
  due_at: string;
  delivery_mode: "offline-package" | "reference-only";
  deliverable_formats: Array<"application/json" | "text/csv" | "text/markdown">;
  language_codes: string[];
  deliverables: Array<
    | "scope-record"
    | "structure-checklist"
    | "recalculation-report"
    | "difference-register"
    | "supervised-run-reference"
    | "environment-difference-register"
  >;
}

export interface IndependentReviewEngagement {
  schema_version: "1.0.0";
  record_type: "independent_review_engagement";
  engagement_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  commissioning_party: {
    subject_id: string;
    organization_id: string;
  };
  intended_reviewer_organization_id: string;
  scope: {
    passport_ref: PassportVersionReference;
    delivery_ref: IndependentReviewReference & { object_type: "passport_delivery_manifest" };
    review_level: IndependentReviewLevel;
    tolerance_policy: IndependentReviewTolerancePolicy;
    purpose: IndependentReviewPurpose;
    delivery_agreement: IndependentReviewDeliveryAgreement;
  };
  supersedes_engagement_ref: (IndependentReviewReference & { object_type: "independent_review_engagement" }) | null;
  scope_change_reason: string | null;
  boundary: {
    engagement_only: true;
    identity_authenticated: false;
    reviewer_independence_verified: false;
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

export interface IndependentReviewEngagementInput {
  engagement_id: string;
  version: string;
  created_by: string;
  created_at: string;
  commissioning_party: IndependentReviewEngagement["commissioning_party"];
  intended_reviewer_organization_id: string;
  review_level: IndependentReviewLevel;
  tolerance_policy: IndependentReviewTolerancePolicy;
  purpose: IndependentReviewPurpose;
  delivery_agreement: IndependentReviewDeliveryAgreement;
  passport_version: PassportEvidenceVersion;
  passport_events: Array<{
    event: PassportVersionTerminalEvent;
    replacement_version: PassportEvidenceVersion | null;
  }>;
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
  scope_change_reason?: string;
}

export interface IndependentReviewScopeComparison {
  schema_version: "1.0.0";
  baseline_ref: IndependentReviewReference & { object_type: "independent_review_engagement" };
  candidate_ref: IndependentReviewReference & { object_type: "independent_review_engagement" };
  scope_changed: boolean;
  changed_fields: Array<
    | "passport_ref"
    | "delivery_ref"
    | "review_level"
    | "tolerance_policy"
    | "purpose"
    | "delivery_agreement"
  >;
  new_engagement_required: boolean;
  new_engagement_satisfied: boolean;
}

export function createIndependentReviewEngagement(input: IndependentReviewEngagementInput): IndependentReviewEngagement;
export function verifyIndependentReviewEngagement(input: {
  record: IndependentReviewEngagement;
  passport_version: PassportEvidenceVersion;
  passport_events: IndependentReviewEngagementInput["passport_events"];
  delivery: PassportDeliveryPackage;
  previous_engagement?: IndependentReviewEngagement;
}): IndependentReviewEngagement;
export function compareIndependentReviewScope(input: {
  baseline: IndependentReviewEngagement;
  candidate: IndependentReviewEngagement;
}): IndependentReviewScopeComparison;
