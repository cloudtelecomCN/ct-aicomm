import assert from "node:assert/strict";
import test from "node:test";
import { rankCandidates, scoreCandidate, TTFT_JOINT_SCORE_POLICY_V1 } from "../packages/orchestrator/ttft-joint-score.mjs";

function candidate(id, { waiting = 2, running = 10, rtt = 10, loss = 0.001, bandwidth = 1000, region = "east", eligible = true } = {}) {
  return {
    candidate_id: id,
    geography: { target_region: region },
    load: { waiting_requests: waiting, running_requests: running },
    network: { rtt_ms: rtt, packet_loss_ratio: loss, available_bandwidth_mbps: bandwidth },
    health: { instance_ready: true, metrics_status: "ready" },
    eligibility: { eligible, reasons: eligible ? [] : ["metrics_stale"] }
  };
}

test("deterministically ranks queue, network, geography, cost, and health evidence", () => {
  const ranked = rankCandidates([
    candidate("candidate-b", { waiting: 8, rtt: 30, region: "west" }),
    candidate("candidate-a", { waiting: 1, rtt: 8, region: "east" })
  ], {
    costByCandidate: { "candidate-a": 8, "candidate-b": 5 },
    geographyPenaltyByRegion: { east: 0.1, west: 0.6 }
  });
  assert.equal(ranked[0].candidate_id, "candidate-a");
  assert.deepEqual(Object.keys(ranked[0].components), ["queue", "network", "geography", "cost", "health"]);
  assert.match(ranked[0].score_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(scoreCandidate(candidate("candidate-a", { waiting: 1, rtt: 8, region: "east" }), { costPerMillionTokensUsd: 8, geographyPenalty: 0.1 }).score, ranked[0].score);
});

test("does not score ineligible candidates or invent missing evidence", () => {
  const ranked = rankCandidates([candidate("candidate-z", { eligible: false }), candidate("candidate-a")], {
    costByCandidate: { "candidate-z": 2, "candidate-a": 5 },
    geographyPenaltyByRegion: { east: 0.1 }
  });
  assert.equal(ranked.at(-1).score, null);
  assert.deepEqual(ranked.at(-1).eliminated_reasons, ["metrics_stale"]);
  assert.throws(() => scoreCandidate(candidate("candidate-a"), { geographyPenalty: 0.1 }), (error) => error.code === "cost_per_million_tokens_usd_invalid");
  assert.throws(() => scoreCandidate(candidate("candidate-a"), { costPerMillionTokensUsd: 5 }), (error) => error.code === "geography_penalty_invalid");
});

test("uses stable candidate identity to break exact score ties", () => {
  const ranked = rankCandidates([candidate("candidate-b"), candidate("candidate-a")], {
    costByCandidate: { "candidate-a": 5, "candidate-b": 5 },
    geographyPenaltyByRegion: { east: 0.1 },
    policy: TTFT_JOINT_SCORE_POLICY_V1
  });
  assert.deepEqual(ranked.map(({ candidate_id }) => candidate_id), ["candidate-a", "candidate-b"]);
});
