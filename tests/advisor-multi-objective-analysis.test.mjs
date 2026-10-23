import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildInfrastructureCombination,
  parseInfrastructureCombinationCsv,
} from "../packages/advisor/combination-builder.mjs";
import { evaluateAdvisorDataGate } from "../packages/advisor/data-gate-constraints.mjs";
import {
  MULTI_OBJECTIVE_METHOD_V1,
  evaluateMultiObjectiveAnalysis,
  validateMultiObjectiveAnalysisResult,
  validateMultiObjectiveMethod,
} from "../packages/advisor/multi-objective-analysis.mjs";
import { computeRequirementPassportDigest } from "../packages/advisor/requirement-passport.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`../examples/advisor/${name}`, import.meta.url), "utf8"));
const createdAt = "2026-10-23T12:00:00.000Z";

async function fixedDataGate() {
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
  return evaluateAdvisorDataGate({
    evaluationId: "advisor_constraint_evaluation_11111111-1111-4111-8111-111111111111",
    passport,
    combinations,
    requirementRegistry: registry,
    ruleset,
    generatedAt: "2026-10-23T12:10:00.000Z",
  });
}

async function fixedInput() {
  const [input, method, dataGateResult] = await Promise.all([
    fixture("multi-objective-fixed-input-v1.json"),
    fixture("multi-objective-method-v1.json"),
    fixedDataGate(),
  ]);
  return {
    analysisId: input.analysis_id,
    dataGateResult,
    observations: input.observations,
    method,
    generatedAt: input.generated_at,
  };
}

test("reproduces four public scenarios, Pareto status, and sensitivity ranges", async () => {
  const input = await fixedInput();
  const expected = await fixture("multi-objective-fixed-expected-v1.json");
  const result = evaluateMultiObjectiveAnalysis(input);
  assert.equal(result.method.method_sha256, expected.method_sha256);
  assert.equal(result.constraint_evaluation.content_sha256, expected.constraint_evaluation_sha256);
  assert.equal(result.input_sha256, expected.input_sha256);
  assert.equal(result.observation_set_sha256, expected.observation_set_sha256);
  assert.equal(result.content_sha256, expected.content_sha256);
  assert.deepEqual(result.summary, expected.summary);
  assert.deepEqual(result.pareto.frontier_candidate_ids, [
    "advisor_combination_11111111-1111-4111-8111-111111111111",
    "advisor_combination_22222222-2222-4222-8222-222222222222",
  ]);
  assert.deepEqual(Object.fromEntries(result.scenarios.map(({ scenario_id, recommendation }) => [scenario_id, recommendation.primary_candidate_id])), expected.scenario_recommendations);
  assert.equal(result.decision_support.primary_candidate_id, "advisor_combination_22222222-2222-4222-8222-222222222222");
  assert.equal(result.scenarios.every(({ sensitivity }) => sensitivity.stability_ranges.length === 10), true);
  assert.equal(result.boundaries.unknowns_imputed, false);
  assert.equal(result.boundaries.execution_authorized, false);
  assert.deepEqual(validateMultiObjectiveAnalysisResult(result), { valid: true, digest_verified: true, status: "complete" });
});

test("is deterministic across caller ordering and rejects digest tampering", async () => {
  const input = await fixedInput();
  const first = evaluateMultiObjectiveAnalysis(input);
  const second = evaluateMultiObjectiveAnalysis({ ...input, observations: [...input.observations].reverse() });
  assert.deepEqual(second, first);
  second.summary.complete_candidate_count = 1;
  assert.throws(() => validateMultiObjectiveAnalysisResult(second), (error) => error.code === "analysis_result_digest_mismatch");
});

test("keeps unknown values explicit and withholds a recommendation when fewer than two candidates are complete", async () => {
  const input = await fixedInput();
  const observations = structuredClone(input.observations);
  const unknown = observations[1].metrics.find(({ metric_id }) => metric_id === "monthly_cost");
  unknown.status = "unknown";
  unknown.value = null;
  unknown.source = { kind: "unknown", confidence: "unknown", observed_at: null, reference: null, content_sha256: null };
  const result = evaluateMultiObjectiveAnalysis({ ...input, observations });
  assert.equal(result.summary.status, "partial");
  assert.equal(result.summary.complete_candidate_count, 1);
  assert.equal(result.decision_support.status, "insufficient_data");
  assert.equal(result.decision_support.primary_candidate_id, null);
  assert.deepEqual(result.decision_support.unknowns, [{ combination_id: observations[1].combination_id, metric_ids: ["monthly_cost"] }]);
  assert.equal(result.scenarios.every(({ rankings }) => rankings.length === 0), true);
});

test("requires the verified CT-663 data gate and rejects blocked or altered inputs", async () => {
  const input = await fixedInput();
  const blocked = structuredClone(input.dataGateResult);
  blocked.readiness.status = "blocked";
  blocked.readiness.analysis_allowed = false;
  assert.throws(() => evaluateMultiObjectiveAnalysis({ ...input, dataGateResult: blocked }), (error) => error.code === "data_gate_result_digest_mismatch");

  const wrongUnit = structuredClone(input.observations);
  wrongUnit[0].metrics[0].unit = "usd_per_month";
  assert.throws(() => evaluateMultiObjectiveAnalysis({ ...input, observations: wrongUnit }), (error) => error.code === "analysis_observation_unit_invalid");

  const invented = structuredClone(input.observations);
  invented[0].metrics[0].source.kind = "unknown";
  assert.throws(() => evaluateMultiObjectiveAnalysis({ ...input, observations: invented }), (error) => error.code === "analysis_observation_provenance_invalid");
});

test("freezes scenario weights, method boundaries, and the fixed public method file", async () => {
  const method = await fixture("multi-objective-method-v1.json");
  assert.deepEqual(method, MULTI_OBJECTIVE_METHOD_V1);
  assert.deepEqual(validateMultiObjectiveMethod(method), {
    valid: true,
    metric_count: 10,
    scenario_count: 4,
    method_sha256: "sha256:ae7d912a5ae8e0bc28d34828bc97482d7c61a1a05c63a3e465d37701e5c2b6c9",
  });
  const altered = structuredClone(method);
  altered.scenarios[0].weights[0].weight_basis_points += 1;
  assert.throws(() => validateMultiObjectiveMethod(altered), (error) => error.code === "analysis_weight_total_invalid");
  assert.equal(method.boundaries.paid_capability_required, false);
  assert.equal(method.boundaries.global_optimum_claimed, false);
});

test("publishes strict schemas and aligned bilingual method documentation", async () => {
  const [methodSchema, inputSchema, resultSchema, english, chinese] = await Promise.all([
    fixture("../../specs/advisor/multi-objective-method-v1.schema.json"),
    fixture("../../specs/advisor/multi-objective-analysis-input-v1.schema.json"),
    fixture("../../specs/advisor/multi-objective-analysis-v1.schema.json"),
    readFile(new URL("../docs/advisor/multi-objective-analysis-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/multi-objective-analysis-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  assert.equal(methodSchema.additionalProperties, false);
  assert.equal(inputSchema.additionalProperties, false);
  assert.equal(resultSchema.additionalProperties, false);
  assert.equal(resultSchema.$defs.boundaries.properties.unknowns_imputed.const, false);
  assert.equal(resultSchema.$defs.boundaries.properties.execution_authorized.const, false);
  for (const document of [english, chinese]) {
    assert.match(document, /Pareto/);
    assert.match(document, /sensitivity|敏感性/i);
    assert.match(document, /cost|成本/i);
    assert.match(document, /read-only|只读/i);
    assert.match(document, /execution|执行/i);
  }
});
