import type { PassportDeliveryPackage } from "./delivery.mjs";
import type {
  PassportEvidenceVersion,
  PassportEvidenceVersionProjection,
  PassportVersionReference,
  PassportVersionTerminalEvent
} from "./versioning.mjs";

export const PASSPORT_SHARING_VERSION: "1.0.0";
export const PASSPORT_SHARE_STATES: readonly ["active", "expired", "revoked"];
export const PASSPORT_BUYER_DECISIONS: readonly ["accepted", "rejected"];
export const PASSPORT_SHARING_ERROR_CODES: Readonly<{
  inputInvalid: "passport_sharing_input_invalid";
  fieldUnknown: "passport_sharing_field_unknown";
  fieldMissing: "passport_sharing_field_missing";
  fingerprintMismatch: "passport_sharing_fingerprint_mismatch";
  contextMismatch: "passport_sharing_context_mismatch";
  timeInvalid: "passport_sharing_time_invalid";
  shareInactive: "passport_sharing_inactive";
  revocationInvalid: "passport_sharing_revocation_invalid";
  supplementInvalid: "passport_sharing_supplement_invalid";
  decisionInvalid: "passport_sharing_buyer_decision_invalid";
  historyInvalid: "passport_sharing_history_invalid";
}>;

export type PassportShareState = "active" | "expired" | "revoked";
export type PassportBuyerDecisionValue = "accepted" | "rejected";
export type PassportSharingFingerprint = `sha256:${string}`;

