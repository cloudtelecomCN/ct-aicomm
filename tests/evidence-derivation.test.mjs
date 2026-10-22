import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ARTIFACT_DERIVATION_ERROR_CODES,
  ARTIFACT_REDACTION_ACTIONS,
  createArtifactDerivationRecord,
  inspectArtifactDerivationRecord,
  verifyArtifactDerivationRecord
} from "../packages/evidence-derivation/index.mjs";

const FIXTURE_URL = new URL("../examples/evidence/derivation/", import.meta.url);
const sourceArtifact = JSON.parse(await readFile(new URL("source-artifact.synthetic.json", FIXTURE_URL), "utf8"));
const derivedArtifact = JSON.parse(await readFile(new URL("public-artifact.synthetic.json", FIXTURE_URL), "utf8"));
const schema = JSON.parse(await readFile(new URL("../specs/evidence/artifact-derivation-record-v1.schema.json", import.meta.url), "utf8"));
const policyFingerprint = `sha256:${"5".repeat(64)}`;

const redactions = [
  {
    source_content_pointer: "/destination_endpoint/ip_address",
    action: "remove",
    category: "infrastructure-locator",
    reason_code: "restricted-network-address"
  },
  {
    source_content_pointer: "/request_identifiers",
    action: "pseudonymize",
    category: "customer-data",
    reason_code: "customer-identifier-boundary"
  },
  {
    source_content_pointer: "/samples",
    action: "aggregate",
    category: "raw-measurement",
    reason_code: "publish-aggregate-only"
  },
  {
    source_content_pointer: "/source_endpoint/ip_address",
    action: "remove",
    category: "infrastructure-locator",
    reason_code: "restricted-network-address"
  }
];

function createRecord(overrides = {}) {
  return createArtifactDerivationRecord({
    derivationId: "derivation-synthetic-public-summary",
    version: "1.0.0",
    createdBy: "principal-synthetic-publisher",
    createdAt: "2026-10-23T01:12:00.000Z",
    sourceArtifact,
    derivedArtifact,
    policy: {
      policy_id: "policy-synthetic-public-derivation",
      version: "1.0.0",
      fingerprint: policyFingerprint
    },
    redactions,
    ...overrides
  });
}

