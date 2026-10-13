import { fingerprint } from "../agent-control/protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateConstraint(constraint) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(constraint?.id ?? "")) fail("constraint_id_invalid", "constraint id is invalid");
  if (!["hard", "soft"].includes(constraint.kind)) fail("constraint_kind_invalid", "constraint kind is invalid");
  if (!["passed", "failed"].includes(constraint.status)) fail("constraint_status_invalid", "constraint status is invalid");
  if (typeof constraint.description !== "string" || !constraint.description.trim()) fail("constraint_description_invalid", "constraint description is required");
  return Object.freeze(structuredClone(constraint));
}

function validateOrder(candidates) {
  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1];
    const current = candidates[index];
    if (!previous.eligible && current.eligible) fail("explanation_ranking_invalid", "eligible candidates must precede eliminated candidates");
    if (previous.eligible && current.eligible && (previous.score > current.score || (previous.score === current.score && previous.candidate_id.localeCompare(current.candidate_id) > 0))) {
      fail("explanation_ranking_invalid", "eligible candidates are not deterministically sorted");
    }
  }
}

function explainCandidate(candidate, rank) {
  if (!candidate?.candidate_id) fail("explanation_candidate_invalid", "candidate id is required");
  if (!candidate.eligible) {
    if (!Array.isArray(candidate.eliminated_reasons) || candidate.eliminated_reasons.length === 0) fail("explanation_elimination_missing", "eliminated candidate requires reasons");
    return Object.freeze({ candidate_id: candidate.candidate_id, rank: null, eligible: false, eliminated_reasons: Object.freeze([...candidate.eliminated_reasons]), final_score: null });
  }
  if (!Number.isFinite(candidate.score) || !candidate.components || !candidate.weights || !candidate.inputs) fail("explanation_score_evidence_missing", "eligible candidate requires complete score evidence");
  const contributions = Object.fromEntries(Object.keys(candidate.weights).map((key) => [key, Math.round(candidate.components[key] * candidate.weights[key] * 1_000_000) / 1_000_000]));
  return Object.freeze({
    candidate_id: candidate.candidate_id,
    rank,
    eligible: true,
    eliminated_reasons: Object.freeze([]),
    final_score: candidate.score,
    score_policy_version: candidate.score_policy_version,
    raw_inputs: Object.freeze(structuredClone(candidate.inputs)),
    normalized_components: Object.freeze(structuredClone(candidate.components)),
    weights: Object.freeze(structuredClone(candidate.weights)),
    weighted_contributions: Object.freeze(contributions),
    score_fingerprint: candidate.score_fingerprint
  });
}

export function buildDecisionExplanation({ decisionId, rankedCandidates, constraints, generatedAt = new Date(), evidenceReferences = [] }) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(decisionId ?? "")) fail("decision_id_invalid", "decision id is invalid");
  if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) fail("explanation_candidates_empty", "ranked candidates are required");
  if (!Array.isArray(constraints) || constraints.length === 0) fail("explanation_constraints_empty", "constraints are required");
  const timestamp = generatedAt instanceof Date ? generatedAt.getTime() : NaN;
  if (!Number.isFinite(timestamp)) fail("explanation_time_invalid", "generation time is invalid");
  validateOrder(rankedCandidates);
  const checkedConstraints = constraints.map(validateConstraint);
  const hardFailures = checkedConstraints.filter(({ kind, status }) => kind === "hard" && status === "failed").map(({ id }) => id);
  let rank = 0;
  const candidates = rankedCandidates.map((candidate) => explainCandidate(candidate, candidate.eligible ? ++rank : null));
  const winner = hardFailures.length === 0 ? candidates.find(({ eligible }) => eligible) ?? null : null;
  const body = {
    schema_version: "1.0.0",
    decision_id: decisionId,
    generated_at: generatedAt.toISOString(),
    selected_candidate_id: winner?.candidate_id ?? null,
    selection_basis: winner ? Object.freeze(["hard_constraints_satisfied", "lowest_deterministic_score"]) : Object.freeze(hardFailures.length ? ["hard_constraint_failed"] : ["no_eligible_candidate"]),
    hard_constraint_failures: Object.freeze(hardFailures),
    constraints: Object.freeze(checkedConstraints),
    candidates: Object.freeze(candidates),
    evidence_references: Object.freeze([...evidenceReferences])
  };
  return Object.freeze({ ...body, explanation_fingerprint: fingerprint(body) });
}
