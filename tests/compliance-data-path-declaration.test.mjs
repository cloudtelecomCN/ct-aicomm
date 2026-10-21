import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  DATA_PATH_DECLARATION_VERSION,
  createDataPathDeclaration,
  validateDataPathDeclaration,
  verifyDataPathDeclaration
} from "../packages/compliance/data-path-declaration.mjs";

const exec = promisify(execFile);
const jsonUrl = new URL("../examples/compliance/synthetic-data-path-declaration.json", import.meta.url);
const yamlUrl = new URL("../examples/compliance/synthetic-data-path-declaration.yaml", import.meta.url);

async function example() {
  return JSON.parse(await readFile(jsonUrl, "utf8"));
}

function createFrom(record, overrides = {}) {
  return createDataPathDeclaration({
    declarationId: record.declaration_id,
    tenantId: record.tenant_id,
    workloadId: record.workload_id,
    revision: record.revision,
    dataOrigin: record.data_origin,
    dataCategories: structuredClone(record.data_categories),
    orderedRegionIds: structuredClone(record.ordered_region_ids),
    regions: structuredClone(record.regions),
    boundaries: structuredClone(record.boundaries),
    encryption: structuredClone(record.encryption),
    processors: structuredClone(record.processors),
    declaredAt: new Date(record.declared_at),
    ...overrides
  });
}

test("creates one canonical declaration and verifies its tenant, workload, and revision", async () => {
  const fixture = await example();
  const declaration = createFrom(fixture);
  assert.equal(declaration.schema_version, DATA_PATH_DECLARATION_VERSION);
  assert.deepEqual(declaration, fixture);
  assert.deepEqual(validateDataPathDeclaration(declaration), {
    valid: true,
    context_verified: false,
    declaration_id: fixture.declaration_id,
    tenant_id: fixture.tenant_id,
    workload_id: fixture.workload_id,
    revision: 1,
    data_origin: "synthetic",
    region_count: 3,
    boundary_count: 2,
    processor_count: 3,
    cross_jurisdiction_boundary_count: 1,
    declaration_fingerprint: fixture.declaration_fingerprint
  });
  assert.equal(verifyDataPathDeclaration(declaration, {
    tenant_id: fixture.tenant_id,
    workload_id: fixture.workload_id,
    revision: fixture.revision
  }).context_verified, true);
  assert.throws(() => { declaration.regions[0].roles.push("storage"); }, TypeError);
});

test("rejects another tenant, workload, or declaration revision", async () => {
  const fixture = await example();
  assert.throws(() => verifyDataPathDeclaration(fixture, {
    tenant_id: "tenant-other",
    workload_id: fixture.workload_id,
    revision: fixture.revision
  }), (error) => error.code === "declaration_tenant_mismatch");
  assert.throws(() => verifyDataPathDeclaration(fixture, {
    tenant_id: fixture.tenant_id,
    workload_id: "workload-other",
    revision: fixture.revision
  }), (error) => error.code === "declaration_workload_mismatch");
  assert.throws(() => verifyDataPathDeclaration(fixture, {
    tenant_id: fixture.tenant_id,
    workload_id: fixture.workload_id,
    revision: 2
  }), (error) => error.code === "declaration_revision_mismatch");
});

test("enforces ordered path boundaries and jurisdiction semantics", async () => {
  const fixture = await example();
  const missingEdge = structuredClone(fixture.boundaries);
  missingEdge[1].from_region_id = "cn-shanghai-edge";
  assert.throws(() => createFrom(fixture, { boundaries: missingEdge }), (error) => error.code === "boundary_path_gap");

  const incorrectJurisdiction = structuredClone(fixture.boundaries);
  incorrectJurisdiction[1].cross_jurisdiction = false;
  incorrectJurisdiction[1].boundary_types = ["provider"];
  incorrectJurisdiction[1].transfer_basis_ref = null;
  assert.throws(() => createFrom(fixture, { boundaries: incorrectJurisdiction }), (error) => error.code === "boundary_jurisdiction_mismatch");

  const missingBasis = structuredClone(fixture.boundaries);
  missingBasis[1].transfer_basis_ref = null;
  assert.throws(() => createFrom(fixture, { boundaries: missingBasis }), (error) => error.code === "boundary_transfer_basis_required");

  const duplicateId = structuredClone(fixture.boundaries);
  duplicateId[1].boundary_id = duplicateId[0].boundary_id;
  assert.throws(() => createFrom(fixture, { boundaries: duplicateId }), (error) => error.code === "boundary_id_duplicate");
});

test("requires declared encryption details and complete processor coverage", async () => {
  const fixture = await example();
  const invalidEncryption = structuredClone(fixture.encryption);
  invalidEncryption.in_transit.protocols = [];
  assert.throws(() => createFrom(fixture, { encryption: invalidEncryption }), (error) => error.code === "encryption_in_transit_protocols_invalid");

  const missingRegionProcessor = fixture.processors.filter((processor) => processor.processor_id !== "processor-observe");
  assert.throws(() => createFrom(fixture, { processors: missingRegionProcessor }), (error) => error.code === "processor_region_uncovered");

  const parentCycle = structuredClone(fixture.processors);
  parentCycle[1].role = "subprocessor";
  parentCycle[1].parent_processor_id = "processor-observe";
  assert.throws(() => createFrom(fixture, { processors: parentCycle }), (error) => error.code === "processor_parent_cycle");
});

test("detects changed content and non-canonical array order", async () => {
  const fixture = await example();
  const tampered = structuredClone(fixture);
  tampered.encryption.in_transit.termination = "boundary";
  assert.throws(() => validateDataPathDeclaration(tampered), (error) => error.code === "declaration_tampered");

  const reordered = structuredClone(fixture);
  reordered.data_categories.reverse();
  assert.throws(() => validateDataPathDeclaration(reordered), (error) => error.code === "declaration_noncanonical");
});

test("keeps JSON and JSON-compatible YAML examples identical and offline-verifiable", async () => {
  const json = await example();
  const yaml = JSON.parse(await readFile(yamlUrl, "utf8"));
  assert.deepEqual(yaml, json);
  assert.equal(validateDataPathDeclaration(json).data_origin, "synthetic");
  const root = new URL("..", import.meta.url);
  for (const relativePath of ["examples/compliance/synthetic-data-path-declaration.json", "examples/compliance/synthetic-data-path-declaration.yaml"]) {
    const { stdout } = await exec(process.execPath, ["scripts/validate-data-path-declaration.mjs", relativePath], { cwd: root });
    const result = JSON.parse(stdout);
    assert.equal(result.valid, true);
    assert.equal(result.context_verified, false);
    assert.equal(result.legal_or_certification_conclusion, false);
  }
});

test("publishes a closed schema with frozen core vocabularies", async () => {
  const schema = JSON.parse(await readFile(new URL("../specs/compliance/data-path-declaration-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, DATA_PATH_DECLARATION_VERSION);
  assert.deepEqual(schema.$defs.data_category.properties.classification.enum, ["public", "internal", "confidential", "restricted"]);
  assert.deepEqual(schema.$defs.processor.properties.role.enum, ["controller", "processor", "subprocessor"]);
  assert.equal(schema.$defs.boundary.additionalProperties, false);
  assert.equal(schema.$defs.encryption.additionalProperties, false);
});
