import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyPublicEvidence } from "../cli/verify-evidence.mjs";

const example = JSON.parse(await readFile(new URL("../examples/synthetic/evidence-version.json", import.meta.url), "utf8"));

test("synthetic evidence passes regardless of JSON object key order", () => {
  const value = Object.fromEntries(Object.entries(example).reverse());
  assert.deepEqual(verifyPublicEvidence(value), { valid: true, errors: [] });
});

test("performance claims fail closed", () => {
  const result = verifyPublicEvidence({
    ...example,
    boundary: { ...example.boundary, performance_claim_allowed: true }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("performance claims")));
});

test("an altered digest or sealed document fails integrity validation", () => {
  for (const value of [
    { ...example, content_fingerprint: `sha256:${"0".repeat(64)}` },
    { ...example, evidence_id: "evidence-synthetic-link-002" }
  ]) {
    const result = verifyPublicEvidence(value);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("canonical evidence document")));
  }
});

test("each type must satisfy the published schema, including formats", () => {
  assert.equal(verifyPublicEvidence({ schema_version: "1.0.0", object_type: "run" }).valid, false);
  assert.equal(verifyPublicEvidence({ ...example, object_type: "unknown" }).valid, false);
  assert.equal(verifyPublicEvidence({ ...example, created_at: "2026-02-30T08:15:00.000Z" }).valid, false);
  assert.equal(verifyPublicEvidence({ ...example, extra: true }).valid, false);
});
