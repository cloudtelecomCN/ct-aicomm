import type {
  IndependentReviewOpinionContext,
  IndependentReviewOpinionLifecycle,
  IndependentReviewOpinionOutcome,
  IndependentReviewOpinionProjection
} from "./opinion.mjs";
import type { IndependentReviewFingerprint, IndependentReviewReference } from "./index.mjs";
import type { IndependentReviewRecalculationRecord } from "./recalculation.mjs";
import type { IndependentReviewSupervisedReexecutionRecord } from "./reexecution.mjs";

export const INDEPENDENT_REVIEW_WORKSPACE_VERSION: "1.0.0";
export const INDEPENDENT_REVIEW_SCOPE_MARK_STATES: readonly ["eligible", "blocked", "withdrawn"];
export const INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES: Readonly<{
  inputInvalid: "independent_review_workspace_input_invalid";
  fieldUnknown: "independent_review_workspace_field_unknown";
  fieldMissing: "independent_review_workspace_field_missing";
  fingerprintMismatch: "independent_review_workspace_fingerprint_mismatch";
  contextMismatch: "independent_review_workspace_context_mismatch";
  timeInvalid: "independent_review_workspace_time_invalid";
  markIneligible: "independent_review_workspace_mark_ineligible";
  fileSetMismatch: "independent_review_workspace_file_set_mismatch";
  checksumMismatch: "independent_review_workspace_checksum_mismatch";
  contentMismatch: "independent_review_workspace_content_mismatch";
}>;

export type IndependentReviewScopeMarkState = typeof INDEPENDENT_REVIEW_SCOPE_MARK_STATES[number];
export type IndependentReviewWorkflowStepId =
  | "scope"
  | "independence"
  | "recalculation"
  | "reexecution"
  | "opinion"
  | "scope-mark";
export type IndependentReviewWorkflowStepState =
  | "complete"
  | "not-required"
  | "attention"
  | "blocked"
  | "withdrawn"
  | "ready";

export interface IndependentReviewReviewerOrganization {
  organization_id: string;
  display_name: string;
}

export interface IndependentReviewWorkspaceScope {
  review_level: string;
  intended_use: string;
  purpose_statement: string;
  tolerance_mode: string;
  deliverables: string[];
  passport_ref: IndependentReviewReference & { object_type: "passport_evidence_version" };
  delivery_ref: IndependentReviewReference & { object_type: "passport_delivery_manifest" };
}

export interface IndependentReviewWorkspaceOpinionSummary {
  opinion_ref: IndependentReviewReference & { object_type: "independent_review_opinion" };
  original_issued_at: string;
  effective_at: string;
  status: IndependentReviewOpinionProjection["status"];
  outcome: IndependentReviewOpinionOutcome;
  statement: string;
  reason_codes: string[];
  finding_fingerprint: IndependentReviewFingerprint;
  event_count: number;
  appeal_count: number;
  correction_count: number;
  open_appeal_count: number;
}

