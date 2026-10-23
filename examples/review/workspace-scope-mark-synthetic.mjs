import { pathToFileURL } from "node:url";

import { createIndependentReviewOpinionLifecycle } from "../../packages/independent-run-review/opinion.mjs";
import {
  INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES,
  createIndependentReviewScopeMark,
  createIndependentReviewWorkspace,
  createIndependentReviewWorkspaceExport,
  verifyIndependentReviewScopeMark,
  verifyIndependentReviewWorkspace,
  verifyIndependentReviewWorkspaceExport
} from "../../packages/independent-run-review/workspace.mjs";
import { buildSyntheticReviewOpinionLifecycleScenario } from "./opinion-lifecycle-synthetic.mjs";

function context(scenario, lifecycle, correctionSources = []) {
  return {
    lifecycle,
    correction_sources: correctionSources,
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    recalculation: scenario.consistent
  };
}

export function buildSyntheticReviewWorkspaceScenario() {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  const activeLifecycle = createIndependentReviewOpinionLifecycle({
    opinion: scenario.consistentOpinion,
    events: []
  });
  const activeContext = context(scenario, activeLifecycle);
  const workspace = createIndependentReviewWorkspace({
    workspace_id: "review-workspace-ct621-synthetic",
    version: "1.0.0",
    created_by: "workspace-operator-ct621",
    generated_at: "2026-10-23T12:20:00.000Z",
    reviewer_organization: {
      organization_id: "reviewer-org-synthetic",
      display_name: "Synthetic Independent Review Lab"
    },
    ...activeContext
  });
  const verifiedWorkspace = verifyIndependentReviewWorkspace({
    workspace,
    ...activeContext
  });
  const scopeMark = createIndependentReviewScopeMark({
    mark_id: "scope-mark-ct621-synthetic",
    version: "1.0.0",
    created_by: "opinion-signer-ct617",
    issued_at: "2026-10-23T12:21:00.000Z",
    workspace,
    ...activeContext
  });
  const verifiedScopeMark = verifyIndependentReviewScopeMark({
    scope_mark: scopeMark,
    workspace,
    ...activeContext
  });
  const exportPackage = createIndependentReviewWorkspaceExport({
    export_id: "review-export-ct621-synthetic",
    version: "1.0.0",
    created_by: "workspace-operator-ct621",
    created_at: "2026-10-23T12:22:00.000Z",
    workspace,
    scope_mark: scopeMark
  });
  const exportVerification = verifyIndependentReviewWorkspaceExport({
    files: exportPackage.files
  });

  const withdrawnContext = context(scenario, scenario.lifecycle, [{
    event_id: scenario.correctionEvent.event_id,
    recalculation: scenario.deviation
  }]);
  const withdrawnWorkspace = createIndependentReviewWorkspace({
    workspace_id: "review-workspace-ct621-withdrawn",
    version: "1.0.0",
    created_by: "workspace-operator-ct621",
    generated_at: "2026-10-23T12:20:00.000Z",
    reviewer_organization: {
      organization_id: "reviewer-org-synthetic",
      display_name: "Synthetic Independent Review Lab"
    },
    ...withdrawnContext
  });
  let withdrawnMarkBlocked = false;
  try {
    createIndependentReviewScopeMark({
      mark_id: "scope-mark-ct621-withdrawn",
      version: "1.0.0",
      created_by: "opinion-signer-ct617",
      issued_at: "2026-10-23T12:21:00.000Z",
      workspace: withdrawnWorkspace,
      ...withdrawnContext
    });
  } catch (error) {
    withdrawnMarkBlocked = error?.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.markIneligible;
  }

  return {
    ...scenario,
    activeLifecycle,
    activeContext,
    workspace,
    verifiedWorkspace,
    scopeMark,
    verifiedScopeMark,
    exportPackage,
    exportVerification,
    withdrawnContext,
    withdrawnWorkspace,
    withdrawnMarkBlocked
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  console.log(JSON.stringify({
    schema_version: scenario.workspace.schema_version,
    data_origin: "synthetic",
    workspace_read_model_only: scenario.workspace.boundary.read_model_only,
    workflow_step_count: scenario.workspace.workflow_steps.length,
    active_scope_mark_eligible: scenario.workspace.scope_mark_eligibility.eligible,
    institution_visible: scenario.scopeMark.display.institution === "Synthetic Independent Review Lab",
    opinion_date_visible: scenario.scopeMark.display.date === "2026-10-23",
    scope_visible: scenario.scopeMark.display.scope.includes("statistical-recalculation"),
    limitation_visible: scenario.scopeMark.display.limitation.includes("Not certification"),
    withdrawn_scope_mark_blocked: scenario.withdrawnMarkBlocked,
    withdrawn_state_visible: scenario.withdrawnWorkspace.scope_mark_eligibility.state === "withdrawn",
    export_file_count: scenario.exportPackage.files.length,
    export_checksums_verified: scenario.exportVerification.checksums_verified,
    exact_scope_binding_verified: scenario.exportVerification.exact_scope_binding_verified,
    raw_samples_included: scenario.exportVerification.raw_samples_included,
    customer_identifiers_included: scenario.exportVerification.customer_identifiers_included,
    source_records_embedded: scenario.exportVerification.source_records_embedded,
    offline_source_reverification: scenario.exportVerification.offline_source_reverification,
    trusted_signature_attached: scenario.exportVerification.trusted_signature_attached,
    performance_claim_allowed: scenario.exportVerification.performance_claim_allowed,
    certification_issued: scenario.exportVerification.certification_issued,
    external_network_used: scenario.exportVerification.external_network_used
  }));
}
