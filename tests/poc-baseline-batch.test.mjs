import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildBaselinePlan, runBaselinePlan } from "../packages/poc/baseline-batch.mjs";

const synthetic = JSON.parse(await readFile(new URL("../examples/poc/synthetic-environment-freeze.json", import.meta.url), "utf8"));
const measured = { ...synthetic, freeze_id: "measured-test-fixture", evidence_origin: "measured" };
const prompts = [{ id: "p1", class: "short", prompt: "one" }, { id: "p2", class: "long", prompt: "two" }];

test("builds a deterministic measured baseline plan at the required sample size", () => {
  const plan = buildBaselinePlan({ environment: measured, prompts, minimumSamples: 5, repetitions: 3 });
  assert.equal(plan.requests.length, 5);
  assert.deepEqual(plan.requests.map(({ prompt_id }) => prompt_id), ["p1", "p2", "p1", "p2", "p1"]);
  assert.deepEqual(plan.requests.map(({ concurrency }) => concurrency), [1, 1, 8, 8, 32]);
  assert.deepEqual(plan.requests.map(({ repetition }) => repetition), [1, 1, 1, 1, 1]);
  assert.match(plan.plan_sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.plan_sha256, buildBaselinePlan({ environment: measured, prompts, minimumSamples: 5, repetitions: 3 }).plan_sha256);
});

test("retains failed samples in a fingerprinted batch", async () => {
  const plan = buildBaselinePlan({ environment: measured, prompts, minimumSamples: 3 });
  const collect = async ({ sampleId, environmentFingerprint, prompt }) => ({
    sample_id: sampleId,
    data_origin: "measured",
    outcome: { success: prompt !== "two", ...(prompt === "two" ? { failure_code: "http_503" } : {}) },
    evidence: { environment_fingerprint: environmentFingerprint }
  });
  const batch = await runBaselinePlan({ plan, endpoint: "http://measured.invalid", model: measured.model.identifier, collect });
  assert.equal(batch.status, "collected");
  assert.equal(batch.sample_count, 3);
  assert.equal(batch.failure_count, 1);
  assert.deepEqual(batch.failure_sample_ids, ["baseline-000002"]);
  assert.deepEqual(batch.assignments.map(({ sample_id, concurrency }) => [sample_id, concurrency]), [
    ["baseline-000001", 1], ["baseline-000002", 1], ["baseline-000003", 8]
  ]);
  assert.match(batch.batch_sha256, /^[a-f0-9]{64}$/);
});

test("executes every frozen concurrency stratum with bounded parallelism", async () => {
  const environment = { ...measured, load_profile: { ...measured.load_profile, concurrency: [1, 2] } };
  const plan = buildBaselinePlan({ environment, prompts, minimumSamples: 8, repetitions: 2 });
  let active = 0;
  let maximumActive = 0;
  const collect = async ({ sampleId, environmentFingerprint }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { sample_id: sampleId, data_origin: "measured", outcome: { success: true }, evidence: { environment_fingerprint: environmentFingerprint } };
  };
  const batch = await runBaselinePlan({ plan, endpoint: "http://measured.invalid", model: environment.model.identifier, collect });
  assert.equal(batch.sample_count, 8);
  assert.equal(maximumActive, 2);
  assert.deepEqual(plan.requests.map(({ repetition, concurrency }) => [repetition, concurrency]), [
    [1, 1], [1, 1], [1, 2], [1, 2], [2, 1], [2, 1], [2, 2], [2, 2]
  ]);
});

test("never treats a synthetic environment as a measured baseline", () => {
  assert.throws(() => buildBaselinePlan({ environment: synthetic, prompts }), { code: "measured_environment_required" });
});