export interface IndependentReviewWorkspaceSnapshot {
  schema_version: "1.0.0";
  record_type: "independent_review_workspace_snapshot";
  workspace_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  generated_at: string;
  reviewer_organization: IndependentReviewReviewerOrganization;
  engagement_ref: IndependentReviewReference & { object_type: "independent_review_engagement" };
  independence_assessment_ref: IndependentReviewReference & { object_type: "independent_review_independence_assessment" };
  recalculation_ref: IndependentReviewReference & { object_type: "independent_review_recalculation" };
  reexecution_ref: (IndependentReviewReference & { object_type: "independent_review_supervised_reexecution" }) | null;
  lifecycle_ref: IndependentReviewReference & { object_type: "independent_review_opinion_lifecycle" };
  scope: IndependentReviewWorkspaceScope;
  opinion: IndependentReviewWorkspaceOpinionSummary;
  workflow_steps: Array<{
    step_id: IndependentReviewWorkflowStepId;
    state: IndependentReviewWorkflowStepState;
    source_fingerprint: IndependentReviewFingerprint | null;
  }>;
  scope_mark_eligibility: {
    eligible: boolean;
    state: IndependentReviewScopeMarkState;
    blockers: string[];
  };
  limitations: string[];
  boundary: {
    scope_bound: true;
    read_model_only: true;
    customer_data_persisted: false;
    identity_authenticated: false;
    organization_control_externally_verified: false;
    export_authorization_externally_verified: false;
    reviewer_independence_certified: false;
    historical_state_reproduced: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    legal_conclusion_issued: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewScopeMark {
  schema_version: "1.0.0";
  record_type: "independent_review_scope_mark";
  mark_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  issued_at: string;
  workspace_ref: IndependentReviewReference & { object_type: "independent_review_workspace_snapshot" };
  reviewer_organization: IndependentReviewReviewerOrganization;
  opinion_date: string;
  scope: IndependentReviewWorkspaceScope;
  opinion: IndependentReviewWorkspaceOpinionSummary;
  limitations: string[];
  display: {
    label: "Scope-bound independent review opinion";
    institution: string;
    date: string;
    scope: string;
    outcome: IndependentReviewOpinionOutcome;
    limitation: string;
  };
  boundary: {
    scope_bound: true;
    trusted_signature_attached: false;
    identity_authenticated: false;
    organization_control_externally_verified: false;
    export_authorization_externally_verified: false;
    reviewer_independence_certified: false;
    historical_state_reproduced: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    legal_conclusion_issued: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewWorkspaceContext extends IndependentReviewOpinionContext {
  lifecycle: IndependentReviewOpinionLifecycle;
  correction_sources: Array<{
    event_id: string;
    recalculation: IndependentReviewRecalculationRecord;
    reexecution?: IndependentReviewSupervisedReexecutionRecord | null;
  }>;
}

export interface IndependentReviewWorkspaceExportManifest {
  schema_version: "1.0.0";
  record_type: "independent_review_workspace_export_manifest";
  export_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  workspace_ref: IndependentReviewScopeMark["workspace_ref"];
  scope_mark_ref: IndependentReviewReference & { object_type: "independent_review_scope_mark" };
  artifacts: Array<{
    path: "workspace.json" | "scope-mark.json" | "README.md";
    media_type: "application/json" | "text/markdown";
    role: "review-workspace-snapshot" | "scope-bound-review-mark" | "human-readable-boundary";
    bytes: number;
    sha256: IndependentReviewFingerprint;
  }>;
  boundary: {
    integrity_only: true;
    raw_samples_included: false;
    customer_identifiers_included: false;
    source_records_embedded: false;
    offline_source_reverification: false;
    trusted_signature_attached: false;
    performance_claim_allowed: false;
    sla_adjudicated: false;
    legal_conclusion_issued: false;
    certification_issued: false;
  };
  content_fingerprint: IndependentReviewFingerprint;
}

export interface IndependentReviewWorkspaceExport {
  manifest: IndependentReviewWorkspaceExportManifest;
  files: Array<{ path: string; content: string }>;
}

export function createIndependentReviewWorkspace(input: IndependentReviewWorkspaceContext & {
  workspace_id: string;
  version: string;
  created_by: string;
  generated_at: string;
  reviewer_organization: IndependentReviewReviewerOrganization;
}): IndependentReviewWorkspaceSnapshot;

export function verifyIndependentReviewWorkspace(input: IndependentReviewWorkspaceContext & {
  workspace: IndependentReviewWorkspaceSnapshot;
}): IndependentReviewWorkspaceSnapshot;

export function createIndependentReviewScopeMark(input: IndependentReviewWorkspaceContext & {
  mark_id: string;
  version: string;
  created_by: string;
  issued_at: string;
  workspace: IndependentReviewWorkspaceSnapshot;
}): IndependentReviewScopeMark;

export function verifyIndependentReviewScopeMark(input: IndependentReviewWorkspaceContext & {
  scope_mark: IndependentReviewScopeMark;
  workspace: IndependentReviewWorkspaceSnapshot;
}): IndependentReviewScopeMark;

export function createIndependentReviewWorkspaceExport(input: {
  export_id: string;
  version: string;
  created_by: string;
  created_at: string;
  workspace: IndependentReviewWorkspaceSnapshot;
  scope_mark: IndependentReviewScopeMark;
}): IndependentReviewWorkspaceExport;

export function verifyIndependentReviewWorkspaceExport(input: {
  files: IndependentReviewWorkspaceExport["files"];
}): {
  schema_version: "1.0.0";
  export_id: string;
  workspace_id: string;
  mark_id: string;
  institution: string;
  opinion_date: string;
  review_level: string;
  opinion_status: "issued" | "corrected";
  opinion_outcome: IndependentReviewOpinionOutcome;
  checksums_verified: true;
  record_fingerprints_verified: true;
  exact_scope_binding_verified: true;
  raw_samples_included: false;
  customer_identifiers_included: false;
  source_records_embedded: false;
  offline_source_reverification: false;
  trusted_signature_attached: false;
  performance_claim_allowed: false;
  certification_issued: false;
  external_network_used: false;
};
