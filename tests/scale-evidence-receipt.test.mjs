import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const sha256 = /^[a-f0-9]{64}$/;

test("publishes a bounded CT-534 scale receipt without restricted topology", async () => {
  const environment = await readJson("../evidence/poc/ct-521-a10-dual-node-20261021.json");
  const receipt = await readJson("../evidence/architecture/ct-534-a10-scale-20261022.json");
  assert.equal(receipt.environment_fingerprint, environment.environment_fingerprint);
  assert.equal(receipt.data_origin, "measured");
  assert.equal(receipt.experiment.attempt_count, 1024);
  assert.equal(receipt.experiment.success_count, 1024);
  assert.equal(receipt.experiment.failure_count, 0);
  assert.equal(receipt.results.length, 8);
  assert.ok(receipt.results.every(({ attempt_count, success_rate }) => attempt_count === 128 && success_rate === 1));
  const single = receipt.results.find(({ topology_id, concurrency }) => topology_id === "single-endpoint" && concurrency === 64);
  const dual = receipt.results.find(({ topology_id, concurrency }) => topology_id === "all-endpoints" && concurrency === 64);
  assert.ok(dual.successful_requests_per_second > single.successful_requests_per_second);
  assert.ok(dual.ttft_ms.p95 < single.ttft_ms.p95);
  for (const hash of Object.values(receipt.restricted_artifacts)) assert.match(hash, sha256);
  assert.equal(receipt.restricted_fields_published, false);
  assert.ok(receipt.limitations.length >= 5);
  assert.doesNotMatch(JSON.stringify(receipt), /(?:\d{1,3}\.){3}\d{1,3}|i-[a-z0-9]{8,}|\.pem|private[_ -]?key/iu);
});

test("keeps CT-583 partial until genuinely different kernels are measured", async () => {
  const receipt = await readJson("../evidence/quality/ct-583-kernel-matrix-partial-20261022.json");
  assert.equal(receipt.status, "partial");
  assert.equal(receipt.matrix.length, 1);
  assert.equal(receipt.matrix[0].host_observation_count, 2);
  assert.equal(receipt.matrix[0].compile.verified_hosts, 1);
  assert.equal(receipt.matrix[0].compile.not_run_hosts, 1);
  assert.equal(receipt.claim_gate, "not_passed_multi_kernel_matrix_incomplete");
  assert.ok(receipt.limitations.some((limitation) => /same distribution, architecture, and kernel/i.test(limitation)));
  for (const hash of Object.values(receipt.restricted_artifacts)) assert.match(hash, sha256);
});

test("records the CT-581 short preflight without claiming the long-run gate", async () => {
  const receipt = await readJson("../evidence/quality/ct-581-a10-soak-preflight-20261022.json");
  assert.equal(receipt.status, "partial");
  assert.equal(receipt.workload.attempt_count, 10240);
  assert.equal(receipt.workload.success_count, 10240);
  assert.equal(receipt.workload.failure_count, 0);
  assert.equal(receipt.service_observation.node_a_restart_count, 0);
  assert.equal(receipt.service_observation.node_b_restart_count, 0);
  assert.equal(receipt.resource_observation.process_rss_observation, "not_captured_in_this_preflight");
  assert.equal(receipt.claim_gate, "not_passed_seven_and_thirty_day_stages_not_run");
  assert.ok(receipt.limitations.some((limitation) => /not a seven-day or thirty-day soak/i.test(limitation)));
  for (const hash of Object.values(receipt.restricted_artifacts)) assert.match(hash, sha256);
  assert.doesNotMatch(JSON.stringify(receipt), /(?:\d{1,3}\.){3}\d{1,3}|i-[a-z0-9]{8,}|\.pem|private[_ -]?key/iu);
});
