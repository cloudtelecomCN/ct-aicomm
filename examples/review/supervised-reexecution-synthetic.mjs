import { pathToFileURL } from "node:url";

import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../../packages/evidence-integrity/index.mjs";
import { createPassportShareGrant } from "../../packages/link-evidence-passport/sharing.mjs";
import { createIndependentReviewIndependenceAssessment } from "../../packages/independent-run-review/independence.mjs";
import {
  createIndependentReviewRecalculation,
  recalculateIndependentReviewStatistics
} from "../../packages/independent-run-review/recalculation.mjs";
import {
  compareIndependentReviewRunEnvironment,
  createIndependentReviewSupervisedReexecution,
  verifyIndependentReviewSupervisedReexecution
} from "../../packages/independent-run-review/reexecution.mjs";
import { buildSyntheticReviewIndependenceScenario } from "./identity-conflict-synthetic.mjs";

function fingerprint(value) {
  return digestEvidenceBytes(Buffer.from(canonicalizeEvidenceValue(value), "utf8"));
}

function parseDeliveryFile(delivery, path) {
  return JSON.parse(delivery.files.find(({ path: candidate }) => candidate === path).content);
}

function successorIndependence(scenario) {
  return createIndependentReviewIndependenceAssessment({
    assessment_id: "review-independence-ct619-supervised",
    version: "1.0.0",
    created_by: scenario.eligible.created_by,
    assessed_at: "2026-10-23T12:05:00.000Z",
    engagement: scenario.successor,
    previous_engagement: scenario.initial,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    subjects: scenario.eligible.subjects,
    organizations: scenario.eligible.organizations,
    role_assignments: scenario.eligible.role_assignments,
    payment_disclosure: scenario.eligible.payment_disclosure,
    conflicts: scenario.eligible.conflicts,
    recusals: scenario.eligible.recusals
  });
}

