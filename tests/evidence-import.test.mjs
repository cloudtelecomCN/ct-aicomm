import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  EVIDENCE_CANONICAL_UNITS,
  EVIDENCE_IMPORT_ERROR_CODES,
  createEvidenceImportLedger,
  importEvidenceBundle,
  verifyEvidenceImportLedger
} from "../packages/evidence-import/index.mjs";
import {
  createEvidenceContentBundle,
  deriveEvidenceContentFingerprint
} from "../packages/evidence-integrity/index.mjs";

const BUNDLE_URL = new URL("../examples/evidence/v1/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("../specs/evidence/evidence-import-record-v1.schema.json", import.meta.url), "utf8"));
const manifestBytes = await readFile(new URL("manifest.json", BUNDLE_URL));
const manifest = JSON.parse(manifestBytes);
const checksumsBytes = await readFile(new URL("SHA256SUMS", BUNDLE_URL));
const objectNames = (await readdir(BUNDLE_URL)).filter((name) => name.endsWith(".json") && name !== "manifest.json").sort();
const files = await Promise.all(objectNames.map(async (path) => ({ path, bytes: await readFile(new URL(path, BUNDLE_URL)) })));
const tenantId = manifest.evidence_ref.tenant_id;

function resolveReference(reference) {
  return reference.slice(2).split("/").reduce((current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
}

function matchesType(value, expected) {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

function validateSchema(value, contract, location = "$") {
  if (contract.$ref) return validateSchema(value, resolveReference(contract.$ref), location);
  const errors = [];
  if (contract.allOf) for (const branch of contract.allOf) errors.push(...validateSchema(value, branch, location));
  if (contract.if && validateSchema(value, contract.if, location).length === 0 && contract.then) errors.push(...validateSchema(value, contract.then, location));
  if (contract.oneOf) {
    const matches = contract.oneOf.filter((branch) => validateSchema(value, branch, location).length === 0).length;
    if (matches !== 1) errors.push(`${location} must match exactly one branch`);
  }
  if (contract.const !== undefined && value !== contract.const) errors.push(`${location} must equal ${contract.const}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${location} is outside the enum`);
  if (contract.type) {
    const types = Array.isArray(contract.type) ? contract.type : [contract.type];
    if (!types.some((type) => matchesType(value, type))) return [...errors, `${location} has the wrong type`];
  }
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

function command(overrides = {}) {
  return {
    attemptId: "attempt-synthetic-import-001",
    idempotencyKey: "import-synthetic-evidence-001",
    tenantId,
    sourceId: "source-offline-synthetic-fixture",
    receivedAt: "2026-10-23T00:01:00.000Z",
    expectedManifestFingerprint: manifest.manifest_fingerprint,
    manifestBytes,
    checksumsBytes,
    files,
    ...overrides
  };
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function rebuildBundle(mutator, suffix) {
  const entries = files.map(({ path, bytes }) => ({ path, payload: JSON.parse(bytes.toString("utf8")) }));
  mutator(Object.fromEntries(entries.map((entry) => [entry.payload.object_type, entry.payload])));
  let objects = entries.map(({ path, payload }) => ({ path, content: canonicalBytes(payload) }));
  const evidence = entries.find(({ payload }) => payload.object_type === "evidence_version").payload;
  evidence.content_fingerprint = deriveEvidenceContentFingerprint(objects);
  objects = entries.map(({ path, payload }) => ({ path, content: canonicalBytes(payload) }));
  return createEvidenceContentBundle({
    manifestId: `manifest-synthetic-${suffix}`,
    evidenceRef: manifest.evidence_ref,
    dataOrigin: "synthetic",
    createdAt: new Date("2026-10-23T00:00:00.000Z"),
    objects
  });
}

function bundleCommand(bundle, attemptId, idempotencyKey) {
  return command({
    attemptId,
    idempotencyKey,
    expectedManifestFingerprint: bundle.manifest.manifest_fingerprint,
    manifestBytes: bundle.manifestBytes,
    checksumsBytes: bundle.checksumsText,
    files: bundle.files.map(({ path, bytes }) => ({ path, bytes }))
  });
}

function assertRejected(result, code) {
  assert.equal(result.record.outcome, "rejected");
  assert.equal(result.record.imported_object_count, 0);
  assert.ok(result.record.errors.some((entry) => entry.code === code), JSON.stringify(result.record.errors));
}

test("commits one externally anchored bundle without storing raw content", () => {
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  assert.equal(result.record.outcome, "committed");
  assert.equal(result.record.imported_object_count, 9);
  assert.equal(result.record.errors.length, 0);
  assert.equal(result.record.external_anchor_verified, true);
  assert.equal(result.record.authenticity_verified, false);
  assert.equal(result.record.authorization_verified, false);
  assert.equal(result.record.certification_issued, false);
  assert.equal(result.ledger.objects.length, 9);
  assert.equal(result.ledger.attempts.length, 1);
  assert.ok(result.ledger.objects.every((entry) => !Object.hasOwn(entry, "content") && !Object.hasOwn(entry, "bytes")));
  assert.deepEqual(validateSchema(result.record, schema), []);
});

test("retries the same idempotency key without duplicating attempts or objects", () => {
  const first = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const retry = importEvidenceBundle(first.ledger, command({
    attemptId: "attempt-synthetic-import-retry",
    receivedAt: "2026-10-23T00:02:00.000Z"
  }));
  assert.equal(retry.idempotent_replay, true);
  assert.equal(retry.record.record_fingerprint, first.record.record_fingerprint);
  assert.equal(retry.ledger.objects.length, 9);
  assert.equal(retry.ledger.attempts.length, 1);
});

test("records same content under a new key as replayed without duplicate storage", () => {
  const first = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const replayed = importEvidenceBundle(first.ledger, command({
    attemptId: "attempt-synthetic-import-002",
    idempotencyKey: "import-synthetic-evidence-002"
  }));
  assert.equal(replayed.record.outcome, "replayed");
  assert.equal(replayed.record.imported_object_count, 0);
  assert.equal(replayed.record.duplicate_object_count, 9);
  assert.equal(replayed.ledger.objects.length, 9);
  assert.equal(replayed.ledger.attempts.length, 2);
  assert.deepEqual(validateSchema(replayed.record, schema), []);
});

test("records idempotency-key reuse with different request bytes as rejected", () => {
  const first = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const conflictingCommand = command({
    attemptId: "attempt-synthetic-import-conflict",
    expectedManifestFingerprint: `sha256:${"0".repeat(64)}`
  });
  const result = importEvidenceBundle(first.ledger, conflictingCommand);
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.idempotencyConflict);
  assert.equal(result.ledger.objects.length, 9);
  assert.equal(result.ledger.attempts.length, 2);
  assert.deepEqual(validateSchema(result.record, schema), []);

  const retry = importEvidenceBundle(result.ledger, {
    ...conflictingCommand,
    attemptId: "attempt-synthetic-import-conflict-retry",
    receivedAt: "2026-10-23T00:02:00.000Z"
  });
  assert.equal(retry.idempotent_replay, true);
  assert.equal(retry.record.record_fingerprint, result.record.record_fingerprint);
  assert.equal(retry.ledger.attempts.length, 2);
});

test("does not overwrite an exact version after the whole bundle is rehashed", () => {
  const first = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const changed = rebuildBundle(({ observation }) => { observation.value += 1; }, "changed-same-version");
  const result = importEvidenceBundle(first.ledger, bundleCommand(changed, "attempt-synthetic-import-version-conflict", "import-synthetic-evidence-conflict"));
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.versionConflict);
  assert.equal(result.ledger.objects.length, 9);
  const storedObservation = first.ledger.objects.find(({ object_type: type }) => type === "observation");
  const afterObservation = result.ledger.objects.find(({ object_type: type }) => type === "observation");
  assert.equal(afterObservation.object_fingerprint, storedObservation.object_fingerprint);
});

test("rejects noncanonical units and keeps the failed attempt", () => {
  const invalid = rebuildBundle(({ observation }) => { observation.unit = "milliseconds"; }, "invalid-unit");
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), bundleCommand(invalid, "attempt-synthetic-import-unit", "import-synthetic-invalid-unit"));
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.unitInvalid);
  assert.equal(result.ledger.objects.length, 0);
  assert.equal(result.ledger.attempts.length, 1);
  assert.ok(EVIDENCE_CANONICAL_UNITS.includes("ms"));
  assert.ok(!EVIDENCE_CANONICAL_UNITS.includes("milliseconds"));
});

test("rejects observations outside their exact run window", () => {
  const invalid = rebuildBundle(({ observation }) => { observation.observed_at = "2026-10-22T08:14:00.000Z"; }, "invalid-time");
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), bundleCommand(invalid, "attempt-synthetic-import-time", "import-synthetic-invalid-time"));
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid);
  assert.equal(result.ledger.objects.length, 0);
});

