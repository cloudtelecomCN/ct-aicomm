import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/independent-run-review/index.mjs";
import {
  INDEPENDENT_REVIEW_ENGAGEMENT_VERSION,
  INDEPENDENT_REVIEW_ERROR_CODES,
  INDEPENDENT_REVIEW_LEVELS,
  INDEPENDENT_REVIEW_TOLERANCE_MODES,
  compareIndependentReviewScope,
  createIndependentReviewEngagement,
  verifyIndependentReviewEngagement
} from "../packages/independent-run-review/index.mjs";
import { buildSyntheticReviewEngagementScenario } from "../examples/review/engagement-scope-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function successorInput(scenario, overrides = {}) {
  return {
    engagement_id: "review-engagement-ct616-test-successor",
    version: "1.0.0",
    created_by: scenario.initial.created_by,
    created_at: "2026-10-23T11:40:00.000Z",
    commissioning_party: scenario.initial.commissioning_party,
    intended_reviewer_organization_id: scenario.initial.intended_reviewer_organization_id,
    review_level: scenario.initial.scope.review_level,
    tolerance_policy: scenario.initial.scope.tolerance_policy,
    purpose: scenario.initial.scope.purpose,
    delivery_agreement: scenario.initial.scope.delivery_agreement,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    previous_engagement: scenario.initial,
    scope_change_reason: "The commissioner requested a deliberately tested scope change.",
    ...overrides
  };
}

test("binds an explicit review scope to one exact Passport version and delivery", () => {
  const scenario = buildSyntheticReviewEngagementScenario();

  assert.equal(INDEPENDENT_REVIEW_ENGAGEMENT_VERSION, "1.0.0");
  assert.deepEqual(INDEPENDENT_REVIEW_LEVELS, ["structure-only", "statistical-recalculation", "supervised-reexecution"]);
  assert.deepEqual(INDEPENDENT_REVIEW_TOLERANCE_MODES, ["exact", "declared-thresholds"]);
  assert.equal(scenario.initial.scope.passport_ref.object_id, scenario.replacement.passport_id);
  assert.equal(scenario.initial.scope.passport_ref.content_fingerprint, scenario.replacement.content_fingerprint);
  assert.equal(scenario.initial.scope.delivery_ref.object_id, scenario.delivery.manifest.delivery_id);
  assert.equal(scenario.initial.scope.delivery_ref.content_fingerprint, scenario.delivery.manifest.content_fingerprint);
  assert.equal(scenario.initial.scope.tolerance_policy.rules.length, 2);
  assert.equal(scenario.initial.scope.purpose.prohibited_uses.length, 5);
  assert.equal(scenario.initial.boundary.engagement_only, true);
  assert.equal(scenario.initial.boundary.review_performed, false);
  assert.equal(scenario.initial.boundary.opinion_issued, false);
  assert.ok(Object.isFrozen(scenario.initial));
});

test("requires a new immutable engagement whenever the agreed scope changes", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  assert.equal(scenario.comparison.scope_changed, true);
  assert.deepEqual(scenario.comparison.changed_fields, ["review_level", "delivery_agreement"]);
  assert.equal(scenario.comparison.new_engagement_required, true);
  assert.equal(scenario.comparison.new_engagement_satisfied, true);
  assert.equal(scenario.successor.supersedes_engagement_ref.object_id, scenario.initial.engagement_id);
  assert.equal(scenario.successor.scope_change_reason.length > 0, true);

  assert.throws(() => createIndependentReviewEngagement(successorInput(scenario, {
    engagement_id: scenario.initial.engagement_id,
    review_level: "supervised-reexecution",
    delivery_agreement: scenario.successor.scope.delivery_agreement
  })), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.newEngagementRequired));
});

test("rejects a successor that does not change the scope", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  assert.throws(
    () => createIndependentReviewEngagement(successorInput(scenario)),
    assertCode(INDEPENDENT_REVIEW_ERROR_CODES.scopeUnchanged)
  );
});

