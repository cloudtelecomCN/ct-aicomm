import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("pins every CT-521 through CT-526 receipt and remains pending", async () => {
  const packet = await readJson("../evidence/poc/ct-527-independent-review-packet-20261021.json");
  assert.equal(packet.status, "awaiting_independent_review");
  assert.equal(packet.reviewer_identifier, null);
  assert.equal(packet.review_decision, null);
  assert.deepEqual(packet.public_receipts.map(({ task }) => task), ["CT-521", "CT-522", "CT-523", "CT-524", "CT-525", "CT-526"]);
  for (const receipt of packet.public_receipts) {
    const content = await readFile(new URL(`../${receipt.path}`, import.meta.url));
    assert.equal(createHash("sha256").update(content).digest("hex"), receipt.sha256);
  }
  assert.match(packet.independence_rule, /differ from executor_identity/);
  assert.ok(packet.required_review.length >= 8);
});

test("requires an independent reviewer and a signed decision", async () => {
  const schema = await readJson("../specs/poc/independent-review-attestation-v1.schema.json");
  assert.deepEqual(schema.properties.independent, { const: true });
  assert.ok(schema.required.includes("reviewer_identifier"));
  assert.ok(schema.required.includes("restricted_evidence_verified"));
  assert.ok(schema.required.includes("decision"));
  assert.ok(schema.required.includes("attestation_sha256"));
});
