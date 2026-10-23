import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SIZING_COST_FORMULAS,
  calculateSizingCost,
  computeSizingCostInputDigest,
  computeSizingCostResultDigest,
  normalizeSizingCostInput,
} from "../packages/advisor/sizing-cost.mjs";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("publishes strict sizing and cost schemas with non-claiming boundaries", async () => {
  const [inputSchema, resultSchema] = await Promise.all([
    readJson("../specs/advisor/sizing-cost-input-v1.schema.json"),
    readJson("../specs/advisor/sizing-cost-result-v1.schema.json"),
  ]);
  assert.equal(inputSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(resultSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(inputSchema.additionalProperties, false);
  assert.equal(resultSchema.additionalProperties, false);
  assert.equal(resultSchema.properties.boundaries.properties.estimate_only.const, true);
  assert.equal(resultSchema.properties.boundaries.properties.performance_claim_allowed.const, false);
  assert.equal(resultSchema.properties.boundaries.properties.missing_values_imputed.const, false);
  assert.ok(Object.keys(SIZING_COST_FORMULAS).length >= 20);
});

test("reproduces the fixed synthetic sizing and cost sample exactly", async () => {
  const [input, expected] = await Promise.all([
    readJson("../examples/advisor/sizing-cost-fixed-input-v1.json"),
    readJson("../examples/advisor/sizing-cost-fixed-expected-v1.json"),
  ]);
  const calculation = await calculateSizingCost(input);
  assert.equal(calculation.result.input_sha256, expected.input_sha256);
  assert.equal(calculation.result.calculation_sha256, expected.calculation_sha256);
  assert.equal(calculation.result.status, expected.status);
  for (const [metricId, expectation] of Object.entries(expected.expected_metrics)) {
    const metric = calculation.result.sizing.metrics[metricId] ?? calculation.result.cost.metrics[metricId];
    assert.ok(metric, `${metricId} must be present`);
    assert.equal(metric.status, "computed");
    assert.deepEqual(metric.value, { min: expectation.min, max: expectation.max });
    assert.equal(metric.unit, expectation.unit);
  }
  assert.equal(calculation.result.boundaries.missing_values_imputed, false);
});

test("propagates missing throughput instead of inventing a GPU recommendation", async () => {
  const input = await readJson("../examples/advisor/sizing-cost-fixed-input-v1.json");
  input.candidate.output_tokens_per_second_per_gpu = {
    status: "unknown",
    value: null,
    unit: "tokens_per_second",
    source_refs: ["synthetic://missing/throughput"],
  };
  const { result } = await calculateSizingCost(input);
  assert.equal(result.status, "partial");
  assert.equal(result.sizing.metrics.memory_gpu_count.status, "computed");
  assert.equal(result.sizing.metrics.throughput_gpu_count.status, "unknown");
  assert.equal(result.sizing.metrics.recommended_gpu_count.status, "unknown");
  assert.equal(result.cost.metrics.monthly_total_cost.status, "unknown");
  assert.ok(result.missing_inputs.includes("candidate.output_tokens_per_second_per_gpu"));
  assert.equal(result.boundaries.missing_values_imputed, false);
});

test("distinguishes explicit not-applicable cost from an unknown cost", async () => {
  const input = await readJson("../examples/advisor/sizing-cost-fixed-input-v1.json");
  const explicit = await calculateSizingCost(input);
  assert.deepEqual(explicit.result.cost.metrics.other_cost_per_month.value, { min: 0, max: 0 });

  input.cost_model.other_cost_per_month = {
    status: "unknown",
    value: null,
    unit: "currency_per_month",
    source_refs: ["synthetic://missing/other-cost"],
  };
  const unknown = await calculateSizingCost(input);
  assert.equal(unknown.result.cost.metrics.other_cost_per_month.status, "unknown");
  assert.equal(unknown.result.cost.metrics.monthly_total_cost.status, "unknown");
  assert.equal(unknown.result.cost.status, "partial");
  assert.ok(unknown.result.missing_inputs.includes("cost_model.other_cost_per_month"));
});

test("keeps input and result fingerprints deterministic and detects changes", async () => {
  const input = await readJson("../examples/advisor/sizing-cost-fixed-input-v1.json");
  const first = await calculateSizingCost(input);
  const second = await calculateSizingCost(structuredClone(input));
  assert.equal(first.result.input_sha256, second.result.input_sha256);
  assert.equal(first.result.calculation_sha256, second.result.calculation_sha256);
  assert.equal(computeSizingCostInputDigest(input), first.result.input_sha256);
  assert.equal(computeSizingCostResultDigest(first.result), first.result.calculation_sha256);

  input.workload.concurrent_requests.value = { min: 65, max: 65 };
  const changed = await calculateSizingCost(input);
  assert.notEqual(changed.result.input_sha256, first.result.input_sha256);
  assert.notEqual(changed.result.calculation_sha256, first.result.calculation_sha256);
});

test("rejects unknown fields, wrong units, and implicit optional zeros", async () => {
  const input = await readJson("../examples/advisor/sizing-cost-fixed-input-v1.json");
  const extra = structuredClone(input);
  extra.candidate.vendor = "example";
  assert.throws(() => normalizeSizingCostInput(extra), (error) => error.code === "candidate_field_unknown");

  const wrongUnit = structuredClone(input);
  wrongUnit.model.parameter_count.unit = "count";
  assert.throws(() => normalizeSizingCostInput(wrongUnit), (error) => error.code === "sizing_cost_unit_invalid");

  const absentOptionalCost = structuredClone(input);
  delete absentOptionalCost.cost_model.other_cost_per_month;
  assert.throws(() => normalizeSizingCostInput(absentOptionalCost), (error) => error.code === "sizing_cost_input_missing");

  const untraceable = structuredClone(input);
  untraceable.workload.request_rate.source_refs = [];
  assert.throws(() => normalizeSizingCostInput(untraceable), (error) => error.code === "sizing_cost_source_refs_invalid");
});

test("keeps bilingual sizing and cost documentation aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/sizing-cost-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/sizing-cost-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /1\.0\.0/);
    assert.match(document, /unknown|未知/);
    assert.match(document, /not_applicable/);
    assert.match(document, /synthetic|合成/);
    assert.match(document, /blended_cost_per_million_tokens/);
    assert.match(document, /performance claim|性能声明/);
  }
});
