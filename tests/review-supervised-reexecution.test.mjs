import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { canonicalizeEvidenceValue, digestEvidenceBytes } from "../packages/evidence-integrity/index.mjs";
import * as sdk from "../packages/independent-run-review/reexecution.mjs";
import {
  INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS,
  INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES,
  INDEPENDENT_REVIEW_REEXECUTION_VERSION,
  compareIndependentReviewRunEnvironment,
  createIndependentReviewSupervisedReexecution,
  verifyIndependentReviewSupervisedReexecution
} from "../packages/independent-run-review/reexecution.mjs";
import { buildSyntheticReviewSupervisedReexecutionScenario } from "../examples/review/supervised-reexecution-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function context(scenario, overrides = {}) {
  return {
    engagement: scenario.successor,
    previous_engagement: scenario.initial,
    independence_assessment: scenario.independenceAssessment,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    historical_recalculation: scenario.historicalRecalculation,
    ...overrides
  };
}

function createInput(scenario, overrides = {}) {
  return {
    reexecution_id: "review-reexecution-ct619-recreated",
    version: "1.0.0",
    created_by: "review-lead-ct617",
    recorded_at: "2026-10-23T12:18:00.000Z",
    new_run: {
      run_id: "review-reexecution-ct619-recreated-run",
      version: "1.0.0",
      tenant_id: scenario.successor.tenant_id,
      started_at: "2026-10-23T12:12:00.000Z",
      completed_at: "2026-10-23T12:16:00.000Z",
      data_origin: "synthetic",
      artifact_manifest_fingerprint: scenario.sameKnownEnvironment.new_run.artifact_manifest_fingerprint,
      environment_snapshot: structuredClone(scenario.sameKnownEnvironment.new_run.environment_snapshot)
    },
    supervision: structuredClone(scenario.sameKnownEnvironment.supervision),
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

test("binds one later supervised run to the exact historical package", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const record = scenario.sameKnownEnvironment;
  assert.equal(INDEPENDENT_REVIEW_REEXECUTION_VERSION, "1.0.0");
  assert.deepEqual(INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS, [
    "sites", "protocol", "workload", "method", "compute", "software", "network"
  ]);
  assert.equal(record.record_type, "independent_review_supervised_reexecution");
  assert.equal(record.delivery_ref.content_fingerprint, scenario.delivery.manifest.content_fingerprint);
  assert.equal(record.historical_run_ref.content_fingerprint, scenario.delivery.manifest.run_ref.content_fingerprint);
  assert.equal(record.historical_recalculation_ref.content_fingerprint, scenario.historicalRecalculation.content_fingerprint);
  assert.equal(record.temporal_relation.classification, "later-execution");
  assert.equal(record.summary.supervision_covers_complete_run, true);
  assert.ok(Object.isFrozen(record));
  assert.deepEqual(scenario.verifiedSameKnownEnvironment, record);
});

test("derives the fixed seven-dimension environment register instead of accepting a claimed classification", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const comparison = compareIndependentReviewRunEnvironment({
    delivery: scenario.delivery,
    current_environment: scenario.sameKnownEnvironment.new_run.environment_snapshot
  });
  assert.equal(comparison.summary.dimension_count, 7);
  assert.equal(comparison.summary.same_count, 4);
  assert.equal(comparison.summary.changed_count, 0);
  assert.equal(comparison.summary.unknown_count, 3);
  assert.deepEqual(comparison.differences.map(({ dimension }) => dimension), INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS);
  assert.ok(comparison.differences.slice(0, 4).every(({ classification }) => classification === "same"));
  assert.ok(comparison.differences.slice(4).every(({ classification }) => classification === "unknown"));
});

test("records protocol drift as changed while preserving unknown historical dimensions", () => {
  const { protocolDrift } = buildSyntheticReviewSupervisedReexecutionScenario();
  const protocol = protocolDrift.environment_difference_register.find(({ dimension }) => dimension === "protocol");
  assert.equal(protocol.classification, "changed");
  assert.equal(protocolDrift.summary.changed_count, 1);
  assert.equal(protocolDrift.summary.same_count, 3);
  assert.equal(protocolDrift.summary.unknown_count, 3);
  assert.equal(protocolDrift.summary.historical_state_reproduced, false);
});

test("fails closed when an environment dimension is absent or an unknown basis carries a fingerprint", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const missing = createInput(scenario);
  missing.new_run.environment_snapshot.dimensions.pop();
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(missing),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid)
  );

  const contradictory = createInput(scenario);
  const compute = contradictory.new_run.environment_snapshot.dimensions.find(({ dimension }) => dimension === "compute");
  compute.basis = "unknown";
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(contradictory),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.environmentInvalid)
  );
});

