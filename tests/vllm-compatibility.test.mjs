import assert from "node:assert/strict";
import test from "node:test";
import { classifyVllmVersion, evaluateVllmCompatibility } from "../packages/vllm-connector/compatibility.mjs";

const metrics = `
vllm:num_requests_waiting 0
vllm:num_requests_running 1
vllm:kv_cache_usage_perc 0.2
vllm:time_to_first_token_seconds_sum 1
vllm:time_to_first_token_seconds_count 2
vllm:request_queue_time_seconds_sum 0.2
vllm:request_queue_time_seconds_count 2
vllm:request_inference_time_seconds_sum 0.8
vllm:request_inference_time_seconds_count 2
`;
const interfaces = { streaming_endpoint_healthy: true, valid_stream_framing: true, first_non_empty_delta: true, models_endpoint_healthy: true };

test("classifies every frozen support range", () => {
  assert.equal(classifyVllmVersion("0.31.0").support, "primary");
  assert.equal(classifyVllmVersion("0.30.9").support, "compatible");
  assert.equal(classifyVllmVersion("0.29.4").support, "probe_only");
  assert.equal(classifyVllmVersion("0.28.9").support, "unsupported");
  assert.equal(classifyVllmVersion("0.32.0").support, "unsupported");
  assert.equal(classifyVllmVersion("unknown").support, "unknown");
});

test("accepts primary and compatible versions only with complete interfaces and metrics", () => {
  for (const version of ["0.31.0", "0.30.8"]) {
    const result = evaluateVllmCompatibility({ version, metricsText: metrics, interfaces });
    assert.equal(result.readiness, "ready");
    assert.equal(result.automatic_execution_allowed, true);
  }
});

test("probe-only, unknown, and incomplete metrics fail static", () => {
  const probeOnly = evaluateVllmCompatibility({ version: "0.29.7", metricsText: metrics, interfaces });
  assert.equal(probeOnly.readiness, "degraded");
  assert.equal(probeOnly.automatic_execution_allowed, false);
  const unknown = evaluateVllmCompatibility({ version: "unknown", metricsText: metrics, interfaces });
  assert.equal(unknown.readiness, "degraded");
  assert.equal(unknown.metrics, null);
  const incomplete = evaluateVllmCompatibility({ version: "0.31.0", metricsText: "vllm:num_requests_running 1\n", interfaces });
  assert.equal(incomplete.readiness, "degraded");
  assert.equal(incomplete.reason, "required_metrics_missing");
  assert.equal(incomplete.automatic_execution_allowed, false);
});

test("unsupported versions and invalid streaming framing are incompatible", () => {
  for (const version of ["0.28.9", "0.32.0", "1.0.0"]) {
    const result = evaluateVllmCompatibility({ version, metricsText: metrics, interfaces });
    assert.equal(result.readiness, "incompatible");
    assert.equal(result.automatic_execution_allowed, false);
  }
  const invalidStream = evaluateVllmCompatibility({ version: "0.31.0", metricsText: metrics, interfaces: { ...interfaces, valid_stream_framing: false } });
  assert.equal(invalidStream.readiness, "incompatible");
  assert.equal(invalidStream.reason, "streaming_contract_failed");
});
