import { fingerprint } from "../agent-control/protocol.mjs";

const DEFAULT_POLICY = Object.freeze({
  version: "1.0.0",
  weights: Object.freeze({ queue: 0.3, network: 0.3, geography: 0.15, cost: 0.15, health: 0.1 }),
  ceilings: Object.freeze({ waiting_requests: 20, running_requests: 100, rtt_ms: 100, packet_loss_ratio: 0.02, minimum_bandwidth_mbps: 100, cost_per_million_tokens_usd: 20 })
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function finite(value, field, { min = 0, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) fail(`${field}_invalid`, `${field} must be between ${min} and ${max}`);
  return value;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function validatePolicy(policy) {
  if (policy.version !== "1.0.0") fail("score_policy_version_invalid", "score policy v1 is required");
  const weightSum = Object.values(policy.weights).reduce((sum, value) => sum + finite(value, "score_weight", { max: 1 }), 0);
  if (Math.abs(weightSum - 1) > 1e-9) fail("score_weights_invalid", "score weights must sum to one");
  for (const [key, value] of Object.entries(policy.ceilings)) finite(value, `score_ceiling_${key}`, { min: Number.EPSILON });
  return policy;
}

export function scoreCandidate(candidate, { costPerMillionTokensUsd, geographyPenalty, policy = DEFAULT_POLICY } = {}) {
  validatePolicy(policy);
  if (!candidate?.candidate_id) fail("score_candidate_invalid", "candidate is required");
  if (!candidate.eligibility?.eligible) {
    return Object.freeze({ candidate_id: candidate.candidate_id, eligible: false, score: null, eliminated_reasons: Object.freeze([...(candidate.eligibility?.reasons ?? [])]) });
  }
  const c = policy.ceilings;
  const waiting = finite(candidate.load.waiting_requests, "waiting_requests");
  const running = finite(candidate.load.running_requests, "running_requests");
  const rtt = finite(candidate.network.rtt_ms, "rtt_ms");
  const loss = finite(candidate.network.packet_loss_ratio, "packet_loss_ratio", { max: 1 });
  const bandwidth = finite(candidate.network.available_bandwidth_mbps, "available_bandwidth_mbps", { min: Number.EPSILON });
  const cost = finite(costPerMillionTokensUsd, "cost_per_million_tokens_usd");
  const geography = finite(geographyPenalty, "geography_penalty", { max: 1 });

  const components = Object.freeze({
    queue: round(0.6 * clamp(waiting / c.waiting_requests) + 0.4 * clamp(running / c.running_requests)),
    network: round(0.6 * clamp(rtt / c.rtt_ms) + 0.25 * clamp(loss / c.packet_loss_ratio) + 0.15 * clamp(c.minimum_bandwidth_mbps / bandwidth)),
    geography: round(geography),
    cost: round(clamp(cost / c.cost_per_million_tokens_usd)),
    health: candidate.health.instance_ready && candidate.health.metrics_status === "ready" ? 0 : 1
  });
  const score = round(Object.entries(policy.weights).reduce((sum, [key, weight]) => sum + components[key] * weight, 0));
  const evidence = {
    candidate_id: candidate.candidate_id,
    score_policy_version: policy.version,
    score,
    components,
    weights: policy.weights,
    inputs: { waiting_requests: waiting, running_requests: running, rtt_ms: rtt, packet_loss_ratio: loss, available_bandwidth_mbps: bandwidth, geography_penalty: geography, cost_per_million_tokens_usd: cost }
  };
  return Object.freeze({ eligible: true, ...evidence, score_fingerprint: fingerprint(evidence) });
}

export function rankCandidates(candidates, { costByCandidate, geographyPenaltyByRegion, policy = DEFAULT_POLICY } = {}) {
  if (!costByCandidate || !geographyPenaltyByRegion) fail("score_context_missing", "cost and geography evidence are required");
  const scored = candidates.map((candidate) => scoreCandidate(candidate, {
    costPerMillionTokensUsd: costByCandidate[candidate.candidate_id],
    geographyPenalty: geographyPenaltyByRegion[candidate.geography.target_region],
    policy
  }));
  scored.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.score === null && b.score === null) return a.candidate_id.localeCompare(b.candidate_id);
    return a.score - b.score || a.candidate_id.localeCompare(b.candidate_id);
  });
  return Object.freeze(scored);
}

export { DEFAULT_POLICY as TTFT_JOINT_SCORE_POLICY_V1 };
