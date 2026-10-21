import { readFile } from "node:fs/promises";
import { normalizeNetworkTelemetry, normalizeVllmMetrics } from "../../sdk/index.mjs";

const telemetry = JSON.parse(await readFile(new URL("../agent/network-telemetry.json", import.meta.url), "utf8"));
const normalizedTelemetry = normalizeNetworkTelemetry(telemetry);
const normalizedMetrics = normalizeVllmMetrics(`
vllm:num_requests_waiting 0
vllm:num_requests_running 1
vllm:kv_cache_usage_perc 0.25
vllm:time_to_first_token_seconds_sum 0.5
vllm:time_to_first_token_seconds_count 2
vllm:request_queue_time_seconds_sum 0.1
vllm:request_queue_time_seconds_count 2
vllm:request_inference_time_seconds_sum 0.4
vllm:request_inference_time_seconds_count 2
`, { instance: "synthetic-vllm-example", version: "0.31.0", collectedAt: "2026-10-21T00:00:00Z" });

process.stdout.write(`${JSON.stringify({
  data_origin: "synthetic",
  telemetry: normalizedTelemetry,
  metrics: normalizedMetrics,
  performance_claim_allowed: false
}, null, 2)}\n`);
