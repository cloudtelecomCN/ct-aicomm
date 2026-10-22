export declare const EVIDENCE_EXPORT_AUTHORIZATION_VERSION: "1.0.0";
export declare const EVIDENCE_EXPORT_ERROR_CODES: Readonly<Record<string, string>>;

export interface EvidenceExportReference {
  object_type: "scope" | "method" | "run" | "observation" | "artifact" | "evidence_version" | "review" | "policy_decision" | "export_grant";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceExportGrant {
  schema_version: "1.0.0";
  object_type: "export_grant";
  grant_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: {
    visibility: "private" | "shared" | "public";
    purpose: string;
    recipients: readonly string[];
    expires_at: string | null;
  };
  resource_refs: readonly EvidenceExportReference[];
  recipient: { principal_id: string; organization_id: string };
  purpose: string;
  field_scope: readonly string[];
  expires_at: string;
  watermark: string;
  status: "active" | "revoked" | "expired";
}

export interface EvidenceExportAuthorizationEvent {
  schema_version: "1.0.0";
  event_type: "export_authorization_decision";
  event_id: string;
  request_fingerprint: string;
  tenant_id: string;
  request_tenant_id: string;
  occurred_at: string;
  grant_ref: EvidenceExportReference & { object_type: "export_grant" };
  grant_fingerprint: string;
  principal: { principal_id: string; organization_id: string };
  auth_context_fingerprint: string;
  auth_context_anchor_verified: boolean;
  purpose: string;
  resource_ref: EvidenceExportReference;
  requested_field_scope: readonly string[];
  denied_field_scope: readonly string[];
  decision: "allowed" | "denied";
  reason_codes: readonly string[];
  authorization_expires_at: string;
  download_performed: false;
  principal_authentication_verified: false;
  authorization_enforced_by_transport: false;
  previous_event_fingerprint: string | null;
  event_fingerprint: string;
}

export interface EvidenceExportDeliveryEvent {
  schema_version: "1.0.0";
  event_type: "export_delivery_record";
  event_id: string;
  request_fingerprint: string;
  tenant_id: string;
  occurred_at: string;
  authorization_event_fingerprint: string;
  grant_ref: EvidenceExportReference & { object_type: "export_grant" };
  resource_ref: EvidenceExportReference;
  recipient: { principal_id: string; organization_id: string };
  outcome: "delivered" | "failed";
  bytes_sent: number;
  content_fingerprint: string | null;
  error_code: string | null;
  transport_delivery_reported: true;
  transport_attestation_verified: false;
  previous_event_fingerprint: string | null;
  event_fingerprint: string;
}

export interface EvidenceExportAuditLedger {
  schema_version: "1.0.0";
  tenant_id: string;
  events: readonly (EvidenceExportAuthorizationEvent | EvidenceExportDeliveryEvent)[];
}

export interface EvidenceExportRequestCommand {
  eventId: string;
  requestedAt: string;
  requestTenantId: string;
  principalId: string;
  organizationId: string;
  authContextFingerprint: string;
  purpose: string;
  resourceRef: EvidenceExportReference;
  requestedFieldScope: readonly string[];
  grant: EvidenceExportGrant;
}

export declare function createEvidenceExportAuditLedger(input: { tenantId: string }): EvidenceExportAuditLedger;

export declare function evaluateEvidenceExportRequest(
  ledger: EvidenceExportAuditLedger,
  command: EvidenceExportRequestCommand,
  options?: { expectedAuthContextFingerprint?: string }
): Readonly<{
  ledger: EvidenceExportAuditLedger;
  event: EvidenceExportAuthorizationEvent;
  idempotent_replay: boolean;
}>;

export declare function recordEvidenceExportDelivery(
  ledger: EvidenceExportAuditLedger,
  command: {
    eventId: string;
    authorizationEventFingerprint: string;
    reportedAt: string;
    outcome: "delivered" | "failed";
    bytesSent: number;
    contentFingerprint: string | null;
    errorCode: string | null;
  }
): Readonly<{
  ledger: EvidenceExportAuditLedger;
  event: EvidenceExportDeliveryEvent;
  idempotent_replay: boolean;
}>;

export declare function verifyEvidenceExportAuditLedger(ledger: EvidenceExportAuditLedger): Readonly<{
  schema_version: "1.0.0";
  tenant_id: string;
  event_count: number;
  allowed_decision_count: number;
  denied_decision_count: number;
  delivered_count: number;
  failed_delivery_count: number;
  last_event_fingerprint: string | null;
  append_only_chain_verified: true;
  principal_authentication_verified: false;
  transport_attestation_verified: false;
  certification_issued: false;
}>;
