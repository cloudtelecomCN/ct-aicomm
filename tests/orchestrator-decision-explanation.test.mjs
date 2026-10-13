import assert from "node:assert/strict";
import test from "node:test";
import { buildDecisionExplanation } from "../packages/orchestrator/decision-explanation.mjs";
import { rankCandidates } from "../packages/orchestrator/ttft-joint-score.mjs";

function candidate(id, eligible = true) {
  return { candidate_id: id, geography: { target_region: "east" }, load: { waiting_requests: id === "a" ? 1 : 5, running_requests: 10 }, network: { rtt_ms: id === "a" ? 8 : 20, packet_loss_ratio: 0.001, available_bandwidth_mbps: 1000 }, health: { instance_ready: true, metrics_status: "ready" }, eligibility: { eligible, reasons: eligible ? [] : ["metrics_stale"] } };
}
const constraints = [
  { id: "model_available", kind: "hard", status: "passed", description: "Requested model is served" },
  { id: "preferred_region", kind: "soft", status: "passed", description: "Target is in a preferred region" }
];

test("exposes candidates, elimination reasons, constraints, contributions, and final scores", () => {
  const ranked = rankCandidates([candidate("b"), candidate("a"), candidate("z", false)], { costByCandidate: { a: 5, b: 5, z: 5 }, geographyPenaltyByRegion: { east: 0.1 } });
  const explanation = buildDecisionExplanation({ decisionId: "decision-01", rankedCandidates: ranked, constraints, generatedAt: new Date("2026-10-13T14:00:00Z"), evidenceReferences: ["trace://request-01"] });
  assert.equal(explanation.selected_candidate_id, "a");
  assert.deepEqual(explanation.selection_basis, ["hard_constraints_satisfied", "lowest_deterministic_score"]);
  assert.deepEqual(explanation.candidates[0].weighted_contributions, { queue: 0.021, network: 0.02265, geography: 0.015, cost: 0.0375, health: 0 });
  assert.deepEqual(explanation.candidates.at(-1).eliminated_reasons, ["metrics_stale"]);
  assert.match(explanation.explanation_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("selects nothing when a hard constraint fails and rejects opaque ranking data", () => {
  const ranked = rankCandidates([candidate("a")], { costByCandidate: { a: 5 }, geographyPenaltyByRegion: { east: 0.1 } });
  const explanation = buildDecisionExplanation({ decisionId: "decision-02", rankedCandidates: ranked, constraints: [{ ...constraints[0], status: "failed" }] });
  assert.equal(explanation.selected_candidate_id, null);
  assert.deepEqual(explanation.hard_constraint_failures, ["model_available"]);
  assert.throws(() => buildDecisionExplanation({ decisionId: "decision-03", rankedCandidates: [{ candidate_id: "opaque", eligible: true, score: 0.2 }], constraints }), (error) => error.code === "explanation_score_evidence_missing");
});
