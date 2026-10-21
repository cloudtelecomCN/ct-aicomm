import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildInstanceSchedulingPlan, INSTANCE_ONLY_SCORE_POLICY_V1, runInstanceSchedulingPlan } from "../packages/poc/instance-scheduling-experiment.mjs";

const synthetic = JSON.parse(await readFile(new URL("../examples/poc/synthetic-environment-freeze.json", import.meta.url), "utf8"));
const environment = { ...synthetic, freeze_id: "measured-instance-fixture", evidence_origin: "measured", load_profile: { ...synthetic.load_profile, concurrency: [1, 2] } };
const prompts = [{ id: "p1", class: "short", prompt: "one" }, { id: "p2", class: "long", prompt: "two" }];
const instances = ["a", "b"].map((id) => ({ id, endpoint: `http://${id}.invalid`, metrics_endpoint: `http://${id}.invalid/metrics`, region: "east", zone: id, models: [environment.model.identifier], ready: true }));

function metrics(instance, date) {
  return {
    instance: instance.id,
    collected_at: date.toISOString(),
    health: "ready",
    missing_required_metrics: [],
    queue: { waiting_requests: instance.id === "a" ? 9 : 0, running_requests: instance.id === "a" ? 8 : 1 },
    cache: { kv_usage_ratio: instance.id === "a" ? 0.8 : 0.1 }
  };
}

function network(instance, date) {
  return { target_instance: instance.id, collected_at: date.toISOString(), rtt_ms: 5, packet_loss_ratio: 0, available_bandwidth_mbps: 1000, source: "fixed-test-path" };
}

test("builds a connector-only plan across frozen repetitions and concurrency", () => {
  const plan = buildInstanceSchedulingPlan({ environment, prompts, minimumSamples: 8, repetitions: 2 });
  assert.equal(plan.route_policy, "instance_selection_only");
  assert.equal(plan.network_policy, "fixed_path");
  assert.deepEqual(INSTANCE_ONLY_SCORE_POLICY_V1.weights, { queue: 0.9, network: 0, geography: 0, cost: 0, health: 0.1 });
  assert.deepEqual(plan.requests.map(({ repetition, concurrency }) => [repetition, concurrency]), [[1, 1], [1, 1], [1, 2], [1, 2], [2, 1], [2, 1], [2, 2], [2, 2]]);
});

test("selects the lower-load instance without changing the network path", async () => {
  const plan = buildInstanceSchedulingPlan({ environment, prompts, minimumSamples: 8, repetitions: 2 });
  const collect = async ({ endpoint, sampleId, environmentFingerprint }) => ({ sample_id: sampleId, endpoint, outcome: { success: true }, evidence: { environment_fingerprint: environmentFingerprint } });
  const batch = await runInstanceSchedulingPlan({
    plan,
    instances,
    model: environment.model.identifier,
    sourceRegion: "east",
    networkPathId: "fixed-test-path",
    metricsProvider: metrics,
    networkProvider: network,
    costByCandidate: { a: 1, b: 1 },
    geographyPenaltyByRegion: { east: 0 },
    collect,
    now: () => new Date("2026-10-21T08:00:00Z")
  });
  assert.equal(batch.sample_count, 8);
  assert.equal(batch.failure_count, 0);
  assert.ok(batch.assignments.every(({ selected_candidate_id }) => selected_candidate_id === "b"));
  assert.ok(batch.samples.every(({ endpoint }) => endpoint === "http://b.invalid"));
  assert.ok(batch.decisions.every(({ candidates }) => candidates[0].raw_inputs.waiting_requests === 0));
  assert.deepEqual(batch.decisions.map(({ reservation_depth }) => reservation_depth), [1, 1, 1, 2, 1, 1, 1, 2]);
  assert.match(batch.batch_sha256, /^[a-f0-9]{64}$/);
});

test("uses local reservations to split a tied concurrent window", async () => {
  const tiedMetrics = (instance, date) => ({ ...metrics(instance, date), queue: { waiting_requests: 0, running_requests: 0 }, cache: { kv_usage_ratio: 0 } });
  const plan = buildInstanceSchedulingPlan({ environment, prompts, minimumSamples: 4, repetitions: 1 });
  const collect = async ({ endpoint, sampleId, environmentFingerprint }) => ({ sample_id: sampleId, endpoint, outcome: { success: true }, evidence: { environment_fingerprint: environmentFingerprint } });
  const batch = await runInstanceSchedulingPlan({
    plan,
    instances,
    model: environment.model.identifier,
    sourceRegion: "east",
    networkPathId: "fixed-test-path",
    metricsProvider: tiedMetrics,
    networkProvider: network,
    costByCandidate: { a: 1, b: 1 },
    geographyPenaltyByRegion: { east: 0 },
    collect,
    now: () => new Date("2026-10-21T08:00:00Z")
  });
  assert.deepEqual(batch.assignments.slice(2).map(({ selected_candidate_id }) => selected_candidate_id), ["a", "b"]);
});

test("fails static when every candidate lacks eligible evidence", async () => {
  const plan = buildInstanceSchedulingPlan({ environment, prompts, minimumSamples: 1, repetitions: 1 });
  await assert.rejects(() => runInstanceSchedulingPlan({
    plan,
    instances,
    model: environment.model.identifier,
    sourceRegion: "east",
    networkPathId: "fixed-test-path",
    metricsProvider: async (instance, date) => ({ ...metrics(instance, date), health: "degraded", missing_required_metrics: ["vllm:num_requests_waiting"] }),
    networkProvider: network,
    costByCandidate: { a: 1, b: 1 },
    geographyPenaltyByRegion: { east: 0 }
  }), { code: "no_eligible_candidate" });
});
