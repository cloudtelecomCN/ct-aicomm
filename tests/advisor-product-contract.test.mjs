import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../specs/advisor/advisor-product-contract-v2.schema.json", import.meta.url);
const exampleUrl = new URL("../examples/advisor/advisor-product-contract-v2.json", import.meta.url);

test("publishes a strict Draft 2020-12 CT-Advisor 2.0 product contract", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, "2.0.0");
  assert.equal(schema.properties.paid_capability.properties.capability_key.const, "gpu_preprocurement_decision_evidence_package");
  assert.equal(schema.properties.free_capabilities.items.properties.access.const, "free");
});

test("keeps competitor-parity analysis and every task template free", async () => {
  const contract = JSON.parse(await readFile(exampleUrl, "utf8"));
  const requiredFree = [
    "resource_catalog",
    "llm_sizing",
    "public_benchmarks",
    "cost_tco_estimation",
    "combination_builder",
    "constraints_and_scenarios",
    "pareto_and_sensitivity",
    "ordinary_recommendations",
    "basic_exports",
    "published_task_templates"
  ];
  assert.equal(contract.schema_version, "2.0.0");
  assert.deepEqual(contract.free_capabilities.map(({ id }) => id), requiredFree);
  assert.ok(contract.free_capabilities.every(({ access }) => access === "free"));
  assert.ok(contract.task_templates.every(({ access }) => access === "free"));
  assert.deepEqual(contract.task_templates.filter(({ package_eligible }) => package_eligible).map(({ id }) => id), ["ai-inference-infrastructure-selection/v1"]);
});

test("exposes one explicit paid package without private commercial fields", async () => {
  const contract = JSON.parse(await readFile(exampleUrl, "utf8"));
  assert.equal(contract.paid_capability.capability_key, "gpu_preprocurement_decision_evidence_package");
  assert.equal(contract.paid_capability.trigger, "explicit_user_request");
  assert.deepEqual(contract.paid_capability.analysis_dimensions, ["gpu", "cloud", "region", "network"]);
  const serialized = JSON.stringify(contract);
  for (const forbidden of ["pricing", "entitlement", "grant_source", "customer_record"]) assert.equal(serialized.includes(forbidden), false);
});

test("keeps Chinese and English public terminology aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/product-contract-v2.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/product-contract-v2.zh-CN.md", import.meta.url), "utf8")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /gpu_preprocurement_decision_evidence_package/);
    assert.match(document, /ai-inference-infrastructure-selection\/v1/);
  }
  assert.match(english, /GPU Decision & Evidence Package/);
  assert.match(chinese, /GPU 决策与证据包/);
});
