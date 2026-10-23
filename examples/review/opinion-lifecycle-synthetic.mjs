import { pathToFileURL } from "node:url";

import {
  createIndependentReviewOpinion,
  createIndependentReviewOpinionEvent,
  createIndependentReviewOpinionLifecycle,
  projectIndependentReviewOpinion,
  verifyIndependentReviewOpinionLifecycle
} from "../../packages/independent-run-review/opinion.mjs";
import { buildSyntheticReviewRecalculationScenario } from "./structure-statistical-recalculation-synthetic.mjs";
import { buildSyntheticReviewSupervisedReexecutionScenario } from "./supervised-reexecution-synthetic.mjs";

const signer = {
  subject_id: "opinion-signer-ct617",
  organization_id: "reviewer-org-synthetic",
  role: "opinion-signer"
};

function context(scenario, recalculation, reexecution = null) {
  return {
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    recalculation,
    reexecution
  };
}

function createOpinion(scenario, recalculation, { opinionId, issuedAt, reexecution = null } = {}) {
  return createIndependentReviewOpinion({
    opinion_id: opinionId,
    version: "1.0.0",
    created_by: signer.subject_id,
    issued_at: issuedAt,
    ...context(scenario, recalculation, reexecution)
  });
}

function appendEvent(events, input) {
  const event = createIndependentReviewOpinionEvent({ ...input, events });
  events.push(event);
  return event;
}

export function buildSyntheticReviewOpinionLifecycleScenario() {
  const scenario = buildSyntheticReviewRecalculationScenario();
  const consistentOpinion = createOpinion(scenario, scenario.consistent, {
    opinionId: "review-opinion-ct620-consistent",
    issuedAt: "2026-10-23T12:13:00.000Z"
  });
  const deviationOpinion = createOpinion(scenario, scenario.deviation, {
    opinionId: "review-opinion-ct620-deviation",
    issuedAt: "2026-10-23T12:13:30.000Z"
  });

  const supervised = buildSyntheticReviewSupervisedReexecutionScenario();
  const supervisedContext = {
    engagement: supervised.successor,
    previous_engagement: supervised.initial,
    independence_assessment: supervised.independenceAssessment,
    share_grant: supervised.shareGrant,
    share_revocations: [],
    passport_version: supervised.replacement,
    passport_events: [],
    delivery: supervised.delivery,
    recalculation: supervised.historicalRecalculation,
    reexecution: supervised.sameKnownEnvironment
  };
  const uncertainOpinion = createIndependentReviewOpinion({
    opinion_id: "review-opinion-ct620-uncertain",
    version: "1.0.0",
    created_by: signer.subject_id,
    issued_at: "2026-10-23T12:19:00.000Z",
    ...supervisedContext
  });

  const events = [];
  const baseEvent = {
    version: "1.0.0",
    opinion: consistentOpinion,
    ...context(scenario, scenario.consistent)
  };
  appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-appeal-correction",
    event_type: "appeal-filed",
    occurred_at: "2026-10-23T12:14:00.000Z",
    actor: {
      subject_id: "commissioner-ct616",
      organization_id: "buyer-org-alpha",
      role: "evidence-submitter"
    },
    reason: "The submitter requests review of one recalculated statistic.",
    appeal_id: "appeal-ct620-correction",
    requested_remedy: "correct"
  });
  appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-resolve-correction",
    event_type: "appeal-resolved",
    occurred_at: "2026-10-23T12:15:00.000Z",
    actor: signer,
    reason: "The signer confirms that corrected recalculation evidence is required.",
    appeal_id: "appeal-ct620-correction",
    resolution: "correction-required"
  });
  const correctionEvent = appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-correction",
    event_type: "correction-issued",
    occurred_at: "2026-10-23T12:16:00.000Z",
    actor: signer,
    reason: "A new verified recalculation changes the source-bound finding.",
    appeal_id: "appeal-ct620-correction",
    replacement_source: { recalculation: scenario.deviation }
  });
  appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-sales-appeal",
    event_type: "appeal-filed",
    occurred_at: "2026-10-23T12:17:00.000Z",
    actor: {
      subject_id: "sales-observer-ct620",
      organization_id: "buyer-org-alpha",
      role: "sales"
    },
    reason: "Sales forwards a withdrawal request without changing the finding.",
    appeal_id: "appeal-ct620-withdrawal",
    requested_remedy: "withdraw"
  });
  appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-resolve-withdrawal",
    event_type: "appeal-resolved",
    occurred_at: "2026-10-23T12:18:00.000Z",
    actor: signer,
    reason: "The signer determines that withdrawal is required while retaining history.",
    appeal_id: "appeal-ct620-withdrawal",
    resolution: "withdrawal-required"
  });
  appendEvent(events, {
    ...baseEvent,
    event_id: "opinion-event-ct620-withdrawal",
    event_type: "withdrawal-issued",
    occurred_at: "2026-10-23T12:19:00.000Z",
    actor: signer,
    reason: "The corrected opinion is withdrawn without deleting either finding.",
    appeal_id: "appeal-ct620-withdrawal"
  });

  const projection = projectIndependentReviewOpinion({ opinion: consistentOpinion, events });
  const lifecycle = createIndependentReviewOpinionLifecycle({ opinion: consistentOpinion, events });
  const verifiedLifecycle = verifyIndependentReviewOpinionLifecycle({
    lifecycle,
    correction_sources: [{
      event_id: correctionEvent.event_id,
      recalculation: scenario.deviation
    }],
    ...context(scenario, scenario.consistent)
  });
  return {
    ...scenario,
    consistentOpinion,
    deviationOpinion,
    uncertainOpinion,
    events,
    correctionEvent,
    projection,
    lifecycle,
    verifiedLifecycle
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  console.log(JSON.stringify({
    schema_version: scenario.lifecycle.schema_version,
    data_origin: "synthetic",
    consistent_outcome: scenario.consistentOpinion.finding.outcome,
    deviation_outcome: scenario.deviationOpinion.finding.outcome,
    uncertain_outcome: scenario.uncertainOpinion.finding.outcome,
    appeal_count: scenario.projection.appeal_count,
    correction_count: scenario.projection.correction_count,
    lifecycle_status: scenario.projection.status,
    complete_history: scenario.projection.history_complete,
    original_opinion_retained: scenario.projection.original_opinion_retained,
    submitter_modified_finding: false,
    sales_modified_finding: false,
    corrected_finding_outcome: scenario.correctionEvent.replacement.finding.outcome,
    principal_authentication_verified: scenario.consistentOpinion.boundary.principal_authentication_verified,
    reviewer_independence_certified: scenario.consistentOpinion.boundary.reviewer_independence_certified,
    performance_claim_allowed: scenario.consistentOpinion.boundary.performance_claim_allowed,
    certification_issued: scenario.consistentOpinion.boundary.certification_issued,
    external_network_used: false
  }));
}
