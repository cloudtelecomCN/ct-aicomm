import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSingleOrigin, createExportManifest, partitionEvidence, validateEvidenceSample } from "../packages/evidence-gate/gate.mjs";

const synthetic = JSON.parse(await readFile(new URL("../docs/bench-reproduction/synthetic-ttft-sample.json", import.meta.url), "utf8"));

function asOrigin(origin, id) {
  const sample = structuredClone(synthetic);
  sample.sample_id = id;
  sample.data_origin = origin;
  if (origin === "measured") {
    sample.evidence.measurement_scope = "Client-observed measured request.";
    sample.evidence.limitations = [];
  }
  if (origin === "hybrid") sample.evidence.measurement_scope = "Measured client timing with a substituted server environment.";
  return sample;
}

test("partitions all origins and emits fixed presentation semantics", () => {
  const samples = [asOrigin("synthetic", "s1"), asOrigin("hybrid", "h1"), asOrigin("measured", "m1")];
  const partitions = partitionEvidence(samples);
  assert.equal(partitions.synthetic.length, 1);
  assert.equal(partitions.hybrid.length, 1);
  assert.equal(partitions.measured.length, 1);
  assert.equal(validateEvidenceSample(samples[0]).presentation.claimable, false);
  assert.equal(validateEvidenceSample(samples[2]).presentation.claimable, true);
});

test("rejects mixed-origin aggregation", () => {
  assert.throws(() => assertSingleOrigin([asOrigin("synthetic", "s1"), asOrigin("measured", "m1")]), (error) => error.code === "mixed_origin_aggregation");
});

test("requires limitations for hybrid evidence", () => {
  const sample = asOrigin("hybrid", "h1");
  sample.evidence.limitations = [];
  assert.throws(() => validateEvidenceSample(sample), (error) => error.code === "limitations_required");
});

test("creates a fingerprinted non-claimable synthetic export manifest", () => {
  const manifest = createExportManifest([asOrigin("synthetic", "s1")]);
  assert.equal(manifest.display_label, "Synthetic demonstration");
  assert.equal(manifest.display_label_zh, "合成演示");
  assert.equal(manifest.performance_claim_allowed, false);
  assert.match(manifest.payload_sha256, /^[a-f0-9]{64}$/);
});
