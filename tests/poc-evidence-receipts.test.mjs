import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const sha256 = /^[a-f0-9]{64}$/;
const fingerprint = /^sha256:[a-f0-9]{64}$/;

test("publishes a privacy-safe measured environment receipt", async () => {
  const receipt = await readJson("../evidence/poc/ct-521-a10-dual-node-20261021.json");
  assert.equal(receipt.evidence_origin, "measured");
  assert.match(receipt.environment_fingerprint, fingerprint);
  assert.match(receipt.restricted_manifest_sha256, sha256);
  assert.equal(receipt.restricted_fields_published, false);
  assert.equal(receipt.performance_claim, "none");
  for (const forbidden of ["ip", "hostname", "credential", "instance_id"]) {
    assert.equal(Object.hasOwn(receipt, forbidden), false);
  }
});

test("binds every measured baseline group to the frozen environment", async () => {
  const environment = await readJson("../evidence/poc/ct-521-a10-dual-node-20261021.json");
  const baseline = await readJson("../evidence/poc/ct-522-a10-dual-node-baseline-20261021.json");
  assert.equal(baseline.environment_fingerprint, environment.environment_fingerprint);
  assert.equal(baseline.data_origin, "measured");
  assert.equal(baseline.performance_claim, "baseline_only");
  assert.equal(baseline.groups.length, 2);
  for (const group of baseline.groups) {
    assert.equal(group.sample_count, 200);
    assert.equal(group.success_count + group.failure_count, group.sample_count);
    assert.match(group.batch_sha256, sha256);
    assert.match(group.restricted_file_sha256, sha256);
  }
});
