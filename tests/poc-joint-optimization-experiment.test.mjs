import assert from "node:assert/strict";
import test from "node:test";
import synthetic from "../examples/poc/synthetic-environment-freeze.json" with { type: "json" };
import { buildJointOptimizationPlan, runJointOptimizationPlan } from "../packages/poc/joint-optimization-experiment.mjs";

const environment = { ...synthetic, freeze_id: "measured-joint-fixture", evidence_origin: "measured", load_profile: { ...synthetic.load_profile, concurrency: [1, 2] } };
const prompts = [{ id: "p1", class: "short", prompt: "hello" }, { id: "p2", class: "long", prompt: "explain" }];
const instances = ["a", "b"].map((id) => ({ id, endpoint: `http://${id}.invalid`, region: "same", zone: id, models: [environment.model.identifier], ready: true }));
const routes = { a: { route_id: "route-a", logical_endpoint: "http://127.0.0.1:18000" }, b: { route_id: "route-b", logical_endpoint: "http://127.0.0.1:18001" } };
const metricsProvider = async (instance, date) => ({ schema_version: "1.0.0", instance: instance.id, connector: "vllm", connector_version: "0.1.0", vllm_version: "0.31.0", collected_at: date.toISOString(), health: "ready", missing_required_metrics: [], queue: { waiting_requests: instance.id === "a" ? 10 : 0, running_requests: instance.id === "a" ? 10 : 0 }, cache: { kv_usage_ratio: 0 }, latency: {} });
const networkProvider = async (instance, date) => ({ target_instance: instance.id, collected_at: date.toISOString(), rtt_ms: instance.id === "a" ? 1 : 20, packet_loss_ratio: 0, available_bandwidth_mbps: 1000, source: "measured-test" });

test("builds a deterministic joint plan with a data-plane revision", () => {
  const plan = buildJointOptimizationPlan({ environment, prompts, policyRevision: 4, minimumSamples: 8, repetitions: 2 });
  assert.equal(plan.group, "joint_optimization");
  assert.equal(plan.network_policy, "ebpf_redirect");
  assert.equal(plan.requests.length, 8);
  assert.throws(() => buildJointOptimizationPlan({ environment, prompts, policyRevision: 0 }), { code: "policy_revision_invalid" });
});

test("selects a candidate and executes its versioned logical route", async () => {
  const plan = buildJointOptimizationPlan({ environment, prompts, policyRevision: 4, minimumSamples: 8, repetitions: 2 });
  const endpoints = [];
  const collect = async ({ endpoint, sampleId }) => { endpoints.push(endpoint); return { sample_id: sampleId, outcome: { success: true }, segments: { ttft_ms: 1 } }; };
  const batch = await runJointOptimizationPlan({ plan, instances, model: environment.model.identifier, sourceRegion: "same", metricsProvider, networkProvider, routeByCandidate: routes, costByCandidate: { a: 1, b: 1 }, geographyPenaltyByRegion: { same: 0 }, collect });
  assert.equal(batch.success_count, 8);
  assert.ok(batch.assignments.every(({ route_id, policy_revision }) => ["route-a", "route-b"].includes(route_id) && policy_revision === 4));
  assert.ok(endpoints.every((endpoint) => [routes.a.logical_endpoint, routes.b.logical_endpoint].includes(endpoint)));
});

test("fails static when a candidate route is missing", async () => {
  const plan = buildJointOptimizationPlan({ environment, prompts, policyRevision: 4, minimumSamples: 2, repetitions: 1 });
  await assert.rejects(() => runJointOptimizationPlan({ plan, instances, model: environment.model.identifier, sourceRegion: "same", metricsProvider, networkProvider, routeByCandidate: { a: routes.a }, costByCandidate: { a: 1, b: 1 }, geographyPenaltyByRegion: { same: 0 } }), { code: "route_mapping_missing" });
});
