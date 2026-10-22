export type EvidenceInvalidationEventType = "evidence.expired" | "evidence.superseded" | "evidence.revoked";
export type EvidenceInvalidationReason = "expired" | "superseded" | "revoked" | "ttl_elapsed";

export interface EvidenceInvalidationReference {
  object_type: "evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceInvalidationStatusAxes {
  measurement_validity: "sufficient" | "partial" | "invalid" | "unknown";
  content_integrity: "passed" | "failed" | "unverifiable";
  independent_review: "not-reviewed" | "in-progress" | "consistent" | "deviation" | "uncertain";
  freshness: "valid" | "expiring" | "expired" | "unknown";
  policy_decision: "accepted" | "rejected" | "manual-review";
}

export interface EvidenceStatusLease {
  schema_version: "1.0.0";
  contract_type: "evidence_status_lease";
  lease_id: string;
  evidence_ref: EvidenceInvalidationReference;
  lifecycle_sequence: number;
  source_status_fingerprint: `sha256:${string}`;
  status_checked_at: string;
  issued_at: string;
  evidence_expires_at: string;
  max_cache_ttl_seconds: number;
  ttl_expires_at: string;
  status_query_uri: string;
  fail_closed_on_ttl_expiry: true;
  certification_issued: false;
  contract_fingerprint: `sha256:${string}`;
}

export interface EvidenceInvalidationEvent {
  schema_version: "1.0.0";
  event_type: EvidenceInvalidationEventType;
  event_id: string;
  evidence_ref: EvidenceInvalidationReference;
  lifecycle_sequence: number;
  source_event_id: string;
  source_event_fingerprint: `sha256:${string}`;
  occurred_at: string;
  emitted_at: string;
  replacement_ref: EvidenceInvalidationReference | null;
  delivery_semantics: "at-least-once";
  requires_immediate_invalidation: true;
  certification_issued: false;
  event_fingerprint: `sha256:${string}`;
}

export interface EvidenceDownstreamProjection {
  schema_version: "1.0.0";
  consumer_id: string;
  evidence_ref: EvidenceInvalidationReference;
  lease_id: string;
  lease_fingerprint: `sha256:${string}`;
  lifecycle_sequence: number;
  projection_state: "current" | "invalidated";
  invalidation_reason: EvidenceInvalidationReason | null;
  replacement_ref: EvidenceInvalidationReference | null;
  last_event_id: string | null;
  last_event_fingerprint: `sha256:${string}` | null;
  ttl_expires_at: string;
  status_query_uri: string;
  cached_at: string;
  invalidated_at: string | null;
  updated_at: string;
  certification_issued: false;
}

export interface EvidenceLifecycleTerminalEvent {
  schema_version: "1.0.0";
  event_id: string;
  evidence_ref: EvidenceInvalidationReference;
  sequence: number;
  from: { lifecycle_state: "published"; status_axes: EvidenceInvalidationStatusAxes };
  to: { lifecycle_state: "expired" | "superseded" | "revoked"; status_axes: EvidenceInvalidationStatusAxes };
  reason_code: "validity_elapsed" | "replacement_published" | "revocation_authorized";
  occurred_at: string;
  actor: { actor_id: string; actor_role: string };
  replacement_ref: EvidenceInvalidationReference | null;
}

export const EVIDENCE_INVALIDATION_VERSION: "1.0.0";
export const EVIDENCE_INVALIDATION_EVENT_TYPES: readonly EvidenceInvalidationEventType[];
export const EVIDENCE_INVALIDATION_ERROR_CODES: Readonly<Record<string, string>>;

export function createEvidenceTtlContract(input: {
  leaseId: string;
  evidenceRef: EvidenceInvalidationReference;
  lifecycleSequence: number;
  sourceStatusFingerprint: `sha256:${string}`;
  statusCheckedAt: string;
  issuedAt: string;
  evidenceExpiresAt: string;
  maxCacheTtlSeconds: number;
  statusQueryUri: string;
}): Readonly<EvidenceStatusLease>;

export function verifyEvidenceTtlContract(contract: EvidenceStatusLease): Readonly<EvidenceStatusLease>;

export function createEvidenceInvalidationEvent(input: {
  eventId: string;
  lifecycleEvent: EvidenceLifecycleTerminalEvent;
  emittedAt: string;
}): Readonly<EvidenceInvalidationEvent>;

export function verifyEvidenceInvalidationEvent(
  event: EvidenceInvalidationEvent,
  options?: { sourceLifecycleEvent?: EvidenceLifecycleTerminalEvent }
): Readonly<EvidenceInvalidationEvent>;

export function createEvidenceDownstreamProjection(input: {
  consumerId: string;
  contract: EvidenceStatusLease;
  cachedAt: string;
}): Readonly<EvidenceDownstreamProjection>;

export function consumeEvidenceInvalidationEvent(
  projection: EvidenceDownstreamProjection,
  event: EvidenceInvalidationEvent,
  options: { consumedAt: string }
): Readonly<{
  projection: Readonly<EvidenceDownstreamProjection>;
  applied: boolean;
  idempotent_replay: boolean;
}>;

export function evaluateEvidenceDownstreamTtl(
  projection: EvidenceDownstreamProjection,
  options: { evaluatedAt: string }
): Readonly<{
  projection: Readonly<EvidenceDownstreamProjection>;
  invalidated: boolean;
  idempotent_replay: boolean;
}>;

export function replayEvidenceInvalidationEvents(
  projection: EvidenceDownstreamProjection,
  deliveries: Array<{ event: EvidenceInvalidationEvent; consumed_at: string }>,
  options: { evaluatedAt: string }
): Readonly<EvidenceDownstreamProjection>;
