import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { discoverEndpointSlices, discoverStatic, mergeDiscoverySources } from "../packages/vllm-connector/discovery.mjs";

test("discovers and validates a static instance manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../examples/connectors/vllm-instances.json", import.meta.url), "utf8"));
  const [instance] = discoverStatic(manifest);
  assert.equal(instance.source, "static");
  assert.equal(instance.ready, true);
  assert.deepEqual(instance.models, ["synthetic/model-not-real"]);
});

test("discovers only ready Kubernetes EndpointSlice addresses", () => {
  const list = {
    kind: "EndpointSliceList",
    items: [{
      metadata: {
        name: "vllm-a",
        namespace: "inference",
        resourceVersion: "42",
        labels: { "ct-aicomm.cloudtelecom.cn/discovery": "vllm", "kubernetes.io/service-name": "vllm", "topology.kubernetes.io/region": "cn-test-1" },
        annotations: { "ct-aicomm.cloudtelecom.cn/models": "model-a, model-b" }
      },
      ports: [{ name: "http", port: 8000 }, { name: "metrics", port: 9090 }],
      endpoints: [
        { addresses: ["10.0.0.2"], conditions: { ready: true }, zone: "a", targetRef: { uid: "pod-a" } },
        { addresses: ["10.0.0.3"], conditions: { ready: false }, zone: "b", targetRef: { uid: "pod-b" } }
      ]
    }]
  };
  const instances = discoverEndpointSlices(list, { discoveredAt: "2026-10-13T05:00:00Z" });
  assert.equal(instances.length, 1);
  assert.equal(instances[0].endpoint, "http://10.0.0.2:8000");
  assert.equal(instances[0].metrics_endpoint, "http://10.0.0.2:9090/metrics");
  assert.deepEqual(instances[0].models, ["model-a", "model-b"]);
});

test("rejects conflicting identities across discovery sources", () => {
  const base = Object.freeze({ id: "same", source: "static", endpoint: "http://a.test", metrics_endpoint: "http://a.test/metrics", region: "a", zone: null, models: Object.freeze(["m"]), ready: true, discovered_at: null, source_revision: null });
  assert.throws(() => mergeDiscoverySources([base], [{ ...base, endpoint: "http://b.test" }]), (error) => error.code === "instance_conflict");
});