test("rejects tampering, unknown fields, and non-active Passport context", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  const tampered = structuredClone(scenario.initial);
  tampered.scope.purpose.statement = "Tampered without recalculating the engagement fingerprint.";
  assert.throws(() => verifyIndependentReviewEngagement({
    record: tampered,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  }), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.fingerprintMismatch));

  assert.throws(() => createIndependentReviewEngagement({
    ...successorInput(scenario, {
      engagement_id: "review-engagement-ct616-unknown-field",
      review_level: "supervised-reexecution",
      delivery_agreement: scenario.successor.scope.delivery_agreement
    }),
    unreviewed_input: true
  }), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.fieldUnknown));

  assert.throws(() => createIndependentReviewEngagement({
    ...successorInput(scenario, {
      engagement_id: "review-engagement-ct616-expired",
      created_at: scenario.replacement.valid_until,
      review_level: "supervised-reexecution",
      delivery_agreement: {
        ...scenario.successor.scope.delivery_agreement,
        due_at: "2026-10-26T11:45:00.000Z"
      }
    })
  }), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.contextMismatch));
});

test("makes tolerance mode and level-specific delivery outputs unambiguous", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  assert.throws(() => createIndependentReviewEngagement(successorInput(scenario, {
    engagement_id: "review-engagement-ct616-invalid-tolerance",
    review_level: "supervised-reexecution",
    tolerance_policy: {
      mode: "exact",
      rules: scenario.initial.scope.tolerance_policy.rules
    },
    delivery_agreement: scenario.successor.scope.delivery_agreement
  })), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.inputInvalid));

  assert.throws(() => createIndependentReviewEngagement(successorInput(scenario, {
    engagement_id: "review-engagement-ct616-invalid-deliverables",
    review_level: "supervised-reexecution",
    delivery_agreement: scenario.initial.scope.delivery_agreement
  })), assertCode(INDEPENDENT_REVIEW_ERROR_CODES.deliveryAgreementInvalid));
});

test("keeps commissioning separate from identity, independence, review, opinion, and certification", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  const boundary = scenario.initial.boundary;
  assert.equal(boundary.identity_authenticated, false);
  assert.equal(boundary.reviewer_independence_verified, false);
  assert.equal(boundary.evidence_access_authorized, false);
  assert.equal(boundary.review_performed, false);
  assert.equal(boundary.opinion_issued, false);
  assert.equal(boundary.passport_status_mutated, false);
  assert.equal(boundary.performance_claim_allowed, false);
  assert.equal(boundary.sla_adjudicated, false);
  assert.equal(boundary.certification_issued, false);
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-engagement-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/engagement-and-scope-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/engagement-and-scope-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/index.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.reviewEngagement.additionalProperties, false);
  for (const definition of ["party", "toleranceRule", "purpose", "deliveryAgreement", "scope", "boundary"]) {
    assert.equal(schema.$defs[definition].additionalProperties, false, definition);
  }
  assert.equal(publicApi.sdk_version, "0.23.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-engagement-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/index.mjs"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/index.d.ts"));
  for (const exported of [
    "INDEPENDENT_REVIEW_ENGAGEMENT_VERSION",
    "INDEPENDENT_REVIEW_LEVELS",
    "INDEPENDENT_REVIEW_TOLERANCE_MODES",
    "INDEPENDENT_REVIEW_ERROR_CODES",
    "createIndependentReviewEngagement",
    "verifyIndependentReviewEngagement",
    "compareIndependentReviewScope"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /scope change.*new engagement/is);
  assert.match(chinese, /范围变化.*新委托/s);
  assert.match(packageEnglish, /does not establish reviewer independence/is);
  assert.match(packageChinese, /不证明复核方独立性/s);
  assert.ok(environment.contract_tests.includes("tests/review-engagement-scope.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-engagement-scope"));
});

test("runs the CT-616 engagement example offline without making trust claims", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/engagement-scope-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, CT_CONTRIBUTOR_OFFLINE: "1" },
    windowsHide: true
  });
  const result = JSON.parse(stdout);
  assert.equal(result.data_origin, "synthetic");
  assert.equal(result.scope_change_detected, true);
  assert.equal(result.new_engagement_created, true);
  assert.equal(result.supersession_link_exact, true);
  assert.equal(result.identity_authenticated, false);
  assert.equal(result.reviewer_independence_verified, false);
  assert.equal(result.review_performed, false);
  assert.equal(result.opinion_issued, false);
  assert.equal(result.external_network_used, false);
  assert.equal(result.performance_claim_allowed, false);
  assert.equal(result.certification_issued, false);
});

test("returns a deterministic scope comparison projection", () => {
  const scenario = buildSyntheticReviewEngagementScenario();
  assert.deepEqual(
    compareIndependentReviewScope({ baseline: scenario.initial, candidate: scenario.successor }),
    scenario.comparison
  );
});
