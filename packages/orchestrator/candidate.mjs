function requireFinite(value, name, { min = 0, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

function ageMs(timestamp, nowMs) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? Math.max(0, nowMs - time) : Infinity;
}

export function buildCandidate({ instance, metrics, network, requestedModel, sourceRegion, now = new Date(), freshnessLimitMs = 60_000 }) {
  if (!instance || !metrics || !network || !requestedModel || !sourceRegion) throw new Error("instance, metrics, network, requestedModel, and sourceRegion are required");
  if (metrics.instance !== instance.id) throw new Error("metrics instance does not match discovered instance");
  if (network.target_instance !== instance.id) throw new Error("network evidence target does not match discovered instance");

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const metricsAgeMs = ageMs(metrics.collected_at, nowMs);
  const networkAgeMs = ageMs(network.collected_at, nowMs);
  const reasons = [];

  if (!instance.ready) reasons.push("instance_not_ready");
  if (!instance.models.includes(requestedModel)) reasons.push("model_not_served");
  if (metrics.health !== "ready") reasons.push("metrics_degraded");
  if (metricsAgeMs > freshnessLimitMs) reasons.push("metrics_stale");
  if (networkAgeMs > freshnessLimitMs) reasons.push("network_evidence_stale");
  if (metrics.queue.waiting_requests === null || metrics.queue.running_requests === null || metrics.cache.kv_usage_ratio === null) reasons.push("load_evidence_incomplete");

  return Object.freeze({
    schema_version: "1.0.0",
    candidate_id: instance.id,
    endpoint: instance.endpoint,
    model: requestedModel,
    geography: Object.freeze({ source_region: sourceRegion, target_region: instance.region, target_zone: instance.zone }),
    health: Object.freeze({ instance_ready: instance.ready, metrics_status: metrics.health }),
    load: Object.freeze({
      waiting_requests: metrics.queue.waiting_requests,
      running_requests: metrics.queue.running_requests,
      kv_cache_usage_ratio: metrics.cache.kv_usage_ratio
    }),
    network: Object.freeze({
      rtt_ms: requireFinite(network.rtt_ms, "network.rtt_ms"),
      packet_loss_ratio: requireFinite(network.packet_loss_ratio, "network.packet_loss_ratio", { max: 1 }),
      available_bandwidth_mbps: requireFinite(network.available_bandwidth_mbps, "network.available_bandwidth_mbps"),
      source: network.source
    }),
    evidence: Object.freeze({
      metrics_collected_at: metrics.collected_at,
      metrics_age_ms: metricsAgeMs,
      network_collected_at: network.collected_at,
      network_age_ms: networkAgeMs,
      freshness_limit_ms: freshnessLimitMs,
      metrics_missing: Object.freeze([...metrics.missing_required_metrics])
    }),
    eligibility: Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons) })
  });
}

export function buildCandidateSet(inputs) {
  const candidates = inputs.map(buildCandidate).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const ids = new Set();
  for (const candidate of candidates) {
    if (ids.has(candidate.candidate_id)) throw new Error(`duplicate candidate: ${candidate.candidate_id}`);
    ids.add(candidate.candidate_id);
  }
  return Object.freeze(candidates);
}
