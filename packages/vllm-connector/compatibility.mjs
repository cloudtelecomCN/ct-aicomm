import { normalizeVllmMetrics } from "./metrics.mjs";

const REQUIRED_METRICS = Object.freeze([
  "vllm:num_requests_waiting",
  "vllm:num_requests_running",
  "vllm:kv_cache_usage_perc",
  "vllm:time_to_first_token_seconds",
  "vllm:request_queue_time_seconds",
  "vllm:request_inference_time_seconds"
]);

export function classifyVllmVersion(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    return Object.freeze({ version: version ?? "unknown", support: "unknown", automatic_execution_allowed: false, reason: "version_unavailable" });
  }
  const [major, minor] = version.split(".").map(Number);
  if (major === 0 && minor === 31) return Object.freeze({ version, support: "primary", automatic_execution_allowed: true, reason: null });
  if (major === 0 && minor === 30) return Object.freeze({ version, support: "compatible", automatic_execution_allowed: true, reason: null });
  if (major === 0 && minor === 29) return Object.freeze({ version, support: "probe_only", automatic_execution_allowed: false, reason: "version_probe_only" });
  return Object.freeze({ version, support: "unsupported", automatic_execution_allowed: false, reason: "version_outside_support_policy" });
}

export function evaluateVllmCompatibility({ version, metricsText, interfaces = {} }) {
  const versionResult = classifyVllmVersion(version);
  const checks = {
    version: versionResult,
    metrics: { checked: false, complete: false, missing_required_metrics: [...REQUIRED_METRICS] },
    streaming: {
      endpoint_healthy: interfaces.streaming_endpoint_healthy === true,
      valid_framing: interfaces.valid_stream_framing === true,
      first_non_empty_delta: interfaces.first_non_empty_delta === true
    },
    model_discovery: { endpoint_healthy: interfaces.models_endpoint_healthy === true }
  };

  if (!checks.streaming.endpoint_healthy || !checks.streaming.valid_framing || !checks.streaming.first_non_empty_delta) {
    return result("incompatible", false, "streaming_contract_failed", checks, null);
  }
  if (versionResult.support === "unsupported") return result("incompatible", false, versionResult.reason, checks, null);
  if (versionResult.support === "unknown") return result("degraded", false, versionResult.reason, checks, null);

  const metrics = normalizeVllmMetrics(metricsText ?? "", { version });
  checks.metrics = {
    checked: true,
    complete: metrics.missing_required_metrics.length === 0,
    missing_required_metrics: metrics.missing_required_metrics
  };
  if (versionResult.support === "probe_only") return result("degraded", false, versionResult.reason, checks, metrics);
  if (!checks.metrics.complete) return result("degraded", false, "required_metrics_missing", checks, metrics);
  return result("ready", true, null, checks, metrics);
}

function result(readiness, automaticExecutionAllowed, reason, checks, metrics) {
  return Object.freeze({
    schema_version: "1.0.0",
    connector: "vllm-openai",
    readiness,
    automatic_execution_allowed: automaticExecutionAllowed,
    reason,
    checks: Object.freeze(checks),
    metrics
  });
}
