import assert from "node:assert/strict";
import test from "node:test";
import { compareExperimentGroups } from "../packages/poc/experiment-comparison.mjs";

function batch(group, values, fingerprint = "sha256:" + "a".repeat(64)) {
  const prefix = group === "baseline" ? "baseline" : "connector-only";
  const samples = values.map((value, index) => ({ sample_id: `${prefix}-${index + 1}`, outcome: { success: true }, segments: { ttft_ms: value } }));
  const assignments = values.map((_, index) => ({ sample_id: `${prefix}-${index + 1}`, repetition: index % 2 + 1, concurrency: 1, prompt_class: "short" }));
  return { group, environment_fingerprint: fingerprint, sample_count: values.length, success_count: values.length, failure_count: 0, batch_sha256: String(group[0]).repeat(64), samples, assignments };
}

test("produces a deterministic supported improvement decision", () => {
  const result = compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 110, 120, 130, 105, 115, 125, 135])], treatmentBatch: batch("connector_only", [50, 55, 60, 65, 52, 57, 62, 67]), resamples: 500, seed: "fixed" });
  assert.equal(result.conclusion, "statistically_supported_improvement");
  assert.equal(result.claim_gate.allowed, true);
  assert.ok(result.relative_improvement_percent.p95 > 40);
  assert.match(result.analysis_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result, compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 110, 120, 130, 105, 115, 125, 135])], treatmentBatch: batch("connector_only", [50, 55, 60, 65, 52, 57, 62, 67]), resamples: 500, seed: "fixed" }));
});

test("withholds a claim when confidence intervals include no improvement", () => {
  const result = compareExperimentGroups({ baselineBatches: [batch("baseline", [90, 110, 90, 110, 90, 110, 90, 110])], treatmentBatch: batch("connector_only", [85, 115, 85, 115, 85, 115, 85, 115]), resamples: 500 });
  assert.equal(result.claim_gate.allowed, false);
  assert.equal(result.conclusion, "no_supported_improvement_claim");
});

test("rejects cross-environment and unpaired comparisons", () => {
  assert.throws(() => compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 100])], treatmentBatch: batch("connector_only", [50, 50], "sha256:" + "b".repeat(64)) }), { code: "comparison_environment_mismatch" });
  const treatment = batch("connector_only", [50, 50]);
  treatment.assignments[0].concurrency = 8;
  assert.throws(() => compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 100])], treatmentBatch: treatment }), { code: "comparison_strata_mismatch" });
});

test("compares an explicitly declared network-only treatment", () => {
  const treatment = batch("connector_only", [50, 55, 60, 65]);
  treatment.group = "network_only";
  const result = compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 110, 120, 130])], treatmentBatch: treatment, treatmentGroup: "network_only", resamples: 100 });
  assert.equal(result.treatment_group, "network_only");
});

test("compares an explicitly declared joint treatment", () => {
  const treatment = batch("connector_only", [45, 50, 55, 60]);
  treatment.group = "joint_optimization";
  const result = compareExperimentGroups({ baselineBatches: [batch("baseline", [100, 110, 120, 130])], treatmentBatch: treatment, treatmentGroup: "joint_optimization", resamples: 100 });
  assert.equal(result.treatment_group, "joint_optimization");
  assert.equal(result.claim_gate.allowed, true);
});
