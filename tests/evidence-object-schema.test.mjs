import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../specs/evidence/evidence-object-v1.schema.json", import.meta.url);
const examplesUrl = new URL("../examples/evidence/v1/", import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

function resolveReference(root, reference) {
  assert.match(reference, /^#\//, `Only local schema references are supported in this contract test: ${reference}`);
  return reference.slice(2).split("/").reduce((current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}

function matchesType(value, expected) {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

function validate(value, contract, path = "$", root = schema) {
  if (contract.$ref) return validate(value, resolveReference(root, contract.$ref), path, root);
  const errors = [];

  if (contract.oneOf) {
    const branches = contract.oneOf.map((branch) => validate(value, branch, path, root));
    const passing = branches.filter((branchErrors) => branchErrors.length === 0).length;
    if (passing !== 1) errors.push(`${path} must match exactly one object contract; matched ${passing}`);
  }

  if (contract.const !== undefined && value !== contract.const) errors.push(`${path} must equal ${JSON.stringify(contract.const)}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${path} is outside the allowed enum`);

  if (contract.type) {
    const expected = Array.isArray(contract.type) ? contract.type : [contract.type];
    if (!expected.some((type) => matchesType(value, type))) {
      errors.push(`${path} must have type ${expected.join(" or ")}`);
      return errors;
    }
  }

  if (typeof value === "string") {
    if (contract.minLength !== undefined && value.length < contract.minLength) errors.push(`${path} is shorter than ${contract.minLength}`);
    if (contract.maxLength !== undefined && value.length > contract.maxLength) errors.push(`${path} is longer than ${contract.maxLength}`);
    if (contract.pattern && !new RegExp(contract.pattern).test(value)) errors.push(`${path} does not match ${contract.pattern}`);
    if (contract.format === "date-time") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${path} is not a canonical UTC date-time`);
    }
    if (contract.format === "uri") {
      try { new URL(value); } catch { errors.push(`${path} is not a URI`); }
    }
  }

  if (typeof value === "number") {
    if (contract.minimum !== undefined && value < contract.minimum) errors.push(`${path} is below ${contract.minimum}`);
    if (contract.maximum !== undefined && value > contract.maximum) errors.push(`${path} is above ${contract.maximum}`);
  }

  if (Array.isArray(value)) {
    if (contract.minItems !== undefined && value.length < contract.minItems) errors.push(`${path} has fewer than ${contract.minItems} items`);
    if (contract.maxItems !== undefined && value.length > contract.maxItems) errors.push(`${path} has more than ${contract.maxItems} items`);
    if (contract.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${path} contains duplicate items`);
    }
    if (contract.items) value.forEach((item, index) => errors.push(...validate(item, contract.items, `${path}[${index}]`, root)));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const required of contract.required ?? []) if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`);
    if (contract.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validate(value[key], child, `${path}.${key}`, root));
    }
  }

  return errors;
}

async function loadExamples() {
  const files = (await readdir(examplesUrl)).filter((name) => name.endsWith(".json")).sort();
  const entries = await Promise.all(files.map(async (name) => [name, JSON.parse(await readFile(new URL(name, examplesUrl), "utf8"))]));
  return Object.fromEntries(entries);
}

const objectIdFields = {
  scope: "scope_id",
  method: "method_id",
  run: "run_id",
  observation: "observation_id",
  artifact: "artifact_id",
  evidence_version: "evidence_id",
  review: "review_id",
  policy_decision: "decision_id",
  export_grant: "grant_id"
};

function collectObjectReferences(value, references = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectReferences(item, references);
    return references;
  }
  if (value === null || typeof value !== "object") return references;
  if (["object_type", "object_id", "version", "tenant_id"].every((key) => Object.hasOwn(value, key))) {
    references.push(value);
    return references;
  }
  for (const child of Object.values(value)) collectObjectReferences(child, references);
  return references;
}

function assertClosedObjectSchemas(value, path = "$", seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.type === "object" && value.properties) {
    assert.equal(value.additionalProperties, false, `${path} must reject unknown fields`);
  }
  for (const [key, child] of Object.entries(value)) assertClosedObjectSchemas(child, `${path}.${key}`, seen);
}

test("publishes one strict Draft 2020-12 contract for all nine Evidence Core objects", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "https://cloudtelecom.cn/schemas/evidence/evidence-object-v1.schema.json");
  assert.equal(schema.oneOf.length, 9);

  const expected = ["scope", "method", "run", "observation", "artifact", "evidenceVersion", "review", "policyDecision", "exportGrant"];
  for (const name of expected) {
    const definition = schema.$defs[name];
    assert.equal(definition.additionalProperties, false, `${name} must reject unknown fields`);
    for (const common of ["schema_version", "object_type", "version", "tenant_id", "created_by", "created_at", "authorization_scope"]) {
      assert.ok(definition.required.includes(common), `${name}.${common} must be required`);
    }
  }
  assertClosedObjectSchemas(schema);
});

test("validates one coherent synthetic fixture for every object type", async () => {
  const examples = await loadExamples();
  assert.equal(Object.keys(examples).length, 9);
  assert.deepEqual(new Set(Object.values(examples).map((example) => example.object_type)), new Set([
    "scope", "method", "run", "observation", "artifact", "evidence_version", "review", "policy_decision", "export_grant"
  ]));
  for (const [name, example] of Object.entries(examples)) assert.deepEqual(validate(example, schema), [], name);
});

test("keeps every synthetic reference tenant-scoped and pinned to an existing exact version", async () => {
  const examples = await loadExamples();
  const identities = new Set(Object.values(examples).map((example) => {
    const idField = objectIdFields[example.object_type];
    assert.ok(idField, `unknown fixture object type ${example.object_type}`);
    return [example.tenant_id, example.object_type, example[idField], example.version].join("|");
  }));

  for (const [name, example] of Object.entries(examples)) {
    for (const reference of collectObjectReferences(example)) {
      assert.equal(reference.tenant_id, example.tenant_id, `${name} contains a cross-tenant reference`);
      assert.ok(
        identities.has([reference.tenant_id, reference.object_type, reference.object_id, reference.version].join("|")),
        `${name} contains an unresolved reference to ${reference.object_type}:${reference.object_id}@${reference.version}`
      );
    }
  }
});

test("rejects unknown fields, missing envelope fields, and floating versions", async () => {
  const examples = await loadExamples();
  const scope = structuredClone(examples["scope.synthetic.json"]);
  scope.access_token = "must-not-be-carried";
  assert.ok(validate(scope, schema).some((error) => error.includes("must match exactly one")));

  const nested = structuredClone(examples["scope.synthetic.json"]);
  nested.authorization_scope.secret = "must-not-be-carried";
  assert.ok(validate(nested, schema).some((error) => error.includes("must match exactly one")));

  const missingTenant = structuredClone(examples["scope.synthetic.json"]);
  delete missingTenant.tenant_id;
  assert.ok(validate(missingTenant, schema).some((error) => error.includes("must match exactly one")));

  const floating = structuredClone(examples["run.synthetic.json"]);
  floating.scope_ref.version = "latest";
  assert.ok(validate(floating, schema).some((error) => error.includes("must match exactly one")));

  for (const invalidVersion of ["1.0", "01.0.0", "1.0.0-01", "1.0.0-..", "1.0.0+build..1"]) {
    const invalid = structuredClone(examples["scope.synthetic.json"]);
    invalid.version = invalidVersion;
    assert.ok(validate(invalid, schema).some((error) => error.includes("must match exactly one")), invalidVersion);
  }

  const duplicatedReference = structuredClone(examples["evidence-version.synthetic.json"]);
  duplicatedReference.run_refs.push(structuredClone(duplicatedReference.run_refs[0]));
  assert.ok(validate(duplicatedReference, schema).some((error) => error.includes("must match exactly one")));
});

test("keeps the public fixture synthetic and refuses performance or independence claims", async () => {
  const examples = await loadExamples();
  const run = examples["run.synthetic.json"];
  const observation = examples["observation.synthetic.json"];
  const evidence = examples["evidence-version.synthetic.json"];
  const review = examples["review.synthetic.json"];
  const decision = examples["policy-decision.synthetic.json"];

  assert.equal(run.workload.origin, "synthetic");
  assert.equal(observation.origin, "synthetic");
  assert.equal(evidence.boundary.data_origin, "synthetic");
  assert.equal(evidence.boundary.performance_claim_allowed, false);
  assert.equal(evidence.status.content_integrity, "unverifiable");
  assert.equal(evidence.status.independent_review, "not-reviewed");
  assert.equal(review.independence_disclosure.independent_claim, false);
  assert.equal(review.conclusion, "internal-only");
  assert.equal(decision.outcome, "manual-review");
});

test("documents version rules and registers the schema as a public contract", async () => {
  const [english, chinese, manifest] = await Promise.all([
    readFile(new URL("../docs/evidence/object-model-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/object-model-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /additionalProperties/);
    assert.match(document, /CT-602/);
    assert.match(document, /CT-607/);
    assert.match(document, /SemVer|语义化版本/);
  }
  assert.ok(manifest.public_contracts.includes("specs/evidence/evidence-object-v1.schema.json"));
});
