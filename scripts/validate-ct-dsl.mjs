import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CT_DSL_VERSION, assertValidPolicy } from "../packages/ct-dsl/index.mjs";
import { isSemVer } from "../packages/ct-dsl/compatibility.mjs";

const schema = JSON.parse(await readFile(new URL("../specs/ct-dsl/ct-dsl-v1.schema.json", import.meta.url), "utf8"));
const packageMetadata = JSON.parse(await readFile(new URL("../packages/ct-dsl/package.json", import.meta.url), "utf8"));
assert.equal(schema["x-ct-aicomm-version"], CT_DSL_VERSION);
assert.equal(packageMetadata.version, CT_DSL_VERSION);
assert.ok(isSemVer(CT_DSL_VERSION));
for (const name of ["latency", "cost"]) {
  const example = JSON.parse(await readFile(new URL(`../examples/ct-dsl/${name}.json`, import.meta.url), "utf8"));
  assertValidPolicy(example);
}
console.log(`CT-DSL ${CT_DSL_VERSION}: schema metadata and 2 JSON examples are valid.`);
