import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/link-evidence-passport/comparison.mjs";
import {
  PASSPORT_COMPARISON_BLOCKER_CODES,
  PASSPORT_COMPARISON_ERROR_CODES,
  PASSPORT_COMPARISON_RULE_ID,
  PASSPORT_COMPARISON_VERSION,
  createPassportComparison,
  verifyPassportComparison
} from "../packages/link-evidence-passport/comparison.mjs";
import { buildSyntheticPassportComparisonScenario } from "../examples/passport/comparability-gate-synthetic.mjs";

const execute = promisify(execFile);
const hash = (value) => `sha256:${value.repeat(64)}`;
const assertCode = (code) => (error) => error?.code === code;

test("builds an immutable unranked comparison view for exact-group passport versions", () => {
  const scenario = buildSyntheticPassportComparisonScenario();
  const record = scenario.comparison;
  const comparable = record.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-comparable");

  assert.equal(record.schema_version, PASSPORT_COMPARISON_VERSION);
  assert.equal(record.group_rule.rule_id, PASSPORT_COMPARISON_RULE_ID);
  assert.deepEqual(record.group_rule.comparison_dimensions, ["scenario.sites", "scenario.protocol"]);
  assert.equal(record.baseline.ranking_eligible, true);
  assert.equal(comparable.same_group, true);
  assert.equal(comparable.ranking_eligible, true);
  assert.equal(comparable.view_mode, "side-by-side-unranked");
  assert.ok(comparable.differences.some(({ path, classification }) => path.startsWith("/scenario/sites") && classification === "comparison_dimension"));
  assert.ok(comparable.differences.some(({ path, classification }) => path.startsWith("/scenario/protocol") && classification === "comparison_dimension"));
  assert.ok(!comparable.differences.some(({ classification }) => classification === "ranking_blocker"));
  assert.equal(record.view.default_ranking_applied, false);
  assert.equal(record.view.side_by_side_refs.length, 2);
  assert.equal(record.view.ranking_eligible_refs.length, 2);
  assert.equal(record.view.metric_rows.length, 1);
  assert.equal(record.view.metric_rows[0].values.length, 2);
  assert.equal(record.boundary.explicit_ranking_policy_required, true);
  assert.equal(record.boundary.performance_claim_allowed, false);
  assert.equal(record.boundary.independent_review_claimed, false);
  assert.ok(Object.isFrozen(record));
  assert.equal(
    verifyPassportComparison({
      record,
      baseline: scenario.baseline,
      candidates: [scenario.methodDrift, scenario.comparable, scenario.workloadDrift]
    }).content_fingerprint,
    record.content_fingerprint
  );
});

test("keeps workload and method drift out of the side-by-side metric view", () => {
  const { comparison } = buildSyntheticPassportComparisonScenario();
  const workload = comparison.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-workload-drift");
  const method = comparison.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-method-drift");

  assert.equal(workload.same_group, false);
  assert.equal(workload.ranking_eligible, false);
  assert.equal(workload.view_mode, "difference-only");
  assert.ok(workload.blocker_codes.includes("workload_mismatch"));
  assert.ok(workload.differences.some(({ path, classification }) => path.startsWith("/scenario/workload/") && classification === "ranking_blocker"));

  assert.equal(method.same_group, false);
  assert.equal(method.ranking_eligible, false);
  assert.equal(method.view_mode, "difference-only");
  assert.ok(method.blocker_codes.includes("method_mismatch"));
  assert.ok(method.differences.some(({ path, classification }) => path.startsWith("/method_template/") && classification === "ranking_blocker"));

  const excludedIds = comparison.view.difference_only_refs.map(({ object_id: id }) => id);
  assert.deepEqual(excludedIds, ["passport-ct613-method-drift", "passport-ct613-workload-drift"]);
  const metricIds = comparison.view.metric_rows.flatMap(({ values }) => values.map(({ passport_ref: ref }) => ref.object_id));
  assert.ok(!metricIds.includes("passport-ct613-method-drift"));
  assert.ok(!metricIds.includes("passport-ct613-workload-drift"));
});

