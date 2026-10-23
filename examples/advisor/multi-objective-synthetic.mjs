import { readFile } from "node:fs/promises";
import {
  buildInfrastructureCombination,
  parseInfrastructureCombinationCsv,
} from "../../packages/advisor/combination-builder.mjs";
import { evaluateAdvisorDataGate } from "../../packages/advisor/data-gate-constraints.mjs";
import { evaluateMultiObjectiveAnalysis } from "../../packages/advisor/multi-objective-analysis.mjs";
import { computeRequirementPassportDigest } from "../../packages/advisor/requirement-passport.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));
const createdAt = "2026-10-23T12:00:00.000Z";

const [input, method, registry, passports, ruleset, catalog, first, csv] = await Promise.all([
  fixture("multi-objective-fixed-input-v1.json"),
  fixture("multi-objective-method-v1.json"),
  fixture("requirement-field-registry-v2.json"),
  fixture("synthetic-requirement-passports-v2.json"),
  fixture("data-readiness-rules-v1.json"),
  fixture("synthetic-resource-catalog-v1.json"),
  fixture("combination-builder-fixed-input-v1.json"),
  readFile(new URL("./combination-import-fixed-v1.csv", import.meta.url), "utf8"),
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
const dataGateResult = evaluateAdvisorDataGate({
  evaluationId: input.data_gate_fixture.evaluation_id,
  passport,
  combinations,
  requirementRegistry: registry,
  ruleset,
  generatedAt: input.data_gate_fixture.generated_at,
});
const result = evaluateMultiObjectiveAnalysis({
  analysisId: input.analysis_id,
  dataGateResult,
  observations: input.observations,
  method,
  generatedAt: input.generated_at,
});

console.log(JSON.stringify({
  schema_version: result.schema_version,
  data_origin: "synthetic",
  method_sha256: result.method.method_sha256,
  constraint_evaluation_sha256: result.constraint_evaluation.content_sha256,
  input_sha256: result.input_sha256,
  observation_set_sha256: result.observation_set_sha256,
  content_sha256: result.content_sha256,
  summary: result.summary,
  scenario_recommendations: Object.fromEntries(result.scenarios.map(({ scenario_id, recommendation }) => [scenario_id, recommendation.primary_candidate_id])),
  pareto_frontier_count: result.pareto.frontier_candidate_ids.length,
  unknowns_imputed: result.boundaries.unknowns_imputed,
  recommendation_read_only: result.boundaries.recommendation_read_only,
  execution_authorized: result.boundaries.execution_authorized,
  performance_claim_allowed: result.boundaries.performance_claim_allowed,
}, null, 2));
