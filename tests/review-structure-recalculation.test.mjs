import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/independent-run-review/recalculation.mjs";
import {
  INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES,
  INDEPENDENT_REVIEW_RECALCULATION_RESULTS,
  INDEPENDENT_REVIEW_RECALCULATION_VERSION,
  createIndependentReviewRecalculation,
  recalculateIndependentReviewStatistics,
  verifyIndependentReviewRecalculation
} from "../packages/independent-run-review/recalculation.mjs";
import { createPassportShareGrant } from "../packages/link-evidence-passport/sharing.mjs";
import { canonicalizeEvidenceValue, digestEvidenceBytes } from "../packages/evidence-integrity/index.mjs";
import { buildSyntheticReviewRecalculationScenario } from "../examples/review/structure-statistical-recalculation-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function context(scenario, overrides = {}) {
  return {
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    ...overrides
  };
}

function createInput(scenario, overrides = {}) {
  return {
    recalculation_id: "review-recalculation-ct618-recreated",
    version: "1.0.0",
    created_by: "review-lead-ct617",
    recalculated_at: "2026-10-23T12:14:00.000Z",
    implementation: structuredClone(scenario.consistent.implementation),
    recalculated_statistics: structuredClone(scenario.consistent.submitted_statistics),
    ...context(scenario),
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

test("builds a fixed structure checklist and exact independent recalculation", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  assert.equal(INDEPENDENT_REVIEW_RECALCULATION_VERSION, "1.0.0");
  assert.deepEqual(INDEPENDENT_REVIEW_RECALCULATION_RESULTS, ["exact", "within-tolerance", "outside-tolerance"]);
  assert.equal(scenario.consistent.structure_checklist.status, "passed");
  assert.deepEqual(
    scenario.consistent.structure_checklist.checks.map(({ check_id: id }) => id),
    [
      "delivery-integrity",
      "engagement-binding",
      "independence-gate",
      "active-review-share",
      "statistics-profile",
      "sample-accounting",
      "result-coverage"
    ]
  );
  assert.equal(scenario.consistent.summary.outcome, "consistent");
  assert.equal(scenario.consistent.summary.sample_count, 20);
  assert.equal(scenario.consistent.summary.statistic_count, 2);
  assert.equal(scenario.consistent.summary.exact_count, 2);
  assert.equal(scenario.consistent.summary.difference_count, 0);
  assert.deepEqual(
    scenario.consistent.statistics.map(({ metric_key: key, sample_recomputed_value: value }) => [key, value]),
    [["ttft_ms:p95", 46], ["ttft_ms:mean", 32]].sort(([left], [right]) => left.localeCompare(right))
  );
  assert.ok(Object.isFrozen(scenario.consistent));
  assert.deepEqual(scenario.verifiedConsistent, scenario.consistent);
});

test("recalculates directly from the checksum-verified sample package", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  const result = recalculateIndependentReviewStatistics({ delivery: scenario.delivery });
  assert.equal(result.statistics_profile.profile_id, "ct-passport-statistics-v1");
  assert.equal(result.sample_count, 20);
  assert.equal(result.statistic_count, 2);
  assert.ok(result.statistics.every(({ data_origin: origin }) => origin === "synthetic"));
  assert.ok(result.statistics.every(({ attempted_samples: attempted }) => attempted === 10));
});

test("explains a non-exact result inside the declared tolerance", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  const record = scenario.withinTolerance;
  assert.equal(record.summary.outcome, "consistent");
  assert.equal(record.summary.within_tolerance_count, 1);
  assert.equal(record.summary.outside_tolerance_count, 0);
  assert.equal(record.differences.length, 1);
  assert.equal(record.differences[0].classification, "within-tolerance");
  assert.equal(record.differences[0].absolute_delta, 1);
  assert.equal(record.differences[0].tolerance_rule_id, "ttft-p95-absolute");
  assert.match(record.differences[0].explanation, /differs by 1 ms.*threshold is 2 ms/i);
});

test("preserves an outside-tolerance deviation as an immutable difference", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  const record = scenario.deviation;
  assert.equal(record.summary.outcome, "deviation");
  assert.equal(record.summary.outside_tolerance_count, 1);
  assert.equal(record.summary.difference_count, 1);
  assert.equal(record.differences[0].classification, "outside-tolerance");
  assert.equal(record.differences[0].absolute_delta, 4);
  assert.match(record.differences[0].explanation, /differs by 4 ms.*threshold is 2 ms/i);
  assert.deepEqual(scenario.verifiedDeviation, record);
});

