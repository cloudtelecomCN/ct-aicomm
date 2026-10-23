import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/independent-run-review/independence.mjs";
import {
  INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS,
  INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES,
  INDEPENDENT_REVIEW_INDEPENDENCE_VERSION,
  INDEPENDENT_REVIEW_ROLES,
  assertIndependentOpinionSignerEligible,
  createIndependentReviewIndependenceAssessment,
  verifyIndependentReviewIndependenceAssessment
} from "../packages/independent-run-review/independence.mjs";
import { canonicalizeEvidenceValue, digestEvidenceBytes } from "../packages/evidence-integrity/index.mjs";
import { buildSyntheticReviewIndependenceScenario } from "../examples/review/identity-conflict-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function context(scenario) {
  return {
    engagement: scenario.initial,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  };
}

function recreateInput(scenario, overrides = {}) {
  const record = scenario.eligible;
  return {
    assessment_id: "review-independence-ct617-recreated",
    version: record.version,
    created_by: record.created_by,
    assessed_at: record.assessed_at,
    ...context(scenario),
    subjects: structuredClone(record.subjects),
    organizations: structuredClone(record.organizations),
    role_assignments: structuredClone(record.role_assignments),
    payment_disclosure: structuredClone(record.payment_disclosure),
    conflicts: structuredClone(record.conflicts),
    recusals: structuredClone(record.recusals),
    ...overrides
  };
}

function refingerprint(record) {
  const copy = structuredClone(record);
  delete copy.content_fingerprint;
  return {
    ...copy,
    content_fingerprint: digestEvidenceBytes(Buffer.from(canonicalizeEvidenceValue(copy), "utf8"))
  };
}

test("binds identity, organization, payment, conflict, and recusal declarations to one engagement", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  assert.equal(INDEPENDENT_REVIEW_INDEPENDENCE_VERSION, "1.0.0");
  assert.deepEqual(INDEPENDENT_REVIEW_ROLES, [
    "commissioner",
    "evidence-submitter",
    "review-lead",
    "independence-assessor",
    "opinion-signer"
  ]);
  assert.equal(scenario.eligible.engagement_ref.content_fingerprint, scenario.initial.content_fingerprint);
  assert.equal(scenario.eligible.gate.status, "eligible-on-declared-records");
  assert.equal(scenario.eligible.gate.eligible_to_sign_independent_opinion, true);
  assert.equal(scenario.eligible.gate.duties_separated, true);
  assert.equal(scenario.eligible.gate.ultimate_control_separated, true);
  assert.equal(scenario.eligible.conflicts[0].resolution, "recused");
  assert.equal(scenario.eligible.recusals[0].replacement_subject_id, "review-lead-ct617");
  assert.ok(Object.isFrozen(scenario.eligible));
  assert.deepEqual(assertIndependentOpinionSignerEligible({ record: scenario.eligible, ...context(scenario) }), scenario.eligible);
});

test("blocks an opinion signer controlled by the same ultimate controller", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  assert.equal(scenario.blocked.gate.status, "ineligible");
  assert.equal(scenario.blocked.gate.ultimate_control_separated, false);
  assert.equal(scenario.blocked.gate.eligible_to_sign_independent_opinion, false);
  assert.deepEqual(scenario.blocked.gate.blocker_codes, [INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.sameUltimateController]);
  assert.throws(
    () => assertIndependentOpinionSignerEligible({ record: scenario.blocked, ...context(scenario) }),
    assertCode(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.opinionIneligible)
  );
});

test("blocks overlapping duties and outcome-contingent payment", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const roles = structuredClone(scenario.eligible.role_assignments);
  roles.find(({ role }) => role === "opinion-signer").subject_id = "review-lead-ct617";
  const assessment = createIndependentReviewIndependenceAssessment(recreateInput(scenario, {
    assessment_id: "review-independence-ct617-duty-payment-blocked",
    role_assignments: roles,
    payment_disclosure: {
      ...scenario.eligible.payment_disclosure,
      outcome_contingent: true
    }
  }));
  assert.equal(assessment.gate.eligible_to_sign_independent_opinion, false);
  assert.ok(assessment.gate.blocker_codes.includes(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.dutyConflict));
  assert.ok(assessment.gate.blocker_codes.includes(INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.outcomeContingentPayment));
});

