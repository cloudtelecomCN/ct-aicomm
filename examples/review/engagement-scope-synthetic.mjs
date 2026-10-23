import { pathToFileURL } from "node:url";

import {
  compareIndependentReviewScope,
  createIndependentReviewEngagement,
  verifyIndependentReviewEngagement
} from "../../packages/independent-run-review/index.mjs";
import { buildSyntheticPassportSharingScenario } from "../passport/sharing-buyer-acceptance-synthetic.mjs";

const prohibitedUses = [
  "certification",
  "legal-conclusion",
  "performance-guarantee",
  "production-control-authorization",
  "sla-adjudication"
];

function baseInput(scenario) {
  return {
    version: "1.0.0",
    created_by: "commissioner-ct616",
    commissioning_party: {
      subject_id: "commissioner-ct616",
      organization_id: "buyer-org-alpha"
    },
    intended_reviewer_organization_id: "reviewer-org-synthetic",
    tolerance_policy: {
      mode: "declared-thresholds",
      rules: [
        {
          rule_id: "ttft-p95-absolute",
          metric: "ttft_ms:p95",
          unit: "ms",
          comparison: "absolute-delta",
          threshold: 2
        },
        {
          rule_id: "ttft-mean-relative",
          metric: "ttft_ms:mean",
          unit: "percent",
          comparison: "relative-percent",
          threshold: 5
        }
      ]
    },
    purpose: {
      intended_use: "buyer-due-diligence",
      statement: "Recalculate the declared synthetic Passport statistics for a buyer-scoped evaluation.",
      prohibited_uses: prohibitedUses
    },
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
}

export function buildSyntheticReviewEngagementScenario() {
  const scenario = buildSyntheticPassportSharingScenario();
  const shared = baseInput(scenario);
  const initial = createIndependentReviewEngagement({
    ...shared,
    engagement_id: "review-engagement-ct616-initial",
    created_at: "2026-10-23T11:35:00.000Z",
    review_level: "statistical-recalculation",
    delivery_agreement: {
      due_at: "2026-10-24T11:35:00.000Z",
      delivery_mode: "offline-package",
      deliverable_formats: ["application/json", "text/csv", "text/markdown"],
      language_codes: ["en", "zh-CN"],
      deliverables: ["scope-record", "structure-checklist", "recalculation-report", "difference-register"]
    }
  });
  const verifiedInitial = verifyIndependentReviewEngagement({
    record: initial,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  });
  const successor = createIndependentReviewEngagement({
    ...shared,
    engagement_id: "review-engagement-ct616-supervised",
    created_at: "2026-10-23T11:45:00.000Z",
    review_level: "supervised-reexecution",
    delivery_agreement: {
      due_at: "2026-10-25T11:45:00.000Z",
      delivery_mode: "offline-package",
      deliverable_formats: ["application/json", "text/csv", "text/markdown"],
      language_codes: ["en", "zh-CN"],
      deliverables: [
        "scope-record",
        "structure-checklist",
        "recalculation-report",
        "difference-register",
        "supervised-run-reference",
        "environment-difference-register"
      ]
    },
    previous_engagement: initial,
    scope_change_reason: "The commissioner expanded the agreed level to include a future supervised re-execution."
  });
  const verifiedSuccessor = verifyIndependentReviewEngagement({
    record: successor,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    previous_engagement: initial
  });
  const comparison = compareIndependentReviewScope({ baseline: initial, candidate: successor });
  return {
    ...scenario,
    initial,
    verifiedInitial,
    successor,
    verifiedSuccessor,
    comparison
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewEngagementScenario();
  console.log(JSON.stringify({
    schema_version: scenario.initial.schema_version,
    data_origin: "synthetic",
    initial_review_level: scenario.initial.scope.review_level,
    successor_review_level: scenario.successor.scope.review_level,
    exact_passport_version_bound: scenario.initial.scope.passport_ref.content_fingerprint === scenario.replacement.content_fingerprint,
    exact_delivery_bound: scenario.initial.scope.delivery_ref.content_fingerprint === scenario.delivery.manifest.content_fingerprint,
    tolerance_policy_explicit: scenario.initial.scope.tolerance_policy.rules.length === 2,
    purpose_explicit: scenario.initial.scope.purpose.statement.length > 0,
    delivery_agreement_explicit: scenario.initial.scope.delivery_agreement.deliverables.length === 4,
    scope_change_detected: scenario.comparison.scope_changed,
    new_engagement_created: scenario.initial.engagement_id !== scenario.successor.engagement_id,
    supersession_link_exact: scenario.comparison.new_engagement_satisfied,
    identity_authenticated: scenario.initial.boundary.identity_authenticated,
    reviewer_independence_verified: scenario.initial.boundary.reviewer_independence_verified,
    review_performed: scenario.initial.boundary.review_performed,
    opinion_issued: scenario.initial.boundary.opinion_issued,
    external_network_used: false,
    performance_claim_allowed: scenario.initial.boundary.performance_claim_allowed,
    certification_issued: scenario.initial.boundary.certification_issued
  }));
}
