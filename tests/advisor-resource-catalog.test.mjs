import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RESOURCE_CATALOG_TYPES,
  computeCatalogResourceDigest,
  computeCatalogSourceDigest,
  validateCatalogResource,
  validateResourceCatalogBundle,
  validateResourceFieldRegistry,
} from "../packages/advisor/resource-catalog.mjs";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("publishes strict resource-registry and catalog schemas", async () => {
  const [registrySchema, catalogSchema] = await Promise.all([
    readJson("../specs/advisor/resource-field-registry-v1.schema.json"),
    readJson("../specs/advisor/resource-catalog-v1.schema.json"),
  ]);
  assert.equal(registrySchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(catalogSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(registrySchema.additionalProperties, false);
  assert.equal(catalogSchema.additionalProperties, false);
  assert.equal(catalogSchema.properties.boundaries.properties.tenant_private_excluded.const, true);
  assert.equal(catalogSchema.properties.boundaries.properties.execution_authorized.const, false);
});

test("binds every supported resource type to canonical fields and units", async () => {
  const registry = await readJson("../examples/advisor/resource-field-registry-v1.json");
  const result = validateResourceFieldRegistry(registry);
  assert.equal(result.valid, true);
  assert.deepEqual([...registry.resource_types].sort(), [...RESOURCE_CATALOG_TYPES].sort());
  assert.equal(result.profile_count, RESOURCE_CATALOG_TYPES.length);
  const units = new Set(registry.units.map(({ code }) => code));
  assert.ok(registry.fields.every(({ allowed_units }) => allowed_units.every((unit) => units.has(unit))));
});

test("verifies one current synthetic resource for every catalog type", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/resource-field-registry-v1.json"),
    readJson("../examples/advisor/synthetic-resource-catalog-v1.json"),
  ]);
  const result = validateResourceCatalogBundle(bundle, registry, { evaluatedAt: "2026-10-23T00:00:00.000Z" });
  assert.equal(result.valid, true);
  assert.equal(result.resource_count, RESOURCE_CATALOG_TYPES.length);
  assert.equal(result.current_count, RESOURCE_CATALOG_TYPES.length);
  assert.equal(result.usable_for_analysis_count, RESOURCE_CATALOG_TYPES.length);
  assert.deepEqual(bundle.resources.map(({ resource_type }) => resource_type).sort(), [...RESOURCE_CATALOG_TYPES].sort());
  for (const resource of bundle.resources) {
    assert.equal(resource.data_class, "synthetic");
    assert.equal(resource.source_snapshot.content_sha256, computeCatalogSourceDigest(resource.source_snapshot));
    assert.equal(resource.content_sha256, computeCatalogResourceDigest(resource));
  }
});

test("classifies expiry and required unknowns without inventing values", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/resource-field-registry-v1.json"),
    readJson("../examples/advisor/synthetic-resource-catalog-v1.json"),
  ]);
  const expired = structuredClone(bundle.resources.find(({ resource_type }) => resource_type === "network_path"));
  expired.source_snapshot.expires_at = "2026-10-22T00:00:00.000Z";
  expired.source_snapshot.content_sha256 = computeCatalogSourceDigest(expired.source_snapshot);
  expired.content_sha256 = computeCatalogResourceDigest(expired);
  const expiredResult = validateCatalogResource(expired, registry, { evaluatedAt: "2026-10-23T00:00:00.000Z" });
  assert.equal(expiredResult.freshness, "expired");
  assert.equal(expiredResult.usable_for_analysis, false);

  const incomplete = structuredClone(bundle.resources.find(({ resource_type }) => resource_type === "gpu"));
  const model = incomplete.facts.find(({ field_id }) => field_id === "gpu.model");
  model.status = "unknown";
  model.value = null;
  incomplete.content_sha256 = computeCatalogResourceDigest(incomplete);
  const incompleteResult = validateCatalogResource(incomplete, registry, { evaluatedAt: "2026-10-23T00:00:00.000Z" });
  assert.equal(incompleteResult.required_facts_complete, false);
  assert.deepEqual(incompleteResult.missing_required_fields, ["gpu.model"]);
  assert.equal(incompleteResult.usable_for_analysis, false);
});

test("detects source and resource tampering independently", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/resource-field-registry-v1.json"),
    readJson("../examples/advisor/synthetic-resource-catalog-v1.json"),
  ]);
  const sourceTamper = structuredClone(bundle.resources[0]);
  sourceTamper.source_snapshot.summary = "Modified synthetic source summary that was not part of the signed snapshot.";
  assert.throws(() => validateCatalogResource(sourceTamper, registry), (error) => error.code === "catalog_source_digest_mismatch");

  const resourceTamper = structuredClone(bundle.resources[0]);
  resourceTamper.facts.find(({ field_id }) => field_id === "gpu.memory_capacity").value = 96;
  assert.throws(() => validateCatalogResource(resourceTamper, registry), (error) => error.code === "catalog_resource_digest_mismatch");
});

test("rejects tenant-private data and missing redistribution rights from the public catalog", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/resource-field-registry-v1.json"),
    readJson("../examples/advisor/synthetic-resource-catalog-v1.json"),
  ]);
  const privateBundle = structuredClone(bundle);
  privateBundle.resources[0].visibility = "tenant_private";
  privateBundle.resources[0].data_class = "tenant_private";
  privateBundle.resources[0].source_snapshot.data_class = "tenant_private";
  privateBundle.resources[0].source_snapshot.kind = "customer_declared";
  privateBundle.resources[0].source_snapshot.authorization = { basis: "customer_authorized", analysis_use: "allowed", redistribution: "prohibited", reference: "customer-private" };
  privateBundle.resources[0].source_snapshot.content_sha256 = computeCatalogSourceDigest(privateBundle.resources[0].source_snapshot);
  privateBundle.resources[0].content_sha256 = computeCatalogResourceDigest(privateBundle.resources[0]);
  assert.throws(() => validateResourceCatalogBundle(privateBundle, registry), (error) => error.code === "resource_catalog_private_entry");

  const unauthorized = structuredClone(bundle.resources[1]);
  unauthorized.source_snapshot.authorization.redistribution = "unknown";
  unauthorized.source_snapshot.content_sha256 = computeCatalogSourceDigest(unauthorized.source_snapshot);
  unauthorized.content_sha256 = computeCatalogResourceDigest(unauthorized);
  assert.throws(() => validateCatalogResource(unauthorized, registry), (error) => error.code === "catalog_public_authorization_invalid");
});

test("keeps bilingual catalog documentation aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/resource-catalog-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/resource-catalog-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /Resource|资源/);
    assert.match(document, /SHA-256/);
    assert.match(document, /synthetic|合成/);
    assert.match(document, /tenant|租户/);
    assert.match(document, /execution|执行/);
  }
});
