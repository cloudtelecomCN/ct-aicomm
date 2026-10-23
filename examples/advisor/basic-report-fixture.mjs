import { readFile } from "node:fs/promises";
import { buildInfrastructureCombination, parseInfrastructureCombinationCsv } from "../../packages/advisor/combination-builder.mjs";
import { evaluateAdvisorDataGate } from "../../packages/advisor/data-gate-constraints.mjs";
import { evaluateMultiObjectiveAnalysis } from "../../packages/advisor/multi-objective-analysis.mjs";
import { computeRequirementPassportDigest } from "../../packages/advisor/requirement-passport.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));

export async function createFixedAdvisorAnalysisFixture() {
  const [registry, passports, ruleset, catalog, first, csv, analysisInput, method] = await Promise.all([
    fixture("requirement-field-registry-v2.json"),
    fixture("synthetic-requirement-passports-v2.json"),
    fixture("data-readiness-rules-v1.json"),
    fixture("synthetic-resource-catalog-v1.json"),
    fixture("combination-builder-fixed-input-v1.json"),
    readFile(new URL("./combination-import-fixed-v1.csv", import.meta.url), "utf8"),
    fixture("multi-objective-fixed-input-v1.json"),
    fixture("multi-objective-method-v1.json"),
  ]);
  const createdAt = "2026-10-23T12:00:00.000Z";
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
  passport.fields.find(({ field_id }) => field_id === "cloud.candidates").value = ["Example Compute"];
  passport.fields.find(({ field_id }) => field_id === "region.allowed").value = ["example-east-1"];
  passport.content_sha256 = computeRequirementPassportDigest(passport);
  const dataGateResult = evaluateAdvisorDataGate({
    evaluationId: "advisor_constraint_evaluation_11111111-1111-4111-8111-111111111111",
    passport,
    combinations,
    requirementRegistry: registry,
    ruleset,
    generatedAt: "2026-10-23T12:10:00.000Z",
  });
  const analysis = evaluateMultiObjectiveAnalysis({
    analysisId: analysisInput.analysis_id,
    dataGateResult,
    observations: analysisInput.observations,
    method,
    generatedAt: analysisInput.generated_at,
  });
  return { analysis, dataGateResult, observations: analysisInput.observations };
}

