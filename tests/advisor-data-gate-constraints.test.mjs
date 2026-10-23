import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildInfrastructureCombination,
  computeCombinationContentSha256,
  parseInfrastructureCombinationCsv,
} from "../packages/advisor/combination-builder.mjs";
import {
  evaluateAdvisorDataGate,
  validateAdvisorDataGateResult,
  validateDataReadinessRuleset,
} from "../packages/advisor/data-gate-constraints.mjs";
import { computeRequirementPassportDigest } from "../packages/advisor/requirement-passport.mjs";

const createdAt = "2026-10-23T12:00:00.000Z";
const generatedAt = "2026-10-23T12:10:00.000Z";
const evaluationId = "advisor_constraint_evaluation_11111111-1111-4111-8111-111111111111";

const fixture = async (name) => JSON.parse(await readFile(new URL(`../examples/advisor/${name}`, import.meta.url), "utf8"));

async function inputs() {
  const [registry, passports, ruleset, catalog, first, csv] = await Promise.all([
    fixture("requirement-field-registry-v2.json"),
    fixture("synthetic-requirement-passports-v2.json"),
    fixture("data-readiness-rules-v1.json"),
    fixture("synthetic-resource-catalog-v1.json"),
    fixture("combination-builder-fixed-input-v1.json"),
    readFile(new URL("../examples/advisor/combination-import-fixed-v1.csv", import.meta.url), "utf8"),
  ]);
  const second = parseInfrastructureCombinationCsv(csv)[1];
  const combinations = [
    buildInfrastructureCombination(first, {
      combinationId: "advisor_combination_11111111-1111-4111-8111-111111111111",
      createdAt,
      evaluatedAt: createdAt,
      resources: catalog.resources,
    }),
    buildInfrastructureCombination(second, {
      combinationId: "advisor_combination_22222222-2222-4222-8222-222222222222",
      createdAt,
      evaluatedAt: createdAt,
      sourceMode: "csv_import",
      importRowRef: "csv:3",
      resources: catalog.resources,
    }),
  ];
  const passport = structuredClone(passports.fixtures.find(({ task_template: template }) => template.id === "cloud-region-network-comparison/v1"));
  passport.fields.find(({ field_id: id }) => id === "cloud.candidates").value = ["Example Compute"];
  passport.fields.find(({ field_id: id }) => id === "region.allowed").value = ["example-east-1"];
  passport.content_sha256 = computeRequirementPassportDigest(passport);
  return { registry, passports, ruleset, passport, combinations };
}

function evaluate({ passport, combinations, registry, ruleset }) {
  return evaluateAdvisorDataGate({
    evaluationId,
    passport,
    combinations,
    requirementRegistry: registry,
    ruleset,
    generatedAt,
  });
}

test("evaluates the fixed synthetic candidate set with reproducible fingerprints", async () => {
  const source = await inputs();
  const expected = await fixture("data-gate-fixed-expected-v1.json");
  const result = evaluate(source);
  assert.equal(source.passport.content_sha256, expected.passport_sha256);
  assert.deepEqual(source.combinations.map(({ content_sha256 }) => content_sha256), expected.combination_sha256);
  assert.equal(result.ruleset_sha256, expected.ruleset_sha256);
  assert.equal(result.input_sha256, expected.input_sha256);
  assert.equal(result.content_sha256, expected.content_sha256);
  assert.deepEqual(result.readiness.status, expected.readiness.status);
  assert.deepEqual(result.summary, expected.summary);
  assert.deepEqual(result.boundaries, expected.boundaries);
  assert.equal(result.readiness.analysis_allowed, true);
  assert.deepEqual(result.candidates.map(({ status }) => status), ["eligible", "eligible"]);
  assert.deepEqual(validateAdvisorDataGateResult(result), { valid: true, digest_verified: true, status: "ready_with_gaps" });
});

test("blocks unmapped hard constraints instead of silently ignoring them", async () => {
  const source = await inputs();
  source.passport = source.passports.fixtures.find(({ task_template: template }) => template.id === "ai-inference-infrastructure-selection/v1");
  const result = evaluate(source);
  const missingMappings = result.readiness.issues
    .filter(({ code }) => code === "hard_constraint_mapping_missing")
    .map(({ field_id }) => field_id);
  assert.deepEqual(missingMappings, ["budget.monthly_limit", "performance.ttft_target"]);
  assert.equal(result.readiness.status, "blocked");
  assert.equal(result.readiness.analysis_allowed, false);
  assert.equal(result.boundaries.scoring_performed, false);
  assert.equal(result.boundaries.unknowns_imputed, false);
});

test("retains an excluded candidate and blocks analysis when fewer than two remain eligible", async () => {
  const source = await inputs();
  const excluded = structuredClone(source.combinations[1]);
  excluded.comparison_dimensions.region_code.value = "example-west-9";
  excluded.content_sha256 = computeCombinationContentSha256(excluded);
  source.combinations[1] = excluded;
  const result = evaluate(source);
  assert.equal(result.candidates[0].status, "eligible");
  assert.equal(result.candidates[1].status, "excluded");
  assert.deepEqual(result.candidates[1].exclusion_codes, ["hard_constraint_violated"]);
  assert.equal(result.readiness.status, "blocked");
  assert.equal(result.readiness.issues.some(({ code }) => code === "insufficient_eligible_combinations"), true);
});

test("is deterministic across caller ordering and detects result tampering", async () => {
  const source = await inputs();
  const first = evaluate(source);
  const second = evaluate({ ...source, combinations: [...source.combinations].reverse() });
  assert.deepEqual(second, first);
  second.summary.eligible_count = 1;
  assert.throws(() => validateAdvisorDataGateResult(second), (error) => error.code === "data_gate_result_digest_mismatch");
});

test("publishes strict fail-closed schemas and rules without scoring or execution", async () => {
  const [rulesSchema, resultSchema, ruleset] = await Promise.all([
    fixture("../../specs/advisor/data-readiness-rules-v1.schema.json"),
    fixture("../../specs/advisor/data-gate-result-v1.schema.json"),
    fixture("data-readiness-rules-v1.json"),
  ]);
  const validation = validateDataReadinessRuleset(ruleset);
  assert.equal(validation.valid, true);
  assert.equal(validation.mapping_count, 10);
  assert.equal(rulesSchema.additionalProperties, false);
  assert.equal(rulesSchema.properties.policy.properties.unmapped_hard_field.const, "block");
  assert.equal(resultSchema.additionalProperties, false);
  assert.equal(resultSchema.$defs.boundaries.properties.scoring_performed.const, false);
  assert.equal(resultSchema.$defs.boundaries.properties.ranking_performed.const, false);
  assert.equal(resultSchema.$defs.boundaries.properties.recommendation_issued.const, false);
  assert.equal(resultSchema.$defs.boundaries.properties.execution_authorized.const, false);
});

test("keeps bilingual Data Gate documentation aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/data-gate-constraints-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/data-gate-constraints-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /Data Gate/);
    assert.match(document, /hard constraint|硬约束/);
    assert.match(document, /scor|评分/i);
    assert.match(document, /execution|执行/);
    assert.match(document, /synthetic|合成/);
  }
});