test("requires an eligible independence gate and an active share for the exact review lead", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  assert.throws(
    () => createIndependentReviewRecalculation(createInput(scenario, {
      recalculation_id: "review-recalculation-ct618-ineligible",
      independence_assessment: scenario.blocked
    })),
    assertCode(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.independenceInvalid)
  );

  const wrongRecipientGrant = createPassportShareGrant({
    share_id: "passport-share-ct618-wrong-recipient",
    version: "1.0.0",
    created_by: "publisher-ct618",
    created_at: "2026-10-23T12:03:00.000Z",
    recipient: { subject_id: "buyer-alpha", organization_id: "buyer-org-alpha" },
    purpose: "Synthetic share that is not bound to the assigned review lead.",
    expires_at: "2026-10-23T12:20:00.000Z",
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  });
  assert.throws(
    () => createIndependentReviewRecalculation(createInput(scenario, {
      recalculation_id: "review-recalculation-ct618-wrong-recipient",
      share_grant: wrongRecipientGrant
    })),
    assertCode(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.shareInvalid)
  );
});

test("fails closed on missing results and recomputes derived summaries", () => {
  const scenario = buildSyntheticReviewRecalculationScenario();
  assert.throws(
    () => createIndependentReviewRecalculation(createInput(scenario, {
      recalculation_id: "review-recalculation-ct618-missing-result",
      recalculated_statistics: scenario.consistent.submitted_statistics.slice(1)
    })),
    assertCode(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.resultCoverageInvalid)
  );

  const dishonest = structuredClone(scenario.consistent);
  dishonest.summary.outcome = "deviation";
  dishonest.summary.outside_tolerance_count = 1;
  const reFingerprinted = refingerprint(dishonest);
  assert.throws(
    () => verifyIndependentReviewRecalculation({ record: reFingerprinted, ...context(scenario) }),
    assertCode(INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES.recordMismatch)
  );
});

test("keeps limited review work distinct from authentication, reexecution, opinion, and certification", () => {
  const { consistent } = buildSyntheticReviewRecalculationScenario();
  assert.equal(consistent.boundary.limited_review_work_recorded, true);
  assert.equal(consistent.boundary.active_share_record_checked, true);
  assert.equal(consistent.boundary.structure_checks_performed, true);
  assert.equal(consistent.boundary.statistics_recalculated, true);
  assert.equal(consistent.boundary.implementation_identity_self_declared, true);
  assert.equal(consistent.boundary.principal_authentication_verified, false);
  assert.equal(consistent.boundary.organization_control_externally_verified, false);
  assert.equal(consistent.boundary.export_authorization_externally_verified, false);
  assert.equal(consistent.boundary.reviewer_independence_certified, false);
  assert.equal(consistent.boundary.supervised_reexecution_performed, false);
  assert.equal(consistent.boundary.opinion_issued, false);
  assert.equal(consistent.boundary.performance_claim_allowed, false);
  assert.equal(consistent.boundary.certification_issued, false);
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-recalculation-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/structure-and-statistical-recalculation-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/structure-and-statistical-recalculation-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/recalculation.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.recalculationRecord.additionalProperties, false);
  assert.equal(schema.$defs.recalculationRecord.properties.record_type.const, "independent_review_recalculation");
  assert.equal(publicApi.sdk_version, "0.24.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-recalculation-v1.schema.json"));
  for (const tool of [
    "packages/independent-run-review/recalculation.mjs",
    "packages/independent-run-review/recalculation.d.ts"
  ]) assert.ok(publicApi.public_tools.includes(tool), tool);
  for (const exported of [
    "INDEPENDENT_REVIEW_RECALCULATION_VERSION",
    "INDEPENDENT_REVIEW_RECALCULATION_RESULTS",
    "INDEPENDENT_REVIEW_RECALCULATION_ERROR_CODES",
    "recalculateIndependentReviewStatistics",
    "createIndependentReviewRecalculation",
    "verifyIndependentReviewRecalculation"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /seven checks.*independent recalculation.*difference/si);
  assert.match(chinese, /七项.*独立统计复算.*差异登记/s);
  assert.match(packageEnglish, /CT-618.*recalculation.*difference/si);
  assert.match(packageChinese, /CT-618.*复算.*差异/s);
  assert.ok(environment.contract_tests.includes("tests/review-structure-recalculation.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-structure-recalculation"));
});

test("runs the CT-618 scenario offline without claiming an opinion or performance result", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/structure-statistical-recalculation-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    exact_engagement_bound: true,
    eligible_independence_gate_bound: true,
    active_share_bound_to_review_lead: true,
    structure_check_count: 7,
    sample_count: 20,
    statistic_count: 2,
    consistent_outcome: "consistent",
    exact_statistic_count: 2,
    within_tolerance_outcome: "consistent",
    within_tolerance_count: 1,
    deviation_outcome: "deviation",
    outside_tolerance_count: 1,
    difference_count: 1,
    principal_authentication_verified: false,
    export_authorization_externally_verified: false,
    supervised_reexecution_performed: false,
    opinion_issued: false,
    performance_claim_allowed: false,
    certification_issued: false,
    external_network_used: false
  });
});
