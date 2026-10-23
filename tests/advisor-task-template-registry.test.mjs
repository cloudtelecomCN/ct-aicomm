import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("publishes strict registry and fixture schemas", async () => {
  const [registrySchema, fixtureSchema] = await Promise.all([
    readJson("../specs/advisor/task-template-registry-v1.schema.json"),
    readJson("../specs/advisor/task-template-fixtures-v1.schema.json"),
  ]);
  for (const schema of [registrySchema, fixtureSchema]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
  }
  assert.equal(registrySchema.$defs.taskTemplate.properties.access.const, "free");
  assert.equal(registrySchema.$defs.taskTemplate.properties.execution_mode.const, "decision_support_only");
  assert.equal(fixtureSchema.properties.fixtures.items.properties.performance_claim_allowed.const, false);
  assert.equal(fixtureSchema.properties.fixtures.items.properties.expected.properties.execution_authorized.const, false);
});

test("keeps template identity, SemVer major, maturity, and package eligibility deterministic", async () => {
  const registry = await readJson("../examples/advisor/task-template-registry-v1.json");
  assert.deepEqual(registry.maturity_levels.map(({ id }) => id), ["preview", "beta", "stable"]);
  const ids = new Set();
  const fixtureIds = new Set();
  for (const template of registry.templates) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/v([1-9][0-9]*)$/.exec(template.template_id);
    assert.ok(match);
    assert.equal(match[1], template.template_key);
    assert.equal(Number.parseInt(match[2], 10), Number.parseInt(template.version.split(".")[0], 10));
    assert.equal(template.access, "free");
    assert.equal(template.execution_mode, "decision_support_only");
    assert.equal(template.enabled, true);
    assert.equal(template.state_reason, "published");
    assert.equal(ids.has(template.template_id), false);
    assert.equal(fixtureIds.has(template.fixture_id), false);
    ids.add(template.template_id);
    fixtureIds.add(template.fixture_id);
  }
  assert.deepEqual(registry.templates.filter(({ package_eligible }) => package_eligible).map(({ template_id }) => template_id), ["ai-inference-infrastructure-selection/v1"]);
});

test("binds one synthetic non-executing fixture to every template", async () => {
  const [registry, fixtureBundle] = await Promise.all([
    readJson("../examples/advisor/task-template-registry-v1.json"),
    readJson("../examples/advisor/task-template-fixtures-v1.json"),
  ]);
  assert.equal(fixtureBundle.registry_version, registry.registry_version);
  assert.equal(fixtureBundle.fixtures.length, registry.templates.length);
  const byTemplate = new Map(fixtureBundle.fixtures.map((fixture) => [fixture.template_id, fixture]));
  for (const template of registry.templates) {
    const fixture = byTemplate.get(template.template_id);
    assert.ok(fixture);
    assert.equal(fixture.fixture_id, template.fixture_id);
    assert.equal(fixture.data_origin, "synthetic");
    assert.equal(fixture.performance_claim_allowed, false);
    assert.deepEqual(fixture.expected, { maturity: template.maturity, enabled: true, execution_authorized: false });
  }
});

test("keeps the CT-656 product-contract projection aligned with the authoritative registry", async () => {
  const [registry, productContract] = await Promise.all([
    readJson("../examples/advisor/task-template-registry-v1.json"),
    readJson("../examples/advisor/advisor-product-contract-v2.json"),
  ]);
  assert.deepEqual(
    productContract.task_templates.map(({ id, maturity, package_eligible, access }) => ({ id, maturity, package_eligible, access })),
    registry.templates.map(({ template_id: id, maturity, package_eligible, access }) => ({ id, maturity, package_eligible, access })),
  );
});

test("keeps bilingual registry documentation aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/task-template-registry-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/task-template-registry-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /decision_support_only/);
    assert.match(document, /default_enabled/);
    assert.match(document, /execution_authorized=false/);
  }
});