function resolveReference(reference) {
  return reference.slice(2).split("/").reduce((current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
}

function matchesType(value, expected) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  return typeof value === expected;
}

function validateSchema(value, contract, location = "$") {
  if (contract.$ref) return validateSchema(value, resolveReference(contract.$ref), location);
  const errors = [];
  if (contract.const !== undefined && value !== contract.const) errors.push(`${location} must equal ${contract.const}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${location} is outside the enum`);
  if (contract.type && !matchesType(value, contract.type)) return [...errors, `${location} has the wrong type`];
  if (typeof value === "string") {
    if (contract.minLength !== undefined && value.length < contract.minLength) errors.push(`${location} is too short`);
    if (contract.maxLength !== undefined && value.length > contract.maxLength) errors.push(`${location} is too long`);
    if (contract.pattern && !new RegExp(contract.pattern).test(value)) errors.push(`${location} does not match its pattern`);
    if (contract.format === "date-time") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${location} is not canonical UTC`);
    }
  }
  if (typeof value === "number" && contract.minimum !== undefined && value < contract.minimum) errors.push(`${location} is below its minimum`);
  if (Array.isArray(value)) {
    if (contract.minItems !== undefined && value.length < contract.minItems) errors.push(`${location} has too few items`);
    if (contract.maxItems !== undefined && value.length > contract.maxItems) errors.push(`${location} has too many items`);
    if (contract.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${location} has duplicates`);
    if (contract.items) value.forEach((item, index) => errors.push(...validateSchema(item, contract.items, `${location}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const field of contract.required ?? []) if (!Object.hasOwn(value, field)) errors.push(`${location}.${field} is required`);
    if (contract.additionalProperties === false) for (const field of Object.keys(value)) if (!Object.hasOwn(properties, field)) errors.push(`${location}.${field} is not allowed`);
    for (const [field, child] of Object.entries(properties)) if (Object.hasOwn(value, field)) errors.push(...validateSchema(value[field], child, `${location}.${field}`));
  }
  return errors;
}

test("creates a strict public derivation record without source values", () => {
  const record = createRecord();
  assert.deepEqual(validateSchema(record, schema), []);
  assert.equal(record.source_artifact.classification, "restricted");
  assert.equal(record.derived_artifact.classification, "public");
  assert.equal(record.redaction_summary.declared_field_count, 4);
  assert.equal(record.redaction_summary.omitted_field_count, 2);
  assert.equal(record.redaction_summary.transformed_field_count, 2);
  assert.equal(record.redaction_summary.raw_values_included, false);
  assert.equal(record.source_content_included, false);
  assert.equal(record.hidden_values_included, false);
  assert.equal(Object.hasOwn(record.source_artifact, "storage_locator"), false);
  assert.equal(Object.hasOwn(record.redactions[0], "source_value"), false);
  assert.deepEqual(record.redactions.map(({ source_content_pointer: pointer }) => pointer), [...record.redactions.map(({ source_content_pointer: pointer }) => pointer)].sort());
});

test("separates public inspection from exact private-source verification", () => {
  const record = createRecord();
  const inspection = inspectArtifactDerivationRecord(record);
  assert.equal(inspection.record_integrity_verified, true);
  assert.equal(inspection.redaction_disclosure_verified, true);
  assert.equal(inspection.source_artifact_verified, false);
  assert.equal(inspection.source_content_bytes_verified, false);
  const verification = verifyArtifactDerivationRecord({
    record,
    sourceArtifact,
    derivedArtifact,
    expectedPolicyFingerprint: policyFingerprint
  });
  assert.equal(verification.source_artifact_verified, true);
  assert.equal(verification.derived_artifact_verified, true);
  assert.equal(verification.exact_version_lineage_verified, true);
  assert.equal(verification.policy_anchor_verified, true);
  assert.equal(verification.source_content_bytes_verified, false);
  assert.equal(verification.authenticity_verified, false);
  assert.equal(verification.authorization_verified, false);
  assert.equal(verification.certification_issued, false);
});

test("rejects public derivation when the exact source version is absent", () => {
  const invalid = structuredClone(derivedArtifact);
  invalid.derived_from = [];
  assert.throws(
    () => createRecord({ derivedArtifact: invalid }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.lineageMissing
  );
});

test("rejects cross-tenant lineage", () => {
  const invalid = structuredClone(derivedArtifact);
  invalid.tenant_id = "tenant-synthetic-beta";
  invalid.derived_from[0].tenant_id = "tenant-synthetic-beta";
  assert.throws(
    () => createRecord({ derivedArtifact: invalid }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.tenantMismatch
  );
});

test("rejects lineage and record chronology that moves backward", () => {
  const earlyDerived = structuredClone(derivedArtifact);
  earlyDerived.created_at = "2026-10-23T00:59:59.000Z";
  assert.throws(
    () => createRecord({ derivedArtifact: earlyDerived }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.timeOrderInvalid
  );
  assert.throws(
    () => createRecord({ createdAt: "2026-10-23T01:09:59.000Z" }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.timeOrderInvalid
  );
});

test("requires a restricted private source and a public derivative", () => {
  const invalidSource = structuredClone(sourceArtifact);
  invalidSource.classification = "public";
  invalidSource.authorization_scope.visibility = "public";
  assert.throws(
    () => createRecord({ sourceArtifact: invalidSource }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.classificationInvalid
  );
  const invalidDerived = structuredClone(derivedArtifact);
  invalidDerived.classification = "restricted";
  invalidDerived.authorization_scope.visibility = "private";
  assert.throws(
    () => createRecord({ derivedArtifact: invalidDerived }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.classificationInvalid
  );
});

test("rejects duplicate pointers and undeclared raw-value fields", () => {
  assert.throws(
    () => createRecord({ redactions: [redactions[0], redactions[0]] }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.pointerDuplicate
  );
  assert.throws(
    () => createRecord({ redactions: [{ ...redactions[0], source_value: "must-not-leak" }] }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.fieldUnknown
  );
});

test("detects record tampering and forged artifact metadata", () => {
  const record = structuredClone(createRecord());
  record.redactions[0].reason_code = "changed-after-publication";
  assert.throws(
    () => inspectArtifactDerivationRecord(record),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.fingerprintMismatch
  );
  const original = createRecord();
  const forgedSource = structuredClone(sourceArtifact);
  forgedSource.size_bytes += 1;
  assert.throws(
    () => verifyArtifactDerivationRecord({ record: original, sourceArtifact: forgedSource, derivedArtifact }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.fingerprintMismatch
  );
});

test("requires caller-supplied policy anchor to match exactly", () => {
  assert.throws(
    () => verifyArtifactDerivationRecord({
      record: createRecord(),
      sourceArtifact,
      derivedArtifact,
      expectedPolicyFingerprint: `sha256:${"0".repeat(64)}`
    }),
    (error) => error?.code === ARTIFACT_DERIVATION_ERROR_CODES.policyAnchorMismatch
  );
});

test("publishes the CT-605 contract, SDK exports, guidance, and offline scenario", async () => {
  const [english, chinese, publicApi, environment, sdk] = await Promise.all([
    readFile(new URL("../docs/evidence/artifact-lineage-and-redaction-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/artifact-lineage-and-redaction-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /private|私有/iu);
    assert.match(document, /hidden|隐藏/iu);
    assert.match(document, /review|复核/iu);
    assert.match(document, /certification|认证/iu);
  }
  assert.ok(publicApi.public_contracts.includes("specs/evidence/artifact-derivation-record-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/evidence-derivation/index.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-derivation.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "artifact-derivation-lineage"));
  assert.equal(typeof sdk.createArtifactDerivationRecord, "function");
  assert.equal(typeof sdk.inspectArtifactDerivationRecord, "function");
  assert.equal(typeof sdk.verifyArtifactDerivationRecord, "function");
  assert.equal(ARTIFACT_REDACTION_ACTIONS.length, 5);
  assert.equal(Object.values(ARTIFACT_DERIVATION_ERROR_CODES).length, new Set(Object.values(ARTIFACT_DERIVATION_ERROR_CODES)).size);
});