export interface PassportSharingReference {
  object_type: string;
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportShareRecipient {
  subject_id: string;
  organization_id: string;
}

export interface PassportShareGrant {
  schema_version: "1.0.0";
  record_type: "passport_share_grant";
  share_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  recipient: PassportShareRecipient;
  purpose: string;
  passport_ref: PassportVersionReference;
  delivery_ref: PassportSharingReference & { object_type: "passport_delivery_manifest" };
  valid_from: string;
  expires_at: string;
  boundary: {
    time_limited: true;
    bearer_secret_included: false;
    identity_authenticated: false;
    export_authorization_verified: false;
    passport_status_mutated: false;
    certification_issued: false;
  };
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportShareRevocation {
  schema_version: "1.0.0";
  record_type: "passport_share_revocation";
  event_id: string;
  sequence: 1;
  tenant_id: string;
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  occurred_at: string;
  reason_code: "publisher-revoked" | "recipient-requested" | "authorization-withdrawn" | "delivery-withdrawn";
  reason_detail: string;
  actor: {
    actor_id: string;
    actor_role: "publisher" | "operator";
  };
  boundary: {
    append_only: true;
    grant_mutated: false;
    passport_status_mutated: false;
    certification_issued: false;
  };
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportShareProjection {
  schema_version: "1.0.0";
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  delivery_ref: PassportSharingReference & { object_type: "passport_delivery_manifest" };
  recipient: PassportShareRecipient;
  evaluated_at: string;
  expires_at: string;
  share_state: PassportShareState;
  passport_lifecycle_state: PassportEvidenceVersionProjection["lifecycle_state"];
  passport_status_axes: PassportEvidenceVersionProjection["status_axes"];
  active: boolean;
  invalidation_reason: string | null;
  revocation_ref: { event_id: string; content_fingerprint: PassportSharingFingerprint } | null;
  passport_status_mutated: false;
  certification_issued: false;
}

export type PassportSupplementCategory =
  | "method-detail"
  | "environment-detail"
  | "source-lineage"
  | "exclusion-rationale"
  | "authorization-context"
  | "other";

export interface PassportSupplementRequestItem {
  item_id: string;
  category: PassportSupplementCategory;
  description: string;
}

export interface PassportSupplementRequest {
  schema_version: "1.0.0";
  record_type: "passport_supplement_request";
  request_id: string;
  version: string;
  tenant_id: string;
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  requested_by: string;
  requested_at: string;
  items: PassportSupplementRequestItem[];
  boundary: {
    request_record_only: true;
    raw_evidence_included: false;
    passport_status_mutated: false;
    certification_issued: false;
  };
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportSupplementResponseItem {
  item_id: string;
  disposition: "provided" | "unavailable";
  artifact_ref: (PassportSharingReference & { object_type: "artifact" }) | null;
  note: string;
}

export interface PassportSupplementResponse {
  schema_version: "1.0.0";
  record_type: "passport_supplement_response";
  response_id: string;
  version: string;
  tenant_id: string;
  request_ref: PassportSharingReference & { object_type: "passport_supplement_request" };
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  responded_by: string;
  responder_role: "publisher" | "operator";
  responded_at: string;
  items: PassportSupplementResponseItem[];
  boundary: {
    request_closed: true;
    raw_artifact_content_included: false;
    passport_status_mutated: false;
    independent_review_verified: false;
    certification_issued: false;
  };
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportBuyerDecision {
  schema_version: "1.0.0";
  record_type: "passport_buyer_decision";
  decision_id: string;
  version: string;
  tenant_id: string;
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  buyer_id: string;
  decided_at: string;
  decision: PassportBuyerDecisionValue;
  reason_codes: string[];
  decision_note: string;
  supplement_request_refs: Array<PassportSharingReference & { object_type: "passport_supplement_request" }>;
  supplement_response_refs: Array<PassportSharingReference & { object_type: "passport_supplement_response" }>;
  share_snapshot: {
    share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
    evaluated_at: string;
    share_state: "active";
    active: true;
    expires_at: string;
  };
  platform_evidence_snapshot: {
    passport_ref: PassportVersionReference;
    evaluated_at: string;
    lifecycle_state: "sealed";
    active: true;
    valid_until: string;
    status_axes: PassportEvidenceVersionProjection["status_axes"];
  };
  boundary: {
    buyer_decision_only: true;
    platform_evidence_status_mutated: false;
    independent_review_status_changed: false;
    freshness_status_changed: false;
    policy_decision_status_changed: false;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: PassportSharingFingerprint;
}

export interface PassportBuyerDecisionProjection {
  schema_version: "1.0.0";
  share_ref: PassportSharingReference & { object_type: "passport_share_grant" };
  passport_ref: PassportVersionReference;
  evaluated_at: string;
  buyer_decision: PassportBuyerDecisionValue | "pending";
  decision_ref: (PassportSharingReference & { object_type: "passport_buyer_decision" }) | null;
  decision_recorded_at: string | null;
  current_share_state: PassportShareState;
  current_access_active: boolean;
  current_passport_lifecycle_state: PassportEvidenceVersionProjection["lifecycle_state"];
  current_passport_status_axes: PassportEvidenceVersionProjection["status_axes"];
  buyer_decision_changes_platform_status: false;
  independent_review_verified: false;
  performance_claim_allowed: false;
  certification_issued: false;
}

export interface PassportSharingContext {
  grant: PassportShareGrant;
  passport_version: PassportEvidenceVersion;
  passport_events: Array<{
    event: PassportVersionTerminalEvent;
    replacement_version: PassportEvidenceVersion | null;
  }>;
  delivery: PassportDeliveryPackage;
  revocations: PassportShareRevocation[];
}

export function createPassportShareGrant(input: {
  share_id: string;
  version: string;
  created_by: string;
  created_at: string;
  recipient: PassportShareRecipient;
  purpose: string;
  expires_at: string;
  passport_version: PassportEvidenceVersion;
  passport_events: PassportSharingContext["passport_events"];
  delivery: PassportDeliveryPackage;
}): PassportShareGrant;

export function verifyPassportShareGrant(input: {
  record: PassportShareGrant;
  passport_version: PassportEvidenceVersion;
  passport_events: PassportSharingContext["passport_events"];
  delivery: PassportDeliveryPackage;
}): PassportShareGrant;

export function createPassportShareRevocation(input: {
  event_id: string;
  grant: PassportShareGrant;
  passport_version: PassportEvidenceVersion;
  passport_events: PassportSharingContext["passport_events"];
  delivery: PassportDeliveryPackage;
  occurred_at: string;
  reason_code: PassportShareRevocation["reason_code"];
  reason_detail: string;
  actor: PassportShareRevocation["actor"];
}): PassportShareRevocation;

export function verifyPassportShareRevocation(input: {
  event: PassportShareRevocation;
  grant: PassportShareGrant;
  passport_version: PassportEvidenceVersion;
  passport_events: PassportSharingContext["passport_events"];
  delivery: PassportDeliveryPackage;
}): PassportShareRevocation;

export function projectPassportShare(input: PassportSharingContext & {
  evaluated_at: string;
}): PassportShareProjection;

export function createPassportSupplementRequest(input: PassportSharingContext & {
  request_id: string;
  version: string;
  requested_by: string;
  requested_at: string;
  items: PassportSupplementRequestItem[];
}): PassportSupplementRequest;

export function verifyPassportSupplementRequest(input: PassportSharingContext & {
  record: PassportSupplementRequest;
}): PassportSupplementRequest;

export function createPassportSupplementResponse(input: PassportSharingContext & {
  response_id: string;
  version: string;
  request: PassportSupplementRequest;
  responded_by: string;
  responder_role: PassportSupplementResponse["responder_role"];
  responded_at: string;
  items: PassportSupplementResponseItem[];
}): PassportSupplementResponse;

export function verifyPassportSupplementResponse(input: PassportSharingContext & {
  record: PassportSupplementResponse;
  request: PassportSupplementRequest;
}): PassportSupplementResponse;

export function createPassportBuyerDecision(input: PassportSharingContext & {
  decision_id: string;
  version: string;
  supplement_requests: PassportSupplementRequest[];
  supplement_responses: PassportSupplementResponse[];
  buyer_id: string;
  decided_at: string;
  decision: PassportBuyerDecisionValue;
  reason_codes: string[];
  decision_note: string;
}): PassportBuyerDecision;

export function verifyPassportBuyerDecision(input: PassportSharingContext & {
  record: PassportBuyerDecision;
  supplement_requests: PassportSupplementRequest[];
  supplement_responses: PassportSupplementResponse[];
}): PassportBuyerDecision;

export function projectPassportBuyerDecision(input: PassportSharingContext & {
  decisions: PassportBuyerDecision[];
  supplement_requests: PassportSupplementRequest[];
  supplement_responses: PassportSupplementResponse[];
  evaluated_at: string;
}): PassportBuyerDecisionProjection;
