import { pathToFileURL } from "node:url";

import {
  assertIndependentOpinionSignerEligible,
  createIndependentReviewIndependenceAssessment,
  verifyIndependentReviewIndependenceAssessment
} from "../../packages/independent-run-review/independence.mjs";
import { buildSyntheticReviewEngagementScenario } from "./engagement-scope-synthetic.mjs";

const subjects = [
  {
    subject_id: "commissioner-ct616",
    organization_id: "buyer-org-alpha",
    identity_basis: "self-declared",
    evidence_refs: []
  },
  {
    subject_id: "review-lead-recused-ct617",
    organization_id: "reviewer-org-synthetic",
    identity_basis: "self-declared",
    evidence_refs: []
  },
  {
    subject_id: "review-lead-ct617",
    organization_id: "reviewer-org-synthetic",
    identity_basis: "self-declared",
    evidence_refs: []
  },
  {
    subject_id: "independence-assessor-ct617",
    organization_id: "reviewer-org-synthetic",
    identity_basis: "self-declared",
    evidence_refs: []
  },
  {
    subject_id: "opinion-signer-ct617",
    organization_id: "reviewer-org-synthetic",
    identity_basis: "self-declared",
    evidence_refs: []
  }
];

const roleAssignments = [
  { role: "commissioner", subject_id: "commissioner-ct616" },
  { role: "evidence-submitter", subject_id: "commissioner-ct616" },
  { role: "review-lead", subject_id: "review-lead-ct617" },
  { role: "independence-assessor", subject_id: "independence-assessor-ct617" },
  { role: "opinion-signer", subject_id: "opinion-signer-ct617" }
];

const conflicts = [
  {
    conflict_id: "conflict-prior-work-ct617",
    category: "prior-work",
    affected_subject_id: "review-lead-recused-ct617",
    affected_role: "review-lead",
    description: "The initially proposed lead previously prepared material included in the delivery.",
    resolution: "recused",
    recusal_id: "recusal-review-lead-ct617"
  }
];

const recusals = [
  {
    recusal_id: "recusal-review-lead-ct617",
    conflict_id: "conflict-prior-work-ct617",
    subject_id: "review-lead-recused-ct617",
    role: "review-lead",
    replacement_subject_id: "review-lead-ct617",
    effective_at: "2026-10-23T11:55:00.000Z",
    reason: "A different lead is assigned before any review work begins."
  }
];

function context(scenario) {
  return {
    engagement: scenario.initial,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
}

function assessmentInput(scenario, overrides = {}) {
  return {
    assessment_id: "review-independence-ct617-eligible",
    version: "1.0.0",
    created_by: "independence-assessor-ct617",
    assessed_at: "2026-10-23T12:00:00.000Z",
    ...context(scenario),
    subjects,
    organizations: [
      {
        organization_id: "buyer-org-alpha",
        ultimate_controller_id: "buyer-holding-alpha",
        control_basis: "self-declared",
        evidence_refs: []
      },
      {
        organization_id: "reviewer-org-synthetic",
        ultimate_controller_id: "reviewer-holding-independent",
        control_basis: "self-declared",
        evidence_refs: []
      }
    ],
    role_assignments: roleAssignments,
    payment_disclosure: {
      payer_organization_id: "buyer-org-alpha",
      payee_organization_id: "reviewer-org-synthetic",
      fee_basis: "fixed-fee",
      outcome_contingent: false
    },
    conflicts,
    recusals,
    ...overrides
  };
}

export function buildSyntheticReviewIndependenceScenario() {
  const scenario = buildSyntheticReviewEngagementScenario();
  const eligible = createIndependentReviewIndependenceAssessment(assessmentInput(scenario));
  const verifiedEligible = verifyIndependentReviewIndependenceAssessment({
    record: eligible,
    ...context(scenario)
  });
  assertIndependentOpinionSignerEligible({ record: eligible, ...context(scenario) });

  const blockedOrganizations = structuredClone(assessmentInput(scenario).organizations);
  blockedOrganizations.find(({ organization_id: id }) => id === "reviewer-org-synthetic").ultimate_controller_id = "buyer-holding-alpha";
  const blocked = createIndependentReviewIndependenceAssessment(assessmentInput(scenario, {
    assessment_id: "review-independence-ct617-common-control",
    organizations: blockedOrganizations
  }));
  const verifiedBlocked = verifyIndependentReviewIndependenceAssessment({
    record: blocked,
    ...context(scenario)
  });
  return {
    ...scenario,
    eligible,
    verifiedEligible,
    blocked,
    verifiedBlocked
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticReviewIndependenceScenario();
  console.log(JSON.stringify({
    schema_version: scenario.eligible.schema_version,
    data_origin: "synthetic",
    engagement_bound_exactly: scenario.eligible.engagement_ref.content_fingerprint === scenario.initial.content_fingerprint,
    eligible_status: scenario.eligible.gate.status,
    duties_separated: scenario.eligible.gate.duties_separated,
    ultimate_control_separated: scenario.eligible.gate.ultimate_control_separated,
    recusal_effective: scenario.eligible.gate.recusals_effective,
    same_controller_blocked: scenario.blocked.gate.blocker_codes.includes("same-ultimate-controller"),
    blocked_signer_eligible: scenario.blocked.gate.eligible_to_sign_independent_opinion,
    identity_authenticated: scenario.eligible.boundary.identity_authenticated,
    organization_control_externally_verified: scenario.eligible.boundary.organization_control_externally_verified,
    opinion_issued: scenario.eligible.boundary.opinion_issued,
    external_network_used: false,
    performance_claim_allowed: scenario.eligible.boundary.performance_claim_allowed,
    certification_issued: scenario.eligible.boundary.certification_issued
  }));
}
