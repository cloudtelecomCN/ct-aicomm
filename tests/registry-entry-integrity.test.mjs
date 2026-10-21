import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  REGISTRY_ENTRY_INTEGRITY_VERSION,
  canonicalizeRegistryValue,
  createRegistryEntryRecord,
  digestRegistryArtifact,
  verifyRegistryEntryHistory,
  verifyRegistryEntryRecord
} from "../packages/registry-entry-integrity/index.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

async function fixture() {
  const history = await json("registry/entries/synthetic-quic-example/history.json");
  const keyring = await json("registry/keys/synthetic-fixture-ed25519-public.json");
  const publicKeys = Object.fromEntries(keyring.keys.map((key) => [key.key_id, key.public_key_pem]));
  const paths = [...new Set(history.records.flatMap(({ entry }) => entry.artifacts.map(({ path }) => path)))];
  const artifactBytesByPath = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(new URL(path, root))])));
  return { history, keyring, publicKeys, artifactBytesByPath };
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code);
}

function unsignedEntry(overrides = {}) {
  return {
    schema_version: "1.0.0",
    entry_id: "fixture-protocol",
    entry_version: "1.0.0",
    sequence: 1,
    status: "published",
    published_at: "2026-10-21T12:00:00.000Z",
    source_contribution: {
      id: "fixture-protocol-add-20261021",
      digest: `sha256:${"1".repeat(64)}`
    },
    review_receipt_digest: `sha256:${"2".repeat(64)}`,
    previous_version_digest: null,
    protocol: {
      id: "fixture-protocol",
      name: "Fixture protocol",
      version: "draft-1",
      category: "transport",
      summary: "Synthetic protocol metadata used only for integrity unit tests.",
      specification_urls: ["https://example.com/specification"],
      implementation_urls: ["https://example.com/implementation"],
      interoperability_tags: ["synthetic"]
    },
    artifacts: [{
      path: "examples/fixture.json",
      media_type: "application/json",
      sha256: digestRegistryArtifact("fixture\n")
    }],
    ...overrides
  };
}

test("committed Registry history verifies signatures, artifacts, and digest continuity", async () => {
  const { history, keyring, publicKeys, artifactBytesByPath } = await fixture();
  const result = verifyRegistryEntryHistory(history.records, { publicKeys, artifactBytesByPath });
  assert.equal(REGISTRY_ENTRY_INTEGRITY_VERSION, "1.0.0");
  assert.deepEqual(result.versions, ["1.0.0", "1.1.0"]);
  assert.equal(result.entry_id, "synthetic-quic-example");
  assert.equal(result.latest_digest, history.records.at(-1).integrity.entry_digest);
  assert.equal(result.artifacts_verified, true);
  assert.equal(keyring.keys[0].private_key_committed, false);
  assert.match(keyring.keys[0].public_key_pem, /^-----BEGIN PUBLIC KEY-----/);
  assert.doesNotMatch(keyring.keys[0].public_key_pem, /PRIVATE KEY/);
});

test("canonicalization and artifact hashing are deterministic", () => {
  assert.equal(canonicalizeRegistryValue({ z: 2, a: [true, "x"] }), '{"a":[true,"x"],"z":2}');
  assert.equal(digestRegistryArtifact("fixture\n"), "sha256:e80b71cd14d3cbd65f4173abcbfcf01a545dbca32a72d575108b553a648cc96f");
  assertCode(() => canonicalizeRegistryValue(1.5), "canonical_number_invalid");
});

test("metadata and signature tampering fail closed", async () => {
  const { history, publicKeys, artifactBytesByPath } = await fixture();
  const metadata = structuredClone(history.records[0]);
  metadata.entry.protocol.summary += " changed";
  assertCode(() => verifyRegistryEntryRecord(metadata, { publicKeys, artifactBytesByPath }), "entry_digest_mismatch");

  const signature = structuredClone(history.records[0]);
  const value = signature.signature.value;
  signature.signature.value = `${value.slice(0, 7)}${value[7] === "A" ? "B" : "A"}${value.slice(8)}`;
  assertCode(() => verifyRegistryEntryRecord(signature, { publicKeys, artifactBytesByPath }), "entry_signature_invalid");
  assertCode(() => verifyRegistryEntryRecord(history.records[0], { publicKeys: {}, artifactBytesByPath }), "signature_key_unknown");
});

