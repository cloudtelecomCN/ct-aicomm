import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildScalePlan, runScalePlan, summarizeScaleBatch } from "../packages/poc/scale-experiment.mjs";

const synthetic = JSON.parse(await readFile(new URL("../examples/poc/synthetic-environment-freeze.json", import.meta.url), "utf8"));
const measured = { ...synthetic, freeze_id: "measured-scale-fixture", evidence_origin: "measured" };
const prompts = [{ id: "p1", class: "short", prompt: "one" }, { id: "p2", class: "long", prompt: "two" }];
const topologies = [
  { id: "single-endpoint", endpoint_ids: ["node-a"] },
  { id: "dual-endpoint", endpoint_ids: ["node-a", "node-b"] }
];

test("builds a deterministic address-free scale plan", () => {
  const input = { environment: measured, prompts, topologies, concurrencyLevels: [1, 2], samplesPerStratum: 2, repetitions: 2 };
  const plan = buildScalePlan(input);
  assert.equal(plan.requests.length, 16);
  assert.equal(plan.plan_sha256, buildScalePlan(input).plan_sha256);
  assert.deepEqual(plan.topologies[1].endpoint_ids, ["node-a", "node-b"]);
  assert.doesNotMatch(JSON.stringify(plan), /127\.0\.0\.1|172\.21\.|https?:\/\//);
});

test("executes bounded parallel strata and summarizes without endpoint addresses", async () => {
  const plan = buildScalePlan({ environment: measured, prompts, topologies, concurrencyLevels: [1, 2], samplesPerStratum: 2, repetitions: 1 });
  let active = 0;
  let maximumActive = 0;
  let clock = 0;
  const collect = async ({ endpoint, sampleId, environmentFingerprint }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return {
      sample_id: sampleId,
      outcome: { success: true },
      route: { inference_instance: new URL(endpoint).host },
      segments: { ttft_ms: endpoint.includes("node-b") ? 8 : 10 },
      evidence: { environment_fingerprint: environmentFingerprint }
    };
  };
  const batch = await runScalePlan({
    plan,
    endpoints: new Map([["node-a", "http://node-a.internal:8000"], ["node-b", "http://node-b.internal:8000"]]),
    model: measured.model.identifier,
    collect,
    now: () => (clock += 100)
  });
  assert.equal(batch.sample_count, 8);
  assert.equal(maximumActive, 2);
  assert.match(batch.batch_sha256, /^[a-f0-9]{64}$/);

  const summary = summarizeScaleBatch(batch);
  assert.equal(summary.rows.length, 4);
  const dual = summary.rows.find((row) => row.topology_id === "dual-endpoint" && row.concurrency === 1);
  assert.equal(dual.endpoint_count, 2);
  assert.equal(dual.observed_count, 2);
  assert.equal(dual.missing_count, 0);
  assert.doesNotMatch(JSON.stringify(summary), /node-a\.internal|node-b\.internal/);
  assert.match(summary.summary_sha256, /^[a-f0-9]{64}$/);

  const incomplete = structuredClone(batch);
  incomplete.samples.pop();
  const incompleteRow = summarizeScaleBatch(incomplete).rows.find((row) => row.topology_id === "dual-endpoint" && row.concurrency === 2);
  assert.equal(incompleteRow.attempt_count, 2);
  assert.equal(incompleteRow.observed_count, 1);
  assert.equal(incompleteRow.missing_count, 1);
  assert.equal(incompleteRow.failure_count, 1);
  assert.equal(incompleteRow.success_rate, 0.5);

  const duplicate = structuredClone(batch);
  duplicate.samples.push(duplicate.samples[0]);
  assert.throws(() => summarizeScaleBatch(duplicate), { code: "scale_batch_duplicate_sample" });
});

test("rejects synthetic evidence and undersampled concurrency", () => {
  assert.throws(() => buildScalePlan({ environment: synthetic, prompts, topologies, concurrencyLevels: [1], samplesPerStratum: 1 }), { code: "measured_environment_required" });
  assert.throws(() => buildScalePlan({ environment: measured, prompts, topologies, concurrencyLevels: [8], samplesPerStratum: 4 }), { code: "scale_sample_policy_invalid" });
});
