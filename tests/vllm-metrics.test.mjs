import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVllmMetrics, parsePrometheus } from "../packages/vllm-connector/metrics.mjs";

const completeMetrics = `
# TYPE vllm:num_requests_waiting gauge
vllm:num_requests_waiting{model_name="demo",engine="0"} 2
vllm:num_requests_waiting{model_name="demo",engine="1"} 3
vllm:num_requests_running{model_name="demo",engine="0"} 4
vllm:kv_cache_usage_perc{model_name="demo",engine="0"} 0.6
vllm:kv_cache_usage_perc{model_name="demo",engine="1"} 0.8
vllm:time_to_first_token_seconds_sum{model_name="demo"} 12
vllm:time_to_first_token_seconds_count{model_name="demo"} 4
vllm:request_queue_time_seconds_sum{model_name="demo"} 2
vllm:request_queue_time_seconds_count{model_name="demo"} 4
vllm:request_inference_time_seconds_sum{model_name="demo"} 8
vllm:request_inference_time_seconds_count{model_name="demo"} 4
`;

test("parses namespaced Prometheus metrics and labels", () => {
  const samples = parsePrometheus(completeMetrics);
  assert.equal(samples[0].name, "vllm:num_requests_waiting");
  assert.equal(samples[0].labels.model_name, "demo");
});

test("normalizes queue, cache, and aggregate latency evidence", () => {
  const snapshot = normalizeVllmMetrics(completeMetrics, { instance: "vllm-a", version: "0.31.0", collectedAt: "2026-10-13T04:00:00Z" });
  assert.equal(snapshot.health, "ready");
  assert.deepEqual(snapshot.missing_required_metrics, []);
  assert.equal(snapshot.queue.waiting_requests, 5);
  assert.equal(snapshot.queue.running_requests, 4);
  assert.equal(snapshot.cache.kv_usage_ratio, 0.8);
  assert.equal(snapshot.latency_aggregate_seconds.ttft_mean, 3);
  assert.equal(snapshot.latency_aggregate_seconds.queue_mean, 0.5);
  assert.equal(snapshot.latency_aggregate_seconds.inference_mean, 2);
  assert.equal(snapshot.evidence.per_request_correlation_allowed, false);
});

test("degrades and leaves absent values null instead of inventing zeros", () => {
  const snapshot = normalizeVllmMetrics("vllm:num_requests_running 1\n", { instance: "vllm-b", version: "0.31.0" });
  assert.equal(snapshot.health, "degraded");
  assert.ok(snapshot.missing_required_metrics.includes("vllm:num_requests_waiting"));
  assert.equal(snapshot.queue.waiting_requests, null);
  assert.equal(snapshot.cache.kv_usage_ratio, null);
  assert.equal(snapshot.latency_aggregate_seconds.ttft_mean, null);
});