function reviewContext(scenario, independenceAssessment, shareGrant) {
  return {
    engagement: scenario.successor,
    previous_engagement: scenario.initial,
    independence_assessment: independenceAssessment,
    share_grant: shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
}

function environmentSnapshot(delivery, { protocolDrift = false } = {}) {
  const freeze = parseDeliveryFile(delivery, "freeze.json");
  const dimensions = [
    ["sites", freeze.scenario.sites],
    ["protocol", protocolDrift ? { ...freeze.scenario.protocol, version: "fixture-2" } : freeze.scenario.protocol],
    ["workload", freeze.scenario.workload],
    ["method", freeze.method_template]
  ].map(([dimension, value]) => ({ dimension, basis: "observed", fingerprint: fingerprint(value) }));
  dimensions.push(
    { dimension: "compute", basis: "declared", fingerprint: fingerprint({ accelerator: "synthetic-gpu", count: 2 }) },
    { dimension: "software", basis: "observed", fingerprint: fingerprint({ runtime: "synthetic-runtime-1.0.0" }) },
    { dimension: "network", basis: "observed", fingerprint: fingerprint({ path: "synthetic-site-a-to-b" }) }
  );
  return { dimensions };
}

function createReexecution(scenario, independenceAssessment, shareGrant, historicalRecalculation, {
  reexecutionId,
  protocolDrift = false
} = {}) {
  const newRun = {
    run_id: `${reexecutionId}-run`,
    version: "1.0.0",
    tenant_id: scenario.successor.tenant_id,
    started_at: "2026-10-23T12:12:00.000Z",
    completed_at: "2026-10-23T12:16:00.000Z",
    data_origin: "synthetic",
    artifact_manifest_fingerprint: fingerprint({ fixture: reexecutionId, artifact_count: 3 }),
    environment_snapshot: environmentSnapshot(scenario.delivery, { protocolDrift })
  };
  return createIndependentReviewSupervisedReexecution({
    reexecution_id: reexecutionId,
    version: "1.0.0",
    created_by: "review-lead-ct617",
    recorded_at: "2026-10-23T12:18:00.000Z",
    ...reviewContext(scenario, independenceAssessment, shareGrant),
    historical_recalculation: historicalRecalculation,
    new_run: newRun,
    supervision: {
      mode: "live-observation",
      supervisor_subject_id: "review-lead-ct617",
      supervisor_organization_id: "reviewer-org-synthetic",
      started_at: "2026-10-23T12:11:00.000Z",
      completed_at: "2026-10-23T12:17:00.000Z",
      event_count: 6,
      event_log_fingerprint: fingerprint({ fixture: reexecutionId, events: 6 })
    }
  });
}

export function buildSyntheticReviewSupervisedReexecutionScenario() {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const independenceAssessment = successorIndependence(scenario);
  const shareGrant = createPassportShareGrant({
    share_id: "passport-share-ct619-review-lead",
    version: "1.0.0",
    created_by: "publisher-ct619",
    created_at: "2026-10-23T12:07:00.000Z",
    recipient: {
      subject_id: "review-lead-ct617",
      organization_id: "reviewer-org-synthetic"
    },
    purpose: "Authorize the named synthetic review lead to recalculate and supervise one later CT-619 execution.",
    expires_at: "2026-10-23T12:21:00.000Z",
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  });
  const calculation = recalculateIndependentReviewStatistics({ delivery: scenario.delivery });
  const historicalRecalculation = createIndependentReviewRecalculation({
    recalculation_id: "review-recalculation-ct619-historical",
    version: "1.0.0",
    created_by: "review-lead-ct617",
    recalculated_at: "2026-10-23T12:10:00.000Z",
    implementation: {
      implementation_id: "ct619-reference-recalculator",
      implementation_version: "1.0.0",
      runtime: "Node.js 22 ESM offline"
    },
    recalculated_statistics: calculation.statistics.map(({ statistic_id, sample_recomputed_value }) => ({
      statistic_id,
      recalculated_value: sample_recomputed_value
    })),
    ...reviewContext(scenario, independenceAssessment, shareGrant)
  });
  const sameKnownEnvironment = createReexecution(
    scenario,
    independenceAssessment,
    shareGrant,
    historicalRecalculation,
    { reexecutionId: "review-reexecution-ct619-same-known" }
  );
  const verifiedSameKnownEnvironment = verifyIndependentReviewSupervisedReexecution({
    record: sameKnownEnvironment,
    historical_recalculation: historicalRecalculation,
    ...reviewContext(scenario, independenceAssessment, shareGrant)
  });
  const protocolDrift = createReexecution(
    scenario,
    independenceAssessment,
    shareGrant,
    historicalRecalculation,
    { reexecutionId: "review-reexecution-ct619-protocol-drift", protocolDrift: true }
  );
  const environmentComparison = compareIndependentReviewRunEnvironment({
    delivery: scenario.delivery,
    current_environment: sameKnownEnvironment.new_run.environment_snapshot
  });
  return {
    ...scenario,
    independenceAssessment,
    shareGrant,
    historicalRecalculation,
    sameKnownEnvironment,
    verifiedSameKnownEnvironment,
    protocolDrift,
    environmentComparison
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  console.log(JSON.stringify({
    schema_version: scenario.sameKnownEnvironment.schema_version,
    data_origin: "synthetic",
    exact_historical_package_bound: scenario.sameKnownEnvironment.delivery_ref.content_fingerprint === scenario.delivery.manifest.content_fingerprint,
    exact_historical_run_bound: scenario.sameKnownEnvironment.historical_run_ref.content_fingerprint === scenario.delivery.manifest.run_ref.content_fingerprint,
    later_run_bound: scenario.sameKnownEnvironment.temporal_relation.classification === "later-execution",
    supervision_covers_run: scenario.sameKnownEnvironment.summary.supervision_covers_complete_run,
    environment_dimension_count: scenario.sameKnownEnvironment.summary.dimension_count,
    same_count: scenario.sameKnownEnvironment.summary.same_count,
    changed_count: scenario.sameKnownEnvironment.summary.changed_count,
    unknown_count: scenario.sameKnownEnvironment.summary.unknown_count,
    drift_changed_count: scenario.protocolDrift.summary.changed_count,
    historical_state_reproduced: scenario.sameKnownEnvironment.summary.historical_state_reproduced,
    principal_authentication_verified: scenario.sameKnownEnvironment.boundary.principal_authentication_verified,
    export_authorization_externally_verified: scenario.sameKnownEnvironment.boundary.export_authorization_externally_verified,
    opinion_issued: scenario.sameKnownEnvironment.boundary.opinion_issued,
    performance_claim_allowed: scenario.sameKnownEnvironment.boundary.performance_claim_allowed,
    certification_issued: scenario.sameKnownEnvironment.boundary.certification_issued,
    external_network_used: false
  }));
}