test("rejects an unresolved exact-version reference", () => {
  const invalid = rebuildBundle(({ observation }) => { observation.run_ref.object_id = "run-missing"; }, "invalid-reference");
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), bundleCommand(invalid, "attempt-synthetic-import-reference", "import-synthetic-invalid-reference"));
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.referenceMissing);
  assert.equal(result.ledger.objects.length, 0);
});

test("records CT-603 integrity failures without trusting bundle metadata", () => {
  const tampered = files.map((file) => file.path === "observation.synthetic.json"
    ? { path: file.path, bytes: Buffer.from(file.bytes.toString("utf8").replace("12.5", "13.5")) }
    : file);
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command({
    attemptId: "attempt-synthetic-import-integrity",
    idempotencyKey: "import-synthetic-invalid-integrity",
    files: tampered
  }));
  assert.equal(result.record.outcome, "rejected");
  assert.equal(result.record.external_anchor_verified, false);
  assert.equal(result.record.manifest_fingerprint, null);
  assert.ok(result.record.errors[0].code.startsWith("evidence_integrity_"));
  assert.equal(result.ledger.attempts.length, 1);
});

test("detects mutation of the append-only failure history", () => {
  const committed = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const verification = verifyEvidenceImportLedger(committed.ledger);
  assert.equal(verification.append_only_chain_verified, true);
  const tampered = structuredClone(committed.ledger);
  tampered.attempts[0].outcome = "replayed";
  assert.throws(
    () => verifyEvidenceImportLedger(tampered),
    (error) => error?.code === EVIDENCE_IMPORT_ERROR_CODES.ledgerFingerprintMismatch
  );
});

