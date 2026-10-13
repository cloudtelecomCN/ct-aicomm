const REQUIRED = Object.freeze([
  "vllm:num_requests_waiting",
  "vllm:num_requests_running",
  "vllm:kv_cache_usage_perc",
  "vllm:time_to_first_token_seconds",
  "vllm:request_queue_time_seconds",
  "vllm:request_inference_time_seconds"
]);

function parseLabels(text = "") {
  const labels = {};
  for (const match of text.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g)) labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return labels;
}

export function parsePrometheus(text) {
  const samples = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^\s{]+)(?:\{([^}]*)\})?\s+([^\s]+)(?:\s+(\d+))?$/);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    samples.push({ name: match[1], labels: parseLabels(match[2]), value, timestamp_ms: match[4] ? Number(match[4]) : null });
  }
  return samples;
}

function sum(samples, name) {
  const matches = samples.filter((sample) => sample.name === name);
  return matches.length ? matches.reduce((total, sample) => total + sample.value, 0) : null;
}

function averageHistogram(samples, baseName) {
  const total = sum(samples, `${baseName}_sum`);
  const count = sum(samples, `${baseName}_count`);
  return total === null || !count ? null : total / count;
}

export function normalizeVllmMetrics(text, options = {}) {
  const samples = parsePrometheus(text);
  const names = new Set(samples.map(({ name }) => name.replace(/_(?:bucket|sum|count)$/, "")));
  const missing = REQUIRED.filter((name) => !names.has(name));
  const kvValues = samples.filter(({ name }) => name === "vllm:kv_cache_usage_perc").map(({ value }) => value);
  const kvCacheUsage = kvValues.length ? Math.max(...kvValues) : null;

  return {
    schema_version: "1.0.0",
    connector: "vllm-openai",
    instance: options.instance ?? "unknown",
    vllm_version: options.version ?? "unknown",
    collected_at: options.collectedAt ?? new Date().toISOString(),
    health: missing.length === 0 ? "ready" : "degraded",
    missing_required_metrics: missing,
    queue: {
      waiting_requests: sum(samples, "vllm:num_requests_waiting"),
      running_requests: sum(samples, "vllm:num_requests_running")
    },
    cache: { kv_usage_ratio: kvCacheUsage },
    latency_aggregate_seconds: {
      ttft_mean: averageHistogram(samples, "vllm:time_to_first_token_seconds"),
      queue_mean: averageHistogram(samples, "vllm:request_queue_time_seconds"),
      inference_mean: averageHistogram(samples, "vllm:request_inference_time_seconds")
    },
    evidence: {
      raw_sample_count: samples.length,
      aggregate_only: true,
      per_request_correlation_allowed: false
    }
  };
}
