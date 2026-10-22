export type EvidenceLifecycleState = "draft" | "validating" | "sealed" | "published" | "expired" | "superseded" | "revoked";
export type MeasurementValidity = "sufficient" | "partial" | "invalid" | "unknown";
export type ContentIntegrity = "passed" | "failed" | "unverifiable";
export type IndependentReview = "not-reviewed" | "in-progress" | "consistent" | "deviation" | "uncertain";
export type EvidenceFreshness = "valid" | "expiring" | "expired" | "unknown";
export type PolicyDecisionStatus = "accepted" | "rejected" | "manual-review";

export interface EvidenceStatusAxes {
  measurement_validity: MeasurementValidity;
  content_integrity: ContentIntegrity;
  independent_review: IndependentReview;
  freshness: EvidenceFreshness;
  policy_decision: PolicyDecisionStatus;
}

export interface EvidenceVersionReference {
  object_type: "evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceLifecycleSnapshot {
  schema_version: "1.0.0";
  evidence_ref: EvidenceVersionReference;
  lifecycle_state: EvidenceLifecycleState;
  status_axes: EvidenceStatusAxes;
  sequence: number;
  last_event_id: string | null;
  updated_at: string;
}

export interface EvidenceLifecycleActor {
  actor_id: string;
  actor_role: "owner" | "operator" | "validator" | "publisher" | "reviewer" | "policy-consumer" | "system";
}

export interface EvidenceLifecycleEvent {
  schema_version: "1.0.0";
  event_id: string;
  evidence_ref: EvidenceVersionReference;
  sequence: number;
  from: { lifecycle_state: EvidenceLifecycleState; status_axes: EvidenceStatusAxes };
  to: { lifecycle_state: EvidenceLifecycleState; status_axes: EvidenceStatusAxes };
  reason_code: "validation_requested" | "validation_failed" | "validation_passed" | "publication_authorized" | "status_changed" | "validity_elapsed" | "replacement_published" | "revocation_authorized";
  occurred_at: string;
  actor: EvidenceLifecycleActor;
  replacement_ref: EvidenceVersionReference | null;
}

export interface EvidenceLifecycleCommand {
  event_id: string;
  to_state: EvidenceLifecycleState;
  reason_code: EvidenceLifecycleEvent["reason_code"];
  occurred_at: string;
  actor: EvidenceLifecycleActor;
  replacement_ref: EvidenceVersionReference | null;
  next_status_axes: EvidenceStatusAxes;
}

export const EVIDENCE_LIFECYCLE_VERSION: "1.0.0";
export const EVIDENCE_LIFECYCLE_STATES: readonly EvidenceLifecycleState[];
export const EVIDENCE_STATUS_AXES: Readonly<Record<keyof EvidenceStatusAxes, readonly string[]>>;
export const EVIDENCE_LIFECYCLE_ERROR_CODES: Readonly<Record<string, string>>;

export function createEvidenceLifecycleSnapshot(input: {
  evidence_ref: EvidenceVersionReference;
  status_axes: EvidenceStatusAxes;
  created_at: string;
}): Readonly<EvidenceLifecycleSnapshot>;

export function transitionEvidenceLifecycle(snapshot: EvidenceLifecycleSnapshot, command: EvidenceLifecycleCommand): Readonly<{
  snapshot: Readonly<EvidenceLifecycleSnapshot>;
  event: Readonly<EvidenceLifecycleEvent>;
}>;

export function replayEvidenceLifecycle(initialSnapshot: EvidenceLifecycleSnapshot, history: EvidenceLifecycleEvent[]): Readonly<EvidenceLifecycleSnapshot>;

export function projectEvidenceStatus(snapshot: EvidenceLifecycleSnapshot): Readonly<{
  schema_version: "1.0.0";
  evidence_ref: EvidenceVersionReference;
  lifecycle_state: EvidenceLifecycleState;
  status_axes: EvidenceStatusAxes;
  blocking_conditions: readonly string[];
  must_evaluate_all_axes: true;
  single_status_allowed: false;
  certification_issued: false;
}>;