test("rejects forged stored-object provenance even when record hashes remain intact", () => {
  const committed = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), command());
  const tampered = structuredClone(committed.ledger);
  tampered.objects[0].manifest_fingerprint = `sha256:${"f".repeat(64)}`;
  assert.throws(
    () => verifyEvidenceImportLedger(tampered),
    (error) => error?.code === EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid
  );
});

test("rejects unknown object fields after the entire bundle is re-anchored", () => {
  const invalid = rebuildBundle(({ observation }) => { observation.undeclared_claim = true; }, "invalid-object-field");
  const result = importEvidenceBundle(createEvidenceImportLedger({ tenantId }), bundleCommand(invalid, "attempt-synthetic-import-field", "import-synthetic-invalid-field"));
  assertRejected(result, EVIDENCE_IMPORT_ERROR_CODES.objectInvalid);
  assert.equal(result.ledger.objects.length, 0);
});

test("publishes bilingual guidance, schema, SDK, and offline scenario boundaries", async () => {
  const [english, chinese, publicApi, environment, sdk] = await Promise.all([
    readFile(new URL("../docs/evidence/import-and-idempotency-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/import-and-idempotency-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /idempoten|幂等/iu);
    assert.match(document, /UTC/u);
    assert.match(document, /失败|failure/iu);
    assert.match(document, /认证|certification/iu);
  }
  assert.ok(publicApi.public_contracts.includes("specs/evidence/evidence-import-record-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/evidence-import/index.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-import.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "evidence-import-idempotency"));
  assert.equal(typeof sdk.importEvidenceBundle, "function");
  assert.equal(typeof sdk.verifyEvidenceImportLedger, "function");
  assert.equal(Object.values(EVIDENCE_IMPORT_ERROR_CODES).length, new Set(Object.values(EVIDENCE_IMPORT_ERROR_CODES)).size);
});
