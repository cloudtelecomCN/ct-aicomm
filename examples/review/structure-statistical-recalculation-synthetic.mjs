import { pathToFileURL } from "node:url";

import { createPassportShareGrant } from "../../packages/link-evidence-passport/sharing.mjs";
import {
  createIndependentReviewRecalculation,
  recalculateIndependentReviewStatistics,
  verifyIndependentReviewRecalculation
} from "../../packages/independent-run-review/recalculation.mjs";
import { buildSyntheticReviewIndependenceScenario } from "./identity-conflict-synthetic.mjs";

const implementation = {
  implementation_id: "ct618-reference-recalculator",
  implementation_version: "1.0.0",
  runtime: "Node.js 22 ESM offline"
};

function context(scenario, shareGrant) {
  return {
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
}

function submittedStatistics(calculation) {
  return calculation.statistics.map(({ statistic_id: statisticId, sample_recomputed_value: value }) => ({
    statistic_id: statisticId,
    recalculated_value: value
  }));
}

function createRecord(scenario, shareGrant, calculation, {
  recalculationId,
  recalculatedAt,
  statistics
}) {
  return createIndependentReviewRecalculation({
    recalculation_id: recalculationId,
    version: "1.0.0",
    created_by: "review-lead-ct617",
    recalculated_at: recalculatedAt,
    implementation,
    recalculated_statistics: statistics,
    ...context(scenario, shareGrant)
  });
}

export function buildSyntheticReviewRecalculationScenario() {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const shareGrant = createPassportShareGrant({
    share_id: "passport-share-ct618-review-lead",
    version: "1.0.0",
    created_by: "publisher-ct618",
    created_at: "2026-10-23T12:02:00.000Z",
    recipient: {
      subject_id: "review-lead-ct617",
      organization_id: "reviewer-org-synthetic"
    },
    purpose: "Authorize the named synthetic review lead to inspect one exact delivery for CT-618 recalculation.",
    expires_at: "2026-10-23T12:20:00.000Z",
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  });
  const calculation = recalculateIndependentReviewStatistics({ delivery: scenario.delivery });
  const exactStatistics = submittedStatistics(calculation);
  const consistent = createRecord(scenario, shareGrant, calculation, {
    recalculationId: "review-recalculation-ct618-consistent",
    recalculatedAt: "2026-10-23T12:10:00.000Z",
    statistics: exactStatistics
  });
  const verifiedConsistent = verifyIndependentReviewRecalculation({
    record: consistent,
    ...context(scenario, shareGrant)
  });

  const withinStatistics = structuredClone(exactStatistics);
  const withinP95 = withinStatistics.find(({ statistic_id: id }) => (
    calculation.statistics.find(({ statistic_id: candidate }) => candidate === id)?.metric_key === "ttft_ms:p95"
  ));
  withinP95.recalculated_value += 1;
  const withinTolerance = createRecord(scenario, shareGrant, calculation, {
    recalculationId: "review-recalculation-ct618-within-tolerance",
    recalculatedAt: "2026-10-23T12:11:00.000Z",
    statistics: withinStatistics
  });

  const deviationStatistics = structuredClone(exactStatistics);
  const deviatingP95 = deviationStatistics.find(({ statistic_id: id }) => (
    calculation.statistics.find(({ statistic_id: candidate }) => candidate === id)?.metric_key === "ttft_ms:p95"
  ));
  deviatingP95.recalculated_value += 4;
  const deviation = createRecord(scenario, shareGrant, calculation, {
    recalculationId: "review-recalculation-ct618-deviation",
    recalculatedAt: "2026-10-23T12:12:00.000Z",
    statistics: deviationStatistics
  });
  const verifiedDeviation = verifyIndependentReviewRecalculation({
    record: deviation,
    ...context(scenario, shareGrant)
  });

  return {
    ...scenario,
    shareGrant,
    calculation,
    consistent,
    verifiedConsistent,
    withinTolerance,
    deviation,
    verifiedDeviation
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewRecalculationScenario();
  console.log(JSON.stringify({
    schema_version: scenario.consistent.schema_version,
    data_origin: "synthetic",
    exact_engagement_bound: scenario.consistent.engagement_ref.content_fingerprint === scenario.initial.content_fingerprint,
    eligible_independence_gate_bound: scenario.consistent.independence_assessment_ref.content_fingerprint === scenario.eligible.content_fingerprint,
    active_share_bound_to_review_lead: scenario.consistent.share_ref.content_fingerprint === scenario.shareGrant.content_fingerprint,
    structure_check_count: scenario.consistent.structure_checklist.checks.length,
    sample_count: scenario.consistent.summary.sample_count,
    statistic_count: scenario.consistent.summary.statistic_count,
    consistent_outcome: scenario.consistent.summary.outcome,
    exact_statistic_count: scenario.consistent.summary.exact_count,
    within_tolerance_outcome: scenario.withinTolerance.summary.outcome,
    within_tolerance_count: scenario.withinTolerance.summary.within_tolerance_count,
    deviation_outcome: scenario.deviation.summary.outcome,
    outside_tolerance_count: scenario.deviation.summary.outside_tolerance_count,
    difference_count: scenario.deviation.summary.difference_count,
    principal_authentication_verified: scenario.consistent.boundary.principal_authentication_verified,
    export_authorization_externally_verified: scenario.consistent.boundary.export_authorization_externally_verified,
    supervised_reexecution_performed: scenario.consistent.boundary.supervised_reexecution_performed,
    opinion_issued: scenario.consistent.boundary.opinion_issued,
    performance_claim_allowed: scenario.consistent.boundary.performance_claim_allowed,
    certification_issued: scenario.consistent.boundary.certification_issued,
    external_network_used: false
  }));
}
