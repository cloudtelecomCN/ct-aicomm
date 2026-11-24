import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyPublicEvidence } from "../cli/verify-evidence.mjs";

test("synthetic evidence example passes the public verifier", async () => {
  const value = JSON.parse(await readFile(new URL("../examples/synthetic/evidence-version.json", import.meta.url), "utf8"));
  assert.deepEqual(verifyPublicEvidence(value), { valid: true, errors: [] });
});

test("performance claims fail closed", () => {
  const result = verifyPublicEvidence({
    schema_version: "1.0.0",
    object_type: "evidence_version",
    boundary: { data_origin: "synthetic", performance_claim_allowed: true },
    content_fingerprint: `sha256:${"0".repeat(64)}`
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("performance claims")));
});