test("rejects a run that is not later than the historical recalculation", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const input = createInput(scenario);
  input.new_run.started_at = "2026-10-23T12:09:00.000Z";
  input.new_run.completed_at = "2026-10-23T12:11:00.000Z";
  input.supervision.started_at = "2026-10-23T12:08:00.000Z";
  input.supervision.completed_at = "2026-10-23T12:12:00.000Z";
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(input),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.timeInvalid)
  );
});

test("requires the assigned review lead to supervise the complete run", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const incomplete = createInput(scenario);
  incomplete.supervision.started_at = "2026-10-23T12:13:00.000Z";
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(incomplete),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid)
  );

  const wrongSupervisor = createInput(scenario);
  wrongSupervisor.supervision.supervisor_subject_id = "opinion-signer-ct617";
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(wrongSupervisor),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.supervisionInvalid)
  );
});

test("requires the supervised-reexecution engagement and its eligible declared-records assessment", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(createInput(scenario, {
      engagement: scenario.initial,
      previous_engagement: undefined
    })),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.engagementLevelInvalid)
  );
  assert.throws(
    () => createIndependentReviewSupervisedReexecution(createInput(scenario, {
      independence_assessment: scenario.blocked
    })),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.independenceInvalid)
  );
});

test("recomputes summaries and rejects a re-fingerprinted historical-reproduction claim", () => {
  const scenario = buildSyntheticReviewSupervisedReexecutionScenario();
  const dishonest = structuredClone(scenario.sameKnownEnvironment);
  dishonest.summary.historical_state_reproduced = true;
  dishonest.summary.same_count = 7;
  const reFingerprinted = refingerprint(dishonest);
  assert.throws(
    () => verifyIndependentReviewSupervisedReexecution({
      record: reFingerprinted,
      ...context(scenario)
    }),
    assertCode(INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES.recordMismatch)
  );
});

test("keeps supervision distinct from attestation, opinion, performance, and certification", () => {
  const { sameKnownEnvironment: record } = buildSyntheticReviewSupervisedReexecutionScenario();
  assert.equal(record.boundary.historical_package_referenced, true);
  assert.equal(record.boundary.later_run_recorded, true);
  assert.equal(record.boundary.supervision_recorded, true);
  assert.equal(record.boundary.environment_differences_recorded, true);
  assert.equal(record.boundary.historical_state_reproduced, false);
  assert.equal(record.boundary.supervision_externally_attested, false);
  assert.equal(record.boundary.principal_authentication_verified, false);
  assert.equal(record.boundary.export_authorization_externally_verified, false);
  assert.equal(record.boundary.reviewer_independence_certified, false);
  assert.equal(record.boundary.opinion_issued, false);
  assert.equal(record.boundary.performance_claim_allowed, false);
  assert.equal(record.boundary.certification_issued, false);
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-supervised-reexecution-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/supervised-reexecution-and-environment-differences-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/supervised-reexecution-and-environment-differences-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/reexecution.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.reexecutionRecord.additionalProperties, false);
  assert.equal(schema.$defs.reexecutionRecord.properties.record_type.const, "independent_review_supervised_reexecution");
  assert.equal(publicApi.sdk_version, "0.26.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-supervised-reexecution-v1.schema.json"));
  for (const tool of [
    "packages/independent-run-review/reexecution.mjs",
    "packages/independent-run-review/reexecution.d.ts"
  ]) assert.ok(publicApi.public_tools.includes(tool), tool);
  for (const exported of [
    "INDEPENDENT_REVIEW_REEXECUTION_VERSION",
    "INDEPENDENT_REVIEW_ENVIRONMENT_DIMENSIONS",
    "INDEPENDENT_REVIEW_REEXECUTION_ERROR_CODES",
    "compareIndependentReviewRunEnvironment",
    "createIndependentReviewSupervisedReexecution",
    "verifyIndependentReviewSupervisedReexecution"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /later execution.*historical state reproduction.*seven/si);
  assert.match(chinese, /后续运行.*历史状态重现.*七个/s);
  assert.match(packageEnglish, /CT-619.*supervised.*environment/si);
  assert.match(packageChinese, /CT-619.*监督.*环境/s);
  assert.ok(environment.contract_tests.includes("tests/review-supervised-reexecution.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-supervised-reexecution"));
});

test("runs the CT-619 scenario offline without claiming historical reproduction or performance", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/supervised-reexecution-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    exact_historical_package_bound: true,
    exact_historical_run_bound: true,
    later_run_bound: true,
    supervision_covers_run: true,
    environment_dimension_count: 7,
    same_count: 4,
    changed_count: 0,
    unknown_count: 3,
    drift_changed_count: 1,
    historical_state_reproduced: false,
    principal_authentication_verified: false,
    export_authorization_externally_verified: false,
    opinion_issued: false,
    performance_claim_allowed: false,
    certification_issued: false,
    external_network_used: false
  });
});