test("artifact verification detects missing and changed bytes", async () => {
  const { history, publicKeys, artifactBytesByPath } = await fixture();
  const firstPath = history.records[0].entry.artifacts[0].path;
  const missing = { ...artifactBytesByPath };
  delete missing[firstPath];
  assertCode(() => verifyRegistryEntryRecord(history.records[0], { publicKeys, artifactBytesByPath: missing }), "artifact_missing");

  const changed = { ...artifactBytesByPath, [firstPath]: Buffer.from("tampered\n") };
  assertCode(() => verifyRegistryEntryRecord(history.records[0], { publicKeys, artifactBytesByPath: changed }), "artifact_digest_mismatch");
  assert.equal(verifyRegistryEntryRecord(history.records[0], { publicKeys, requireArtifacts: false }).artifacts_verified, false);
});

test("version deletion and reorder fail history validation", async () => {
  const { history, publicKeys, artifactBytesByPath } = await fixture();
  assertCode(() => verifyRegistryEntryHistory([history.records[1]], { publicKeys, artifactBytesByPath }), "history_sequence_invalid");
  assertCode(() => verifyRegistryEntryHistory([...history.records].reverse(), { publicKeys, artifactBytesByPath }), "history_sequence_invalid");
});

test("ephemeral Ed25519 signing round-trip enforces sequence and previous digest links", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeys = { "unit-test-key": publicKey };
  const artifactBytesByPath = { "examples/fixture.json": Buffer.from("fixture\n") };
  const first = createRegistryEntryRecord(unsignedEntry(), { privateKey, keyId: "unit-test-key" });
  const secondEntry = unsignedEntry({
    entry_version: "1.1.0",
    sequence: 2,
    published_at: "2026-10-21T12:01:00.000Z",
    source_contribution: { id: "fixture-protocol-update-20261021", digest: `sha256:${"3".repeat(64)}` },
    previous_version_digest: first.integrity.entry_digest
  });
  const second = createRegistryEntryRecord(secondEntry, { privateKey, keyId: "unit-test-key" });
  assert.deepEqual(verifyRegistryEntryHistory([first, second], { publicKeys, artifactBytesByPath }).versions, ["1.0.0", "1.1.0"]);

  const wrongLink = createRegistryEntryRecord({ ...secondEntry, previous_version_digest: `sha256:${"4".repeat(64)}` }, { privateKey, keyId: "unit-test-key" });
  assertCode(() => verifyRegistryEntryHistory([first, wrongLink], { publicKeys, artifactBytesByPath }), "history_previous_digest_mismatch");

  const sequenceGap = createRegistryEntryRecord({ ...secondEntry, sequence: 3 }, { privateKey, keyId: "unit-test-key" });
  assertCode(() => verifyRegistryEntryHistory([first, sequenceGap], { publicKeys, artifactBytesByPath }), "history_sequence_invalid");
});

test("entry validation rejects private protocol URLs and unsorted artifacts", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateUrl = unsignedEntry();
  privateUrl.protocol.specification_urls = ["https://127.0.0.1/specification"];
  assertCode(() => createRegistryEntryRecord(privateUrl, { privateKey, keyId: "unit-test-key" }), "protocol_url_invalid");

  const unsorted = unsignedEntry({
    artifacts: [
      { path: "z.json", media_type: "application/json", sha256: `sha256:${"5".repeat(64)}` },
      { path: "a.json", media_type: "application/json", sha256: `sha256:${"6".repeat(64)}` }
    ]
  });
  assertCode(() => createRegistryEntryRecord(unsorted, { privateKey, keyId: "unit-test-key" }), "artifact_order_invalid");
});

test("verification CLI preserves synthetic evidence boundaries", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/verify-registry-history.mjs"], { cwd: root });
  const output = JSON.parse(stdout);
  assert.equal(output.record_count, 2);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.performance_claim_allowed, false);
  assert.equal(output.artifacts_verified, true);
});

test("Registry record schema is closed and documents Ed25519 integrity", async () => {
  const schema = await json("specs/registry/registry-entry-record-v1.schema.json");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.entry.additionalProperties, false);
  assert.equal(schema.properties.integrity.properties.canonicalization.const, "ct-aicomm-json-v1");
  assert.equal(schema.properties.signature.properties.algorithm.const, "Ed25519");
});
