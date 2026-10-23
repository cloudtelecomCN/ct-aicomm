import { pathToFileURL } from "node:url";

import {
  createPassportBuyerDecision,
  createPassportShareGrant,
  createPassportShareRevocation,
  createPassportSupplementRequest,
  createPassportSupplementResponse,
  projectPassportBuyerDecision,
  projectPassportShare
} from "../../packages/link-evidence-passport/sharing.mjs";
import { buildSyntheticPassportDeliveryScenario } from "./delivery-package-synthetic.mjs";

function artifactReference(tenantId, objectId, fingerprint) {
  return {
    object_type: "artifact",
    object_id: objectId,
    version: "1.0.0",
    tenant_id: tenantId,
    content_fingerprint: fingerprint
  };
}

export function buildSyntheticPassportSharingScenario() {
  const scenario = buildSyntheticPassportDeliveryScenario();
  const passportContext = {
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
  const acceptedGrant = createPassportShareGrant({
    share_id: "passport-share-ct615-accepted",
    version: "1.0.0",
    created_by: "publisher-ct615",
    created_at: "2026-10-23T11:10:00.000Z",
    recipient: {
      subject_id: "buyer-alpha",
      organization_id: "buyer-org-alpha"
    },
    purpose: "Synthetic buyer evaluation of an exact offline passport delivery.",
    expires_at: "2026-10-23T11:45:00.000Z",
    ...passportContext
  });
  const activeBeforeRevocation = projectPassportShare({
    grant: acceptedGrant,
    revocations: [],
    evaluated_at: "2026-10-23T11:11:00.000Z",
    ...passportContext
  });
  const supplementRequest = createPassportSupplementRequest({
    request_id: "passport-supplement-request-ct615",
    version: "1.0.0",
    grant: acceptedGrant,
    revocations: [],
    requested_by: "buyer-alpha",
    requested_at: "2026-10-23T11:15:00.000Z",
    items: [
      {
        item_id: "environment-detail",
        category: "environment-detail",
        description: "Provide the exact synthetic environment declaration used by the delivery."
      },
      {
        item_id: "method-detail",
        category: "method-detail",
        description: "Provide the frozen synthetic measurement-method artifact reference."
      }
    ],
    ...passportContext
  });
  const supplementResponse = createPassportSupplementResponse({
    response_id: "passport-supplement-response-ct615",
    version: "1.0.0",
    request: supplementRequest,
    grant: acceptedGrant,
    revocations: [],
    responded_by: "publisher-ct615",
    responder_role: "publisher",
    responded_at: "2026-10-23T11:20:00.000Z",
    items: [
      {
        item_id: "environment-detail",
        disposition: "provided",
        artifact_ref: artifactReference(
          scenario.replacement.tenant_id,
          "synthetic-environment-declaration",
          "sha256:31f7cc07b6f69e2ea840682ee66b2c4c6419d21f5d27432e3c813704c8780bd0"
        ),
        note: "Hash reference only; artifact access remains separately authorized."
      },
      {
        item_id: "method-detail",
        disposition: "provided",
        artifact_ref: artifactReference(
          scenario.replacement.tenant_id,
          "synthetic-method-freeze",
          "sha256:df0acda479690c922346401a297723984050d26347125f7b83a8cd56ca79a3bb"
        ),
        note: "Hash reference only; no raw artifact bytes are embedded."
      }
    ],
    ...passportContext
  });
  const acceptedDecision = createPassportBuyerDecision({
    decision_id: "passport-buyer-decision-ct615-accepted",
    version: "1.0.0",
    grant: acceptedGrant,
    revocations: [],
    supplement_requests: [supplementRequest],
    supplement_responses: [supplementResponse],
    buyer_id: "buyer-alpha",
    decided_at: "2026-10-23T11:25:00.000Z",
    decision: "accepted",
    reason_codes: ["evidence-sufficient", "supplement-satisfied"],
    decision_note: "Synthetic buyer accepts this exact delivery for its own evaluation scope.",
    ...passportContext
  });
  const revocation = createPassportShareRevocation({
    event_id: "passport-share-revocation-ct615",
    grant: acceptedGrant,
    occurred_at: "2026-10-23T11:30:00.000Z",
    reason_code: "publisher-revoked",
    reason_detail: "Synthetic demonstration of append-only access revocation after a recorded decision.",
    actor: {
      actor_id: "publisher-ct615",
      actor_role: "publisher"
    },
    ...passportContext
  });
  const acceptedAfterRevocation = projectPassportBuyerDecision({
    decisions: [acceptedDecision],
    grant: acceptedGrant,
    revocations: [revocation],
    supplement_requests: [supplementRequest],
    supplement_responses: [supplementResponse],
    evaluated_at: "2026-10-23T11:31:00.000Z",
    ...passportContext
  });

  const rejectedGrant = createPassportShareGrant({
    share_id: "passport-share-ct615-rejected",
    version: "1.0.0",
    created_by: "publisher-ct615",
    created_at: "2026-10-23T11:12:00.000Z",
    recipient: {
      subject_id: "buyer-bravo",
      organization_id: "buyer-org-bravo"
    },
    purpose: "Synthetic independent buyer evaluation of the same exact delivery.",
    expires_at: "2026-10-23T11:50:00.000Z",
    ...passportContext
  });
  const rejectedDecision = createPassportBuyerDecision({
    decision_id: "passport-buyer-decision-ct615-rejected",
    version: "1.0.0",
    grant: rejectedGrant,
    revocations: [],
    supplement_requests: [],
    supplement_responses: [],
    buyer_id: "buyer-bravo",
    decided_at: "2026-10-23T11:18:00.000Z",
    decision: "rejected",
    reason_codes: ["scope-mismatch"],
    decision_note: "Synthetic buyer rejects the delivery because its own evaluation scope differs.",
    ...passportContext
  });
  const rejectedProjection = projectPassportBuyerDecision({
    decisions: [rejectedDecision],
    grant: rejectedGrant,
    revocations: [],
    supplement_requests: [],
    supplement_responses: [],
    evaluated_at: "2026-10-23T11:19:00.000Z",
    ...passportContext
  });

  return {
    ...scenario,
    acceptedGrant,
    activeBeforeRevocation,
    supplementRequest,
    supplementResponse,
    acceptedDecision,
    revocation,
    acceptedAfterRevocation,
    rejectedGrant,
    rejectedDecision,
    rejectedProjection
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticPassportSharingScenario();
  console.log(JSON.stringify({
    schema_version: scenario.acceptedDecision.schema_version,
    data_origin: "synthetic",
    share_active_before_revocation: scenario.activeBeforeRevocation.active,
    supplement_request_count: 1,
    supplement_item_count: scenario.supplementRequest.items.length,
    supplement_response_complete: scenario.supplementResponse.items.every(({ disposition }) => disposition === "provided"),
    accepted_decision_recorded: scenario.acceptedAfterRevocation.buyer_decision === "accepted",
    rejected_decision_recorded: scenario.rejectedProjection.buyer_decision === "rejected",
    share_state_after_revocation: scenario.acceptedAfterRevocation.current_share_state,
    current_access_after_revocation: scenario.acceptedAfterRevocation.current_access_active,
    platform_lifecycle_before_acceptance: scenario.acceptedDecision.platform_evidence_snapshot.lifecycle_state,
    platform_lifecycle_after_revocation: scenario.acceptedAfterRevocation.current_passport_lifecycle_state,
    platform_evidence_status_mutated: scenario.acceptedDecision.boundary.platform_evidence_status_mutated,
    buyer_acceptance_separate: scenario.acceptedAfterRevocation.buyer_decision_changes_platform_status === false,
    identity_authenticated: scenario.acceptedGrant.boundary.identity_authenticated,
    export_authorization_verified: scenario.acceptedGrant.boundary.export_authorization_verified,
    external_network_used: false,
    performance_claim_allowed: scenario.acceptedDecision.boundary.performance_claim_allowed,
    certification_issued: scenario.acceptedDecision.boundary.certification_issued
  }));
}
