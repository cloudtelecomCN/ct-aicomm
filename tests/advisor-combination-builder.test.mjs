import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCombinationComparison,
  buildInfrastructureCombination,
  findCombinationDuplicates,
  normalizeInfrastructureCombinationInput,
  parseInfrastructureCombinationCsv,
  parseInfrastructureCombinationImport,
  validateInfrastructureCombinationDocument,
} from "../packages/advisor/combination-builder.mjs";

const createdAt = "2026-10-23T12:00:00.000Z";
const generatedAt = "2026-10-23T12:05:00.000Z";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../examples/advisor/${name}`, import.meta.url), "utf8"));
}

async function catalogResources() {
  return (await fixture("synthetic-resource-catalog-v1.json")).resources;
}

function build(input, resources, id = "advisor_combination_11111111-1111-4111-8111-111111111111", options = {}) {
  return buildInfrastructureCombination(input, { combinationId: id, createdAt, resources, ...options });
}

test("builds the frozen synthetic combination with reproducible fingerprints", async () => {
  const input = await fixture("combination-builder-fixed-input-v1.json");
  const expected = await fixture("combination-builder-fixed-expected-v1.json");
  const document = build(input, await catalogResources());
  assert.equal(document.status, expected.status);
  assert.equal(document.conflicts.length, expected.conflict_count);
  assert.equal(document.resolved_resources.length, expected.resolved_resource_count);
  assert.equal(document.input_sha256, expected.input_sha256);
  assert.equal(document.combination_signature_sha256, expected.combination_signature_sha256);
  assert.equal(document.content_sha256, expected.content_sha256);
  assert.deepEqual(document.boundaries, expected.boundaries);
  assert.equal(document.comparison_dimensions.gpu_model.value, "Accelerator Alpha");
  assert.equal(document.comparison_dimensions.network_latency_ms.value, 38);
  assert.deepEqual(validateInfrastructureCombinationDocument(document), { valid: true, digest_verified: true, status: "comparable" });
});

test("imports strict CSV and JSON batches without losing quoted fields", async () => {
  const csv = await readFile(new URL("../examples/advisor/combination-import-fixed-v1.csv", import.meta.url), "utf8");
  const csvInputs = parseInfrastructureCombinationCsv(csv);
  assert.equal(csvInputs.length, 2);
  assert.equal(csvInputs[0].display_name, "Synthetic Alpha, East BF16");
  assert.equal(csvInputs[1].configuration.precision, "FP16");

  const jsonImport = parseInfrastructureCombinationImport({
    schema_version: "1.0.0",
    format: "json",
    payload: { schema_version: "1.0.0", combinations: csvInputs },
  });
  assert.equal(jsonImport.combinations.length, 2);
  assert.match(jsonImport.import_sha256, /^sha256:[0-9a-f]{64}$/);
  const csvImport = parseInfrastructureCombinationImport({ schema_version: "1.0.0", format: "csv", payload: csv });
  assert.deepEqual(csvImport.combinations, csvInputs);
  assert.notEqual(csvImport.import_sha256, jsonImport.import_sha256);
});

test("detects missing, expired, incompatible precision, and cross-resource conflicts", async () => {
  const input = await fixture("combination-builder-fixed-input-v1.json");
  input.configuration.precision = "INT8";
  const resources = structuredClone(await catalogResources());
  const region = resources.find(({ resource_type: type }) => type === "region");
  region.source_snapshot.expires_at = "2026-10-22T00:00:00.000Z";
  const cloud = resources.find(({ resource_type: type }) => type === "cloud_instance");
  cloud.facts.find(({ field_id: id }) => id === "cloud.gpu_resource_ref").value = "advisor_resource_99999999-9999-4999-8999-999999999999";
  input.resource_refs.network_path = "advisor_resource_88888888-8888-4888-8888-888888888888";
  const document = build(input, resources);
  assert.equal(document.status, "blocked");
  const codes = new Set(document.conflicts.map(({ code }) => code));
  assert.equal(codes.has("resource_not_found"), true);
  assert.equal(codes.has("resource_expired"), true);
  assert.equal(codes.has("precision_not_supported"), true);
  assert.equal(codes.has("cloud_gpu_reference_conflict"), true);
  assert.equal(document.boundaries.constraint_evaluation_performed, false);
});

test("produces a stable cross-dimension matrix without scoring or ranking", async () => {
  const csv = await readFile(new URL("../examples/advisor/combination-import-fixed-v1.csv", import.meta.url), "utf8");
  const [, second] = parseInfrastructureCombinationCsv(csv);
  const first = await fixture("combination-builder-fixed-input-v1.json");
  const resources = await catalogResources();
  const documents = [
    build(first, resources),
    build(second, resources, "advisor_combination_22222222-2222-4222-8222-222222222222", { sourceMode: "csv_import", importRowRef: "csv:3" }),
  ];
  const expected = await fixture("combination-builder-fixed-expected-v1.json");
  const comparison = buildCombinationComparison(documents, { generatedAt });
  assert.equal(documents[1].content_sha256, expected.comparison.second_combination_content_sha256);
  assert.equal(comparison.comparability.status, expected.comparison.status);
  assert.equal(comparison.comparison_sha256, expected.comparison.comparison_sha256);
  assert.equal(comparison.rows.length, 2);
  assert.equal(comparison.rows[0].dimensions.precision.value, "BF16");
  assert.equal(comparison.rows[1].dimensions.precision.value, "FP16");
  assert.deepEqual(comparison.boundaries, {
    side_by_side_only: true,
    constraints_applied: false,
    scoring_applied: false,
    ranking_applied: false,
    recommendation_issued: false,
    execution_authorized: false,
  });
});

test("reports duplicate keys and duplicate signatures before persistence", async () => {
  const input = await fixture("combination-builder-fixed-input-v1.json");
  const resources = await catalogResources();
  const first = build(input, resources);
  const second = build(input, resources, "advisor_combination_22222222-2222-4222-8222-222222222222");
  assert.deepEqual(findCombinationDuplicates([first, second]).map(({ code }) => code), ["duplicate_combination_key", "duplicate_combination_signature"]);
  const comparison = buildCombinationComparison([first, second], { generatedAt });
  assert.equal(comparison.comparability.status, "blocked");
  assert.equal(comparison.comparability.reason_codes.includes("duplicate_combination_present"), true);
});

test("rejects caller-owned fields, malformed CSV headers, and tampered documents", async () => {
  const input = await fixture("combination-builder-fixed-input-v1.json");
  input.org_id = "org-secret";
  assert.throws(() => normalizeInfrastructureCombinationInput(input), (error) => error.code === "combination_input_field_unknown");
  assert.throws(() => parseInfrastructureCombinationCsv("combination_key,display_name\na,b\n"), (error) => error.code === "combination_csv_header_invalid");

  const cleanInput = await fixture("combination-builder-fixed-input-v1.json");
  const document = build(cleanInput, await catalogResources());
  document.display_name = "Tampered name";
  assert.throws(() => validateInfrastructureCombinationDocument(document), (error) => error.code === "combination_document_digest_mismatch");
});

test("publishes strict schemas with non-execution boundaries", async () => {
  const inputSchema = await fixture("../../specs/advisor/infrastructure-combination-input-v1.schema.json");
  const documentSchema = await fixture("../../specs/advisor/infrastructure-combination-v1.schema.json");
  const comparisonSchema = await fixture("../../specs/advisor/combination-comparison-v1.schema.json");
  assert.equal(inputSchema.additionalProperties, false);
  assert.equal(inputSchema.properties.org_id, undefined);
  assert.equal(inputSchema.properties.project_id, undefined);
  assert.equal(documentSchema.properties.boundaries.properties.execution_authorized.const, false);
  assert.equal(documentSchema.properties.boundaries.properties.constraint_evaluation_performed.const, false);
  assert.equal(documentSchema.properties.boundaries.properties.ranking_performed.const, false);
  assert.equal(comparisonSchema.properties.boundaries.properties.scoring_applied.const, false);
  assert.equal(comparisonSchema.properties.boundaries.properties.recommendation_issued.const, false);
});
