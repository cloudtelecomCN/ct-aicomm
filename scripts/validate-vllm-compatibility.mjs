import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../specs/connectors/vllm-compatibility-v1.json", import.meta.url);
const matrix = JSON.parse(await readFile(path, "utf8"));

assert.equal(matrix.schema_version, "1.0.0");
assert.equal(matrix.connector, "vllm-openai");
assert.match(matrix.support_policy.primary, /^\d+\.\d+\.x$/);
assert.ok(matrix.support_policy.compatible.length > 0);
assert.equal(matrix.request_measurement.ttft_source, "client_monotonic_stream_timestamps");
assert.equal(matrix.request_measurement.prometheus_histograms_are_per_request, false);
assert.equal(matrix.request_measurement.required_request_mode.stream, true);

const names = new Set(matrix.metrics.map((metric) => metric.prometheus_name));
for (const required of [
  "vllm:time_to_first_token_seconds",
  "vllm:request_queue_time_seconds",
  "vllm:request_inference_time_seconds"
]) {
  assert.ok(names.has(required), `missing metric mapping: ${required}`);
  assert.equal(matrix.metrics.find((metric) => metric.prometheus_name === required).requirement, "required");
}

assert.match(matrix.readiness.execution_rule, /never receive automatic route changes/);
assert.ok(matrix.sources.every((source) => source.startsWith("https://")));
console.log("vLLM compatibility matrix v1 is valid.");
