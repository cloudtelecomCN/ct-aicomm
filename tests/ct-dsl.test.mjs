import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertValidPolicy, validatePolicy } from "../packages/ct-dsl/index.mjs";
import { compareSchemas, isSemVer } from "../packages/ct-dsl/compatibility.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("committed CT-DSL examples validate", async () => {
  for (const name of ["latency", "cost"]) assert.equal(validatePolicy(await readJson(`../examples/ct-dsl/${name}.json`)).valid, true);
});

test("validator rejects unknown fields and duplicate route ids", async () => {
  const policy = await readJson("../examples/ct-dsl/latency.json");
  policy.debug = true;
  policy.routes[1].id = policy.routes[0].id;
  const result = validatePolicy(policy);
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map(({ code }) => code).sort(), ["duplicate", "unknown_property"]);
  assert.throws(() => assertValidPolicy(policy), (error) => error.code === "CT_DSL_INVALID");
});

test("SemVer metadata is valid", async () => {
  const metadata = await readJson("../packages/ct-dsl/package.json");
  assert.equal(isSemVer(metadata.version), true);
  assert.equal(isSemVer("1"), false);
});

test("optional additions are backward compatible", async () => {
  const previous = await readJson("../specs/ct-dsl/ct-dsl-v1.schema.json");
  const next = structuredClone(previous);
  next.properties.policy.properties.description = { type: "string" };
  assert.deepEqual(compareSchemas(previous, next), { compatible: true, changes: [] });
});

test("new requirements and narrowed enums are breaking", async () => {
  const previous = await readJson("../specs/ct-dsl/ct-dsl-v1.schema.json");
  const next = structuredClone(previous);
  next.properties.policy.required.push("description");
  next.properties.policy.properties.objective.enum = ["latency", "cost"];
  const result = compareSchemas(previous, next);
  assert.equal(result.compatible, false);
  assert.deepEqual(result.changes.map(({ code }) => code).sort(), ["enum_narrowed", "required_added"]);
});