test("fails ranking eligibility closed when the evaluation instant is expired", () => {
  const scenario = buildSyntheticPassportComparisonScenario();
  const expired = createPassportComparison({
    comparison_id: "passport-comparison-ct613-expired",
    version: "1.0.0",
    tenant_id: scenario.baseline.version.tenant_id,
    created_by: "principal-synthetic-analyst",
    created_at: "2026-10-23T13:00:00.000Z",
    baseline: scenario.baseline,
    candidates: [scenario.comparable]
  });
  assert.equal(expired.baseline.ranking_eligible, false);
  assert.ok(expired.baseline.blocker_codes.includes("baseline_inactive"));
  assert.equal(expired.candidates[0].same_group, true);
  assert.equal(expired.candidates[0].ranking_eligible, false);
  assert.ok(expired.candidates[0].blocker_codes.includes("candidate_inactive"));
  assert.deepEqual(expired.view.ranking_eligible_refs, []);
  assert.equal(expired.view.default_ranking_applied, false);
});

test("rejects duplicate candidates, fingerprint tampering, and mismatched contexts", () => {
  const scenario = buildSyntheticPassportComparisonScenario();
  assert.throws(() => createPassportComparison({
    comparison_id: "passport-comparison-ct613-duplicate",
    version: "1.0.0",
    tenant_id: scenario.baseline.version.tenant_id,
    created_by: "principal-synthetic-analyst",
    created_at: "2026-10-23T10:55:20.000Z",
    baseline: scenario.baseline,
    candidates: [scenario.comparable, scenario.comparable]
  }), assertCode(PASSPORT_COMPARISON_ERROR_CODES.duplicateCandidate));

  const tampered = structuredClone(scenario.comparison);
  tampered.content_fingerprint = hash("f");
  assert.throws(() => verifyPassportComparison({
    record: tampered,
    baseline: scenario.baseline,
    candidates: [scenario.comparable, scenario.workloadDrift, scenario.methodDrift]
  }), assertCode(PASSPORT_COMPARISON_ERROR_CODES.fingerprintMismatch));

  assert.throws(() => verifyPassportComparison({
    record: scenario.comparison,
    baseline: scenario.comparable,
    candidates: [scenario.baseline, scenario.workloadDrift, scenario.methodDrift]
  }), assertCode(PASSPORT_COMPARISON_ERROR_CODES.recordMismatch));
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/passport-comparison-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/comparability-gate-and-version-diff-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/comparability-gate-and-version-diff-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/comparison.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.record_type.const, "passport_comparison");
  assert.equal(publicApi.sdk_version, "0.26.0");
  assert.ok(publicApi.public_contracts.includes("specs/passport/passport-comparison-v1.schema.json"));
  for (const exported of [
    "PASSPORT_COMPARISON_VERSION",
    "PASSPORT_COMPARISON_RULE_ID",
    "PASSPORT_COMPARISON_BLOCKER_CODES",
    "PASSPORT_COMPARISON_ERROR_CODES",
    "createPassportComparison",
    "verifyPassportComparison"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.deepEqual(PASSPORT_COMPARISON_BLOCKER_CODES.slice(0, 6), [
    "authorization_scope_mismatch",
    "direction_mismatch",
    "workload_mismatch",
    "method_mismatch",
    "data_origin_mismatch",
    "observation_shape_mismatch"
  ]);
  assert.match(english, /different method or workload\s+never enters\s+the default\s+side-by-side.*ranking/is);
  assert.match(chinese, /不同方法或工作负载.*不得进入.*默认并排.*排名/s);
  assert.ok(environment.contract_tests.includes("tests/passport-comparability-gate.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-comparability-gate"));
});

test("runs the CT-613 comparison example offline without making a performance claim", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/comparability-gate-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    same_group_candidate: true,
    same_group_side_by_side: true,
    same_group_ranking_eligible: true,
    workload_drift_excluded: true,
    workload_drift_blocked: true,
    workload_drift_in_metric_rows: false,
    method_drift_excluded: true,
    method_drift_blocked: true,
    method_drift_in_metric_rows: false,
    default_ranking_applied: false,
    explicit_ranking_policy_required: true,
    comparison_record_immutable: true,
    external_network_used: false,
    performance_claim_allowed: false,
    independent_review_claimed: false,
    certification_issued: false
  });
});
