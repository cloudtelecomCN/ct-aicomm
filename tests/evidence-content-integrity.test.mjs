import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EVIDENCE_CONTENT_CANONICALIZATION,
  EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES,
  canonicalizeEvidenceValue,
  createEvidenceContentBundle,
  deriveEvidenceContentFingerprint,
  digestEvidenceBytes,
  verifyEvidenceContentBundle
} from "../packages/evidence-integrity/index.mjs";
import { verifyEvidenceContentDirectory } from "../scripts/verify-evidence-content.mjs";

const BUNDLE_URL = new URL("../examples/evidence/v1/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("../specs/evidence/evidence-content-manifest-v1.schema.json", import.meta.url), "utf8"));
const manifestBytes = await readFile(new URL("manifest.json", BUNDLE_URL));
const checksumsBytes = await readFile(new URL("SHA256SUMS", BUNDLE_URL));
const manifest = JSON.parse(manifestBytes);
const objectNames = (await readdir(BUNDLE_URL)).filter((name) => name.endsWith(".json") && name !== "manifest.json").sort();
const files = await Promise.all(objectNames.map(async (name) => ({ path: name, bytes: await readFile(new URL(name, BUNDLE_URL)) })));

function resolveReference(reference) {
  return reference.slice(2).split("/").reduce((current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
}

function matchesType(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validateSchema(value, contract, location = "$") {
  if (contract.$ref) return validateSchema(value, resolveReference(contract.$ref), location);
  const errors = [];
  if (contract.allOf) for (const branch of contract.allOf) errors.push(...validateSchema(value, branch, location));
  if (contract.not && validateSchema(value, contract.not, location).length === 0) errors.push(`${location} matches a forbidden schema`);
  if (contract.if && validateSchema(value, contract.if, location).length === 0 && contract.then) errors.push(...validateSchema(value, contract.then, location));
  if (contract.const !== undefined && value !== contract.const) errors.push(`${location} must equal ${contract.const}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${location} is outside the enum`);
  if (contract.type && !matchesType(value, contract.type)) return [...errors, `${location} has the wrong type`];
  if (typeof value === "string") {
    if (contract.pattern && !new RegExp(contract.pattern).test(value)) errors.push(`${location} does not match its pattern`);
    if (contract.format === "date-time") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${location} is not a canonical instant`);
    }
  }
  if (typeof value === "number" && contract.minimum !== undefined && value < contract.minimum) errors.push(`${location} is below its minimum`);
  if (Array.isArray(value)) {
    if (contract.minItems !== undefined && value.length < contract.minItems) errors.push(`${location} has too few items`);
    if (contract.maxItems !== undefined && value.length > contract.maxItems) errors.push(`${location} has too many items`);
    if (contract.items) value.forEach((item, index) => errors.push(...validateSchema(item, contract.items, `${location}[${index}]`)));
    if (contract.contains) {
      const matches = value.filter((item) => validateSchema(item, contract.contains, location).length === 0).length;
      if (contract.minContains !== undefined && matches < contract.minContains) errors.push(`${location} has too few matching items`);
      if (contract.maxContains !== undefined && matches > contract.maxContains) errors.push(`${location} has too many matching items`);
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const field of contract.required ?? []) if (!Object.hasOwn(value, field)) errors.push(`${location}.${field} is required`);
    if (contract.additionalProperties === false) {
      for (const field of Object.keys(value)) if (!Object.hasOwn(properties, field)) errors.push(`${location}.${field} is not allowed`);
    }
    for (const [field, child] of Object.entries(properties)) if (Object.hasOwn(value, field)) errors.push(...validateSchema(value[field], child, `${location}.${field}`));
  }
  return errors;
}

function expectCode(expected, action) {
  assert.throws(action, (error) => error?.code === expected, `expected ${expected}`);
}

function verification(overrides = {}) {
  return verifyEvidenceContentBundle({ manifestBytes, checksumsBytes, files, ...overrides });
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function leaves(value, current = []) {
  if (value === null || typeof value !== "object") return [current];
  const output = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => output.push(...leaves(item, [...current, index])));
  } else {
    for (const [key, child] of Object.entries(value)) output.push(...leaves(child, [...current, key]));
  }
  return output;
}

function mutateLeaf(value) {
  if (value === null) return "tampered";
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  return `${value}#tampered`;
}

function setAtPath(value, tokens) {
  const copy = structuredClone(value);
  let current = copy;
  for (let index = 0; index < tokens.length - 1; index += 1) current = current[tokens[index]];
  const last = tokens.at(-1);
  current[last] = mutateLeaf(current[last]);
  return copy;
}

test("validates the strict manifest schema and deterministic synthetic bundle", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(validateSchema(manifest, schema), []);
  assert.equal(manifest.canonicalization, EVIDENCE_CONTENT_CANONICALIZATION);
  assert.equal(manifest.data_origin, "synthetic");
  assert.equal(manifest.protected_scope, "entire-json-object");
  assert.equal(manifest.objects.length, 9);

  const result = verification({ expectedManifestFingerprint: manifest.manifest_fingerprint });
  assert.equal(result.integrity_verified, true);
  assert.equal(result.external_anchor_verified, true);
  assert.equal(result.authenticity_verified, false);
  assert.equal(result.authorization_verified, false);
  assert.equal(result.independent_review_verified, false);
  assert.equal(result.certification_issued, false);
});

test("rebuilds the checked-in bundle byte-for-byte", () => {
  const bundle = createEvidenceContentBundle({
    manifestId: manifest.manifest_id,
    evidenceRef: manifest.evidence_ref,
    dataOrigin: manifest.data_origin,
    createdAt: new Date(manifest.created_at),
    objects: files.map(({ path: filePath, bytes }) => ({ path: filePath, content: bytes }))
  });
  assert.deepEqual(bundle.manifest, manifest);
  assert.deepEqual(Buffer.from(bundle.manifestBytes), manifestBytes);
  assert.equal(bundle.checksumsText, checksumsBytes.toString("utf8"));
  assert.equal(deriveEvidenceContentFingerprint(files.map(({ path: filePath, bytes }) => ({ path: filePath, content: bytes }))), manifest.content_fingerprint);
  assert.equal(
    digestEvidenceBytes(canonicalizeEvidenceValue({ b: 2, a: 1 })),
    digestEvidenceBytes(canonicalizeEvidenceValue({ a: 1, b: 2 }))
  );
});

test("fails after changing every protected leaf field", () => {
  let mutationCount = 0;
  for (const file of files) {
    const payload = JSON.parse(file.bytes.toString("utf8"));
    for (const tokens of leaves(payload)) {
      mutationCount += 1;
      const mutated = canonicalBytes(setAtPath(payload, tokens));
      const tamperedFiles = files.map((candidate) => candidate.path === file.path ? { path: candidate.path, bytes: mutated } : candidate);
      expectCode(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectChecksumMismatch, () => verification({ files: tamperedFiles }));
    }
  }
  assert.ok(mutationCount > 150, `expected broad field coverage, checked ${mutationCount}`);
});

test("requires an external anchor after an attacker recomputes the whole bundle", () => {
  const modifiedFiles = files.map((file) => {
    if (file.path !== "review.synthetic.json") return { path: file.path, content: file.bytes };
    const payload = JSON.parse(file.bytes.toString("utf8"));
    payload.method = `${payload.method} Modified and rehashed by an untrusted writer.`;
    return { path: file.path, content: canonicalBytes(payload) };
  });
  const rebuilt = createEvidenceContentBundle({
    manifestId: manifest.manifest_id,
    evidenceRef: manifest.evidence_ref,
    dataOrigin: manifest.data_origin,
    createdAt: new Date(manifest.created_at),
    objects: modifiedFiles
  });
  const internallyConsistent = verifyEvidenceContentBundle({
    manifestBytes: rebuilt.manifestBytes,
    checksumsBytes: rebuilt.checksumsText,
    files: rebuilt.files
  });
  assert.equal(internallyConsistent.integrity_verified, true);
  assert.equal(internallyConsistent.external_anchor_verified, false);
  assert.notEqual(rebuilt.manifest.manifest_fingerprint, manifest.manifest_fingerprint);
  expectCode(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.anchorMismatch, () => verifyEvidenceContentBundle({
    manifestBytes: rebuilt.manifestBytes,
    checksumsBytes: rebuilt.checksumsText,
    files: rebuilt.files,
    expectedManifestFingerprint: manifest.manifest_fingerprint
  }));
});

test("rejects unsafe paths, noncanonical JSON, and checksum drift", () => {
  const unsafe = structuredClone(manifest);
  unsafe.objects[0].path = "../outside.json";
  expectCode(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathInvalid, () => verifyEvidenceContentBundle({
    manifestBytes: canonicalBytes(unsafe),
    checksumsBytes,
    files
  }));

  const compact = files.map((file) => file.path === "scope.synthetic.json"
    ? { path: file.path, content: JSON.stringify(JSON.parse(file.bytes.toString("utf8"))) }
    : { path: file.path, content: file.bytes });
  expectCode(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectNoncanonical, () => createEvidenceContentBundle({
    manifestId: manifest.manifest_id,
    evidenceRef: manifest.evidence_ref,
    dataOrigin: manifest.data_origin,
    createdAt: new Date(manifest.created_at),
    objects: compact
  }));

  const brokenChecksums = Buffer.from(checksumsBytes.toString("utf8").replace(/^[a-f0-9]/u, "0"));
  expectCode(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectChecksumMismatch, () => verification({ checksumsBytes: brokenChecksums }));
});

test("verifies the directory offline and rejects extra files and symlinks", async (context) => {
  const result = await verifyEvidenceContentDirectory(fileURLToPath(BUNDLE_URL), manifest.manifest_fingerprint);
  assert.equal(result.verification_scope, "content-integrity-only");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "ct-aicomm-evidence-"));
  try {
    await Promise.all([
      writeFile(path.join(temporary, "manifest.json"), manifestBytes),
      writeFile(path.join(temporary, "SHA256SUMS"), checksumsBytes),
      ...files.map(({ path: filePath, bytes }) => writeFile(path.join(temporary, filePath), bytes))
    ]);
    await writeFile(path.join(temporary, "undeclared.json"), "{}\n");
    await assert.rejects(verifyEvidenceContentDirectory(temporary), (error) => error?.code === EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumSetMismatch);
    await rm(path.join(temporary, "undeclared.json"));
    try {
      await symlink(path.join(temporary, "scope.synthetic.json"), path.join(temporary, "linked.json"), "file");
      await assert.rejects(verifyEvidenceContentDirectory(temporary), /non-symlink/u);
    } catch (error) {
      if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
      context.diagnostic(`symlink creation unavailable on this host: ${error.code}`);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("publishes bilingual guidance, stable errors, CLI, and public SDK boundaries", async () => {
  const [english, chinese, publicApi, environment, sdk] = await Promise.all([
    readFile(new URL("../docs/evidence/content-integrity-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/content-integrity-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /SHA256SUMS/u);
    assert.match(document, /expected-manifest/u);
    assert.match(document, /真实性|authenticity/iu);
    assert.match(document, /认证|certification/iu);
  }
  assert.ok(publicApi.public_contracts.includes("specs/evidence/evidence-content-manifest-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/evidence-integrity/index.mjs"));
  assert.ok(publicApi.public_tools.includes("scripts/verify-evidence-content.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-content-integrity.test.mjs"));
  assert.equal(typeof sdk.verifyEvidenceContentBundle, "function");
  assert.equal(typeof sdk.createEvidenceContentBundle, "function");
  assert.equal(Object.values(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES).length, new Set(Object.values(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES)).size);
});
