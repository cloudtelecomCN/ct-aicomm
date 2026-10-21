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
  assert.equal(baseline.repetitions, 3);
  assert.deepEqual(baseline.concurrency_levels, [1, 8, 32]);
  assert.equal(baseline.groups.length, 2);
  for (const group of baseline.groups) {
    assert.equal(group.sample_count, 200);
    assert.equal(group.success_count + group.failure_count, group.sample_count);
    assert.match(group.batch_sha256, sha256);
    assert.match(group.restricted_file_sha256, sha256);
  }
});

test("publishes a bounded CT-523 measured claim with confidence intervals", async () => {
  const environment = await readJson("../evidence/poc/ct-521-a10-dual-node-20261021.json");
  const baseline = await readJson("../evidence/poc/ct-522-a10-dual-node-baseline-20261021.json");
  const treatment = await readJson("../evidence/poc/ct-523-a10-instance-scheduling-20261021.json");
  assert.equal(treatment.environment_fingerprint, environment.environment_fingerprint);
  assert.deepEqual(treatment.baseline_batch_sha256, baseline.groups.map(({ batch_sha256 }) => batch_sha256));
  assert.equal(treatment.claim_gate, "passed_for_this_poc_environment");
  assert.equal(treatment.sample_counts.connector_only, 200);
  assert.equal(treatment.sample_counts.connector_only_success_rate, 1);
  for (const metric of ["p50", "p95", "p99"]) {
    assert.ok(treatment.relative_improvement_percent[metric] > 0);
    assert.ok(treatment.confidence_interval_95_percent[metric][0] > 0);
  }
  assert.equal(treatment.restricted_fields_published, false);
  assert.ok(treatment.limitations.length >= 4);
});

test("publishes CT-524 execution proof without overstating a negative result", async () => {
  const environment = await readJson("../evidence/poc/ct-521-a10-dual-node-20261021.json");
  const receipt = await readJson("../evidence/poc/ct-524-a10-network-path-20261021.json");
  assert.equal(receipt.environment_fingerprint, environment.environment_fingerprint);
  assert.equal(receipt.data_origin, "measured");
  assert.equal(receipt.execution_proof.treatment_ran_without_logical_endpoint_listener, true);
  assert.match(receipt.execution_proof.bpf_object_sha256, sha256);
  assert.equal(receipt.groups.baseline.sample_count, 200);
  assert.equal(receipt.groups.network_only.sample_count, 200);
  assert.equal(receipt.groups.baseline.success_rate, 1);
  assert.equal(receipt.groups.network_only.success_rate, 1);
  assert.equal(receipt.claim_gate, "not_passed");
  assert.equal(receipt.conclusion, "real_path_execution_verified_without_statistically_supported_ttft_improvement");
  assert.ok(receipt.analysis.confidence_interval_95_percent.p50[0] <= 0);
  assert.ok(receipt.analysis.confidence_interval_95_percent.p95[0] <= 0);
  assert.equal(receipt.restricted_fields_published, false);
  assert.ok(receipt.limitations.length >= 4);
});
