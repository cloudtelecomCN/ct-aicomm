import assert from "node:assert/strict";
import test from "node:test";
import synthetic from "../examples/poc/synthetic-environment-freeze.json" with { type: "json" };
import { buildNetworkPathPlan, runNetworkPathPlan } from "../packages/poc/network-path-experiment.mjs";

const environment = { ...synthetic, freeze_id: "measured-network-fixture", evidence_origin: "measured", load_profile: { ...synthetic.load_profile, concurrency: [1, 2] } };
const prompts = [{ id: "p1", class: "short", prompt: "hello" }, { id: "p2", class: "long", prompt: "explain" }];

test("builds a fixed-instance network-only plan", () => {
  const plan = buildNetworkPathPlan({ environment, prompts, fixedInstanceId: "instance-b", baselineRouteId: "tunnel", candidateRouteId: "private-vpc", policyRevision: 7, minimumSamples: 8, repetitions: 2 });
  assert.equal(plan.group, "network_only");
  assert.equal(plan.fixed_instance_id, "instance-b");
  assert.deepEqual(plan.requests.map(({ repetition, concurrency }) => [repetition, concurrency]), [[1, 1], [1, 1], [1, 2], [1, 2], [2, 1], [2, 1], [2, 2], [2, 2]]);
  assert.throws(() => buildNetworkPathPlan({ environment, prompts, fixedInstanceId: "instance-b", baselineRouteId: "same", candidateRouteId: "same", policyRevision: 1 }), { code: "network_route_unchanged" });
});

test("executes each network stratum with bounded concurrency and route evidence", async () => {
  const active = { value: 0, max: 0 };
  const collect = async ({ sampleId, environmentFingerprint }) => {
    active.value += 1;
    active.max = Math.max(active.max, active.value);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active.value -= 1;
    return { sample_id: sampleId, outcome: { success: true }, segments: { ttft_ms: 1 }, evidence: { environment_fingerprint: environmentFingerprint } };
  };
  const plan = buildNetworkPathPlan({ environment, prompts, fixedInstanceId: "instance-b", baselineRouteId: "tunnel", candidateRouteId: "private-vpc", policyRevision: 7, minimumSamples: 8, repetitions: 2 });
  const batch = await runNetworkPathPlan({ plan, endpoint: "http://fixed.invalid", model: environment.model.identifier, collect });
  assert.equal(active.max, 2);
  assert.equal(batch.success_count, 8);
  assert.ok(batch.assignments.every(({ fixed_instance_id, route_id, policy_revision }) => fixed_instance_id === "instance-b" && route_id === "private-vpc" && policy_revision === 7));
});
