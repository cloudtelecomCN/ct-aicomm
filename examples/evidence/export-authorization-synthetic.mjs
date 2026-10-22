import { readFile } from "node:fs/promises";
import {
  createEvidenceExportAuditLedger,
  evaluateEvidenceExportRequest,
  recordEvidenceExportDelivery,
  verifyEvidenceExportAuditLedger
} from "../../packages/evidence-export/index.mjs";

const grant = JSON.parse(await readFile(
  new URL("./v1/export-grant.synthetic.json", import.meta.url),
  "utf8"
));
const authContextFingerprint = `sha256:${"a".repeat(64)}`;
const resourceRef = grant.resource_refs[0];

let ledger = createEvidenceExportAuditLedger({ tenantId: grant.tenant_id });
const allowed = evaluateEvidenceExportRequest(ledger, {
  eventId: "export-auth-synthetic-allowed",
  requestedAt: "2026-10-23T02:00:00.000Z",
  requestTenantId: grant.tenant_id,
  principalId: grant.recipient.principal_id,
  organizationId: grant.recipient.organization_id,
  authContextFingerprint,
  purpose: grant.purpose,
  resourceRef,
  requestedFieldScope: ["/boundary/data_origin", "/status/independent_review"],
  grant
}, { expectedAuthContextFingerprint: authContextFingerprint });
ledger = allowed.ledger;

const delivery = recordEvidenceExportDelivery(ledger, {
  eventId: "export-delivery-synthetic-001",
  authorizationEventFingerprint: allowed.event.event_fingerprint,
  reportedAt: "2026-10-23T02:00:01.000Z",
  outcome: "delivered",
  bytesSent: 512,
  contentFingerprint: `sha256:${"b".repeat(64)}`,
  errorCode: null
});
ledger = delivery.ledger;

const denied = evaluateEvidenceExportRequest(ledger, {
  eventId: "export-auth-synthetic-cross-tenant",
  requestedAt: "2026-10-23T02:01:00.000Z",
  requestTenantId: "tenant-synthetic-beta",
  principalId: grant.recipient.principal_id,
  organizationId: grant.recipient.organization_id,
  authContextFingerprint,
  purpose: grant.purpose,
  resourceRef: { ...resourceRef, tenant_id: "tenant-synthetic-beta" },
  requestedFieldScope: ["/boundary"],
  grant
}, { expectedAuthContextFingerprint: authContextFingerprint });
ledger = denied.ledger;

const verification = verifyEvidenceExportAuditLedger(ledger);
const serializedLedger = JSON.stringify(ledger);

process.stdout.write(`${JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  allowed_decision_count: verification.allowed_decision_count,
  denied_decision_count: verification.denied_decision_count,
  delivered_count: verification.delivered_count,
  cross_tenant_denied: denied.event.reason_codes.includes("evidence_export_tenant_mismatch"),
  append_only_chain_verified: verification.append_only_chain_verified,
  raw_export_content_recorded: serializedLedger.includes("download_url") || serializedLedger.includes("payload_bytes"),
  principal_authentication_verified: verification.principal_authentication_verified,
  transport_attestation_verified: verification.transport_attestation_verified,
  certification_issued: verification.certification_issued
}, null, 2)}\n`);
