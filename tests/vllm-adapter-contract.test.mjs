import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runConnectorContract } from "../packages/connector-sdk/index.mjs";
import { createVllmConnectorAdapter } from "../packages/vllm-connector/adapter.mjs";
import { discoverStatic } from "../packages/vllm-connector/discovery.mjs";

const completeMetrics = `
vllm:num_requests_waiting 1
vllm:num_requests_running 2
vllm:kv_cache_usage_perc 0.4
vllm:time_to_first_token_seconds_sum 0.6
vllm:time_to_first_token_seconds_count 3
vllm:request_queue_time_seconds_sum 0.15
vllm:request_queue_time_seconds_count 3
vllm:request_inference_time_seconds_sum 0.3
vllm:request_inference_time_seconds_count 3
`;

test("the vLLM adapter passes the same public connector contract", async () => {
  const manifest = JSON.parse(await readFile(new URL("../examples/connectors/vllm-instances.json", import.meta.url), "utf8"));
  const adapter = createVllmConnectorAdapter({
    discover: async () => discoverStatic(manifest),
    loadMetrics: async () => ({
      text: completeMetrics,
      vllm_version: "0.31.0",
      collected_at: "2026-10-21T08:00:05.000Z",
      data_origin: "synthetic",
      source: "embedded-prometheus-contract-fixture",
      limitations: ["Prometheus fixture only; no vLLM service was contacted."]
    })
  });
  const report = await runConnectorContract(adapter);
  assert.equal(report.passed, true);
  assert.equal(report.adapter.id, "vllm-openai");
  assert.deepEqual(report.data_origins, ["synthetic"]);
});

test("vLLM adapter requires explicit evidence metadata", async () => {
  const manifest = JSON.parse(await readFile(new URL("../examples/connectors/vllm-instances.json", import.meta.url), "utf8"));
  const adapter = createVllmConnectorAdapter({
    discover: async () => discoverStatic(manifest),
    loadMetrics: async () => ({ text: completeMetrics, vllm_version: "0.31.0", collected_at: "2026-10-21T08:00:05.000Z" })
  });
  await assert.rejects(() => runConnectorContract(adapter), { code: "metrics_origin_invalid" });
});

test("vLLM adapter never substitutes the current time for missing collection evidence", async () => {
  const manifest = JSON.parse(await readFile(new URL("../examples/connectors/vllm-instances.json", import.meta.url), "utf8"));
  const adapter = createVllmConnectorAdapter({
    discover: async () => discoverStatic(manifest),
    loadMetrics: async () => ({
      text: completeMetrics,
      vllm_version: "0.31.0",
      data_origin: "synthetic",
      source: "fixture",
      limitations: ["Synthetic fixture only."]
    })
  });
  await assert.rejects(() => runConnectorContract(adapter), { code: "vllm_adapter_configuration_invalid" });
});