test("records unresolved and disqualifying conflicts as explicit blockers", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  for (const [resolution, blocker] of [
    ["unresolved", INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.unresolvedConflict],
    ["disqualifying", INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS.disqualifyingConflict]
  ]) {
    const conflict = {
      ...structuredClone(scenario.eligible.conflicts[0]),
      resolution,
      recusal_id: null
    };
    const assessment = createIndependentReviewIndependenceAssessment(recreateInput(scenario, {
      assessment_id: `review-independence-ct617-${resolution}`,
      conflicts: [conflict],
      recusals: []
    }));
    assert.equal(assessment.gate.all_conflicts_resolved, false);
    assert.ok(assessment.gate.blocker_codes.includes(blocker));
  }
});

test("rejects incomplete recusals and engagement-context substitution", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const recusals = structuredClone(scenario.eligible.recusals);
  recusals[0].replacement_subject_id = "opinion-signer-ct617";
  assert.throws(
    () => createIndependentReviewIndependenceAssessment(recreateInput(scenario, {
      assessment_id: "review-independence-ct617-bad-recusal",
      recusals
    })),
    assertCode(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.recusalInvalid)
  );

  const substituted = structuredClone(scenario.eligible);
  substituted.engagement_ref.object_id = scenario.successor.engagement_id;
  assert.throws(
    () => verifyIndependentReviewIndependenceAssessment({ record: substituted, ...context(scenario) }),
    assertCode(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.fingerprintMismatch)
  );
});

test("recomputes the gate instead of trusting a caller-supplied eligibility result", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const dishonest = structuredClone(scenario.blocked);
  dishonest.gate = {
    ...dishonest.gate,
    status: "eligible-on-declared-records",
    blocker_codes: [],
    ultimate_control_separated: true,
    payment_independence_satisfied: true,
    eligible_to_sign_independent_opinion: true
  };
  const refingerprinted = refingerprint(dishonest);
  assert.throws(
    () => verifyIndependentReviewIndependenceAssessment({ record: refingerprinted, ...context(scenario) }),
    assertCode(INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES.gateMismatch)
  );
});

test("keeps the gate distinct from authentication, external verification, review, opinion, and certification", () => {
  const scenario = buildSyntheticReviewIndependenceScenario();
  const boundary = scenario.eligible.boundary;
  assert.equal(boundary.declared_records_only, true);
  assert.equal(boundary.identity_authenticated, false);
  assert.equal(boundary.organization_control_externally_verified, false);
  assert.equal(boundary.reviewer_independence_certified, false);
  assert.equal(boundary.evidence_access_authorized, false);
  assert.equal(boundary.review_performed, false);
  assert.equal(boundary.opinion_issued, false);
  assert.equal(boundary.performance_claim_allowed, false);
  assert.equal(boundary.certification_issued, false);
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-independence-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/identity-organization-and-conflicts-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/identity-organization-and-conflicts-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/independence.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.independenceAssessment.additionalProperties, false);
  for (const definition of ["subject", "organization", "roleAssignment", "paymentDisclosure", "conflict", "recusal", "gate", "boundary"]) {
    assert.equal(schema.$defs[definition].additionalProperties, false, definition);
  }
  assert.equal(publicApi.sdk_version, "0.24.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-independence-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/independence.mjs"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/independence.d.ts"));
  for (const exported of [
    "INDEPENDENT_REVIEW_INDEPENDENCE_VERSION",
    "INDEPENDENT_REVIEW_ROLES",
    "INDEPENDENT_REVIEW_INDEPENDENCE_BLOCKERS",
    "INDEPENDENT_REVIEW_INDEPENDENCE_ERROR_CODES",
    "createIndependentReviewIndependenceAssessment",
    "verifyIndependentReviewIndependenceAssessment",
    "assertIndependentOpinionSignerEligible"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /same ultimate controller.*cannot.*independent opinion/is);
  assert.match(chinese, /同一实际控制人.*不能.*独立意见/s);
  assert.match(packageEnglish, /declared-records-only/is);
  assert.match(packageChinese, /仅基于声明记录/s);
  assert.ok(environment.contract_tests.includes("tests/review-independence-conflicts.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-identity-conflicts"));
});

test("runs the CT-617 example offline without issuing an opinion", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/identity-conflict-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, CT_CONTRIBUTOR_OFFLINE: "1" },
    windowsHide: true
  });
  const result = JSON.parse(stdout);
  assert.equal(result.data_origin, "synthetic");
  assert.equal(result.engagement_bound_exactly, true);
  assert.equal(result.eligible_status, "eligible-on-declared-records");
  assert.equal(result.same_controller_blocked, true);
  assert.equal(result.blocked_signer_eligible, false);
  assert.equal(result.identity_authenticated, false);
  assert.equal(result.organization_control_externally_verified, false);
  assert.equal(result.opinion_issued, false);
  assert.equal(result.external_network_used, false);
  assert.equal(result.performance_claim_allowed, false);
  assert.equal(result.certification_issued, false);
});
