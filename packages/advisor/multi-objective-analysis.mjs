import { createHash } from "node:crypto";
import { validateAdvisorDataGateResult } from "./data-gate-constraints.mjs";

export const MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION = "1.0.0";
export const MULTI_OBJECTIVE_METHOD_VERSION = "1.0.0";

const METRICS = [
  ["monthly_cost", "cost", "minimize", "cny_per_month", 0, 1_000_000_000_000],
  ["estimated_ttft", "performance", "minimize", "milliseconds", 0, 86_400_000],
  ["estimated_throughput", "performance", "maximize", "tokens_per_second", 0, 1_000_000_000_000],
  ["network_latency", "network", "minimize", "milliseconds", 0, 86_400_000],
  ["network_bandwidth", "network", "maximize", "gigabits_per_second", 0, 1_000_000],
  ["network_packet_loss", "network", "minimize", "percent", 0, 100],
  ["delivery_lead_time", "delivery", "minimize", "days", 0, 36_500],
  ["compliance_coverage", "compliance", "maximize", "ratio", 0, 1],
  ["evidence_confidence", "evidence", "maximize", "ratio", 0, 1],
  ["risk_score", "risk", "minimize", "ratio", 0, 1],
].map(([metric_id, objective_group, direction, unit, minimum, maximum]) => ({
  metric_id, objective_group, direction, unit, minimum, maximum,
}));

const SCENARIO_WEIGHTS = {
  cost_first: [4500, 500, 300, 300, 200, 200, 1500, 800, 700, 1000],
  performance_first: [1000, 2200, 2200, 1500, 1100, 500, 300, 400, 400, 400],
  balanced: [1500, 1200, 1200, 1000, 800, 500, 800, 1100, 900, 1000],
  compliance_first: [800, 400, 300, 400, 300, 300, 500, 3500, 1500, 2000],
};

export const MULTI_OBJECTIVE_METHOD_V1 = Object.freeze({
  schema_version: MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION,
  method_id: "ct-advisor-multi-objective-analysis",
  method_version: MULTI_OBJECTIVE_METHOD_VERSION,
  score_precision: 9,
  metrics: METRICS,
  scenarios: Object.entries(SCENARIO_WEIGHTS).map(([scenario_id, values]) => ({
    scenario_id,
    weights: METRICS.map(({ metric_id }, index) => ({ metric_id, weight_basis_points: values[index] })),
  })),
  sensitivity: {
    mode: "one_at_a_time_weight_delta",
    delta_basis_points: 1000,
  },
  boundaries: {
    data_gate_required: true,
    same_frozen_input_across_scenarios: true,
    unknowns_imputed: false,
    recommendation_read_only: true,
    human_decision_recorded: false,
    execution_authorized: false,
    performance_claim_allowed: false,
    global_optimum_claimed: false,
    paid_capability_required: false,
  },
});

const METHOD_KEYS = new Set(["schema_version", "method_id", "method_version", "score_precision", "metrics", "scenarios", "sensitivity", "boundaries"]);
const METRIC_KEYS = new Set(["metric_id", "objective_group", "direction", "unit", "minimum", "maximum"]);
const SCENARIO_KEYS = new Set(["scenario_id", "weights"]);
const WEIGHT_KEYS = new Set(["metric_id", "weight_basis_points"]);
const SENSITIVITY_KEYS = new Set(["mode", "delta_basis_points"]);
const BOUNDARY_KEYS = new Set(["data_gate_required", "same_frozen_input_across_scenarios", "unknowns_imputed", "recommendation_read_only", "human_decision_recorded", "execution_authorized", "performance_claim_allowed", "global_optimum_claimed", "paid_capability_required"]);
const OBSERVATION_SET_KEYS = new Set(["combination_id", "metrics"]);
const OBSERVATION_KEYS = new Set(["metric_id", "status", "value", "unit", "source"]);
const SOURCE_KEYS = new Set(["kind", "confidence", "observed_at", "reference", "content_sha256"]);
const SOURCE_KINDS = new Set(["measured", "vendor", "calculated", "declared", "synthetic", "unknown"]);
const SOURCE_CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);
const REQUIRED_SCENARIOS = new Set(["cost_first", "performance_first", "balanced", "compliance_first"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_invalid`, `${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${label}_field_unknown`, `${label} contains unknown field ${unknown}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function round(value, precision) {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function validTimestamp(value) {
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

export function computeMultiObjectiveSha256(value) {
  return sha256(value);
}

export function validateMultiObjectiveMethod(method = MULTI_OBJECTIVE_METHOD_V1) {
  exactKeys(method, METHOD_KEYS, "analysis_method");
  exactKeys(method.sensitivity, SENSITIVITY_KEYS, "analysis_sensitivity");
  exactKeys(method.boundaries, BOUNDARY_KEYS, "analysis_boundaries");
  if (method.schema_version !== MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION
    || method.method_id !== "ct-advisor-multi-objective-analysis"
    || method.method_version !== MULTI_OBJECTIVE_METHOD_VERSION
    || method.score_precision !== 9) fail("analysis_method_unsupported", "unsupported multi-objective analysis method");
  const expectedMetricIds = new Set(METRICS.map(({ metric_id }) => metric_id));
  if (!Array.isArray(method.metrics) || method.metrics.length !== METRICS.length) fail("analysis_metrics_invalid", "the frozen metric registry is required");
  const metricIds = new Set();
  for (const metric of method.metrics) {
    exactKeys(metric, METRIC_KEYS, "analysis_metric");
    const frozen = METRICS.find(({ metric_id }) => metric_id === metric.metric_id);
    if (!frozen || canonicalize(metric) !== canonicalize(frozen) || metricIds.has(metric.metric_id)) fail("analysis_metric_invalid", `metric ${metric.metric_id ?? "unknown"} is not the frozen definition`);
    metricIds.add(metric.metric_id);
  }
  if (!sameSet(metricIds, expectedMetricIds)) fail("analysis_metrics_invalid", "the complete frozen metric registry is required");
  if (!Array.isArray(method.scenarios) || method.scenarios.length !== REQUIRED_SCENARIOS.size) fail("analysis_scenarios_invalid", "four frozen scenarios are required");
  const scenarioIds = new Set();
  for (const scenario of method.scenarios) {
    exactKeys(scenario, SCENARIO_KEYS, "analysis_scenario");
    if (!REQUIRED_SCENARIOS.has(scenario.scenario_id) || scenarioIds.has(scenario.scenario_id)) fail("analysis_scenario_invalid", "scenario identifiers must be unique and frozen");
    if (!Array.isArray(scenario.weights) || scenario.weights.length !== metricIds.size) fail("analysis_weights_invalid", "every scenario must weight every metric");
    const weightIds = new Set();
    let total = 0;
    for (const weight of scenario.weights) {
      exactKeys(weight, WEIGHT_KEYS, "analysis_weight");
      if (!metricIds.has(weight.metric_id) || weightIds.has(weight.metric_id) || !Number.isSafeInteger(weight.weight_basis_points) || weight.weight_basis_points <= 0) fail("analysis_weight_invalid", "scenario weights must be positive integer basis points for every metric");
      weightIds.add(weight.metric_id);
      total += weight.weight_basis_points;
    }
    if (!sameSet(weightIds, metricIds) || total !== 10_000) fail("analysis_weight_total_invalid", "scenario weights must total 10000 basis points");
    scenarioIds.add(scenario.scenario_id);
  }
  if (!sameSet(scenarioIds, REQUIRED_SCENARIOS)) fail("analysis_scenarios_invalid", "the four frozen scenarios are required");
  if (method.sensitivity.mode !== "one_at_a_time_weight_delta" || method.sensitivity.delta_basis_points !== 1000) fail("analysis_sensitivity_invalid", "the frozen one-at-a-time sensitivity method is required");
  const expectedBoundaries = MULTI_OBJECTIVE_METHOD_V1.boundaries;
  if (canonicalize(method.boundaries) !== canonicalize(expectedBoundaries)) fail("analysis_boundary_invalid", "analysis boundaries cannot be relaxed");
  return { valid: true, metric_count: metricIds.size, scenario_count: scenarioIds.size, method_sha256: sha256(method) };
}

function normalizeObservations(observations, gateResult, method) {
  if (!Array.isArray(observations) || observations.length < 2 || observations.length > 500) fail("analysis_observations_invalid", "observations must cover 2-500 eligible candidates");
  const eligible = gateResult.candidates.filter(({ status }) => status === "eligible");
  const eligibleIds = new Set(eligible.map(({ combination_id }) => combination_id));
  const metricDefinitions = new Map(method.metrics.map((metric) => [metric.metric_id, metric]));
  const expectedMetricIds = new Set(metricDefinitions.keys());
  const observedIds = new Set();
  const normalized = observations.map((entry) => {
    exactKeys(entry, OBSERVATION_SET_KEYS, "analysis_candidate_observations");
    if (!eligibleIds.has(entry.combination_id) || observedIds.has(entry.combination_id)) fail("analysis_candidate_invalid", "observations must cover each eligible candidate exactly once");
    if (!Array.isArray(entry.metrics) || entry.metrics.length !== expectedMetricIds.size) fail("analysis_candidate_metrics_invalid", "every candidate must explicitly provide or mark unknown every metric");
    const metricIds = new Set();
    const metrics = entry.metrics.map((observation) => {
      exactKeys(observation, OBSERVATION_KEYS, "analysis_observation");
      exactKeys(observation.source, SOURCE_KEYS, "analysis_observation_source");
      const definition = metricDefinitions.get(observation.metric_id);
      if (!definition || metricIds.has(observation.metric_id)) fail("analysis_observation_metric_invalid", "observation metric identifiers must be unique and registered");
      if (observation.unit !== definition.unit || !new Set(["provided", "unknown"]).has(observation.status)) fail("analysis_observation_unit_invalid", `metric ${observation.metric_id} must use ${definition.unit}`);
      if (!SOURCE_KINDS.has(observation.source.kind) || !SOURCE_CONFIDENCE.has(observation.source.confidence)) fail("analysis_observation_source_invalid", "observation source kind or confidence is invalid");
      if (observation.status === "provided") {
        if (typeof observation.value !== "number" || !Number.isFinite(observation.value) || observation.value < definition.minimum || observation.value > definition.maximum) fail("analysis_observation_value_invalid", `metric ${observation.metric_id} is outside its canonical range`);
        if (observation.source.kind === "unknown" || observation.source.confidence === "unknown" || !validTimestamp(observation.source.observed_at)
          || typeof observation.source.reference !== "string" || !observation.source.reference
          || !/^sha256:[0-9a-f]{64}$/.test(observation.source.content_sha256 || "")) fail("analysis_observation_provenance_invalid", "provided metrics require timestamped, digest-bound provenance");
      } else if (observation.value !== null || observation.source.kind !== "unknown" || observation.source.confidence !== "unknown"
        || observation.source.observed_at !== null || observation.source.reference !== null || observation.source.content_sha256 !== null) {
        fail("analysis_unknown_invalid", "unknown metrics must remain null and must not imply provenance");
      }
      metricIds.add(observation.metric_id);
      return {
        metric_id: observation.metric_id,
        status: observation.status,
        value: observation.value,
        unit: observation.unit,
        source: { ...observation.source },
      };
    }).sort((left, right) => compareText(left.metric_id, right.metric_id));
    if (!sameSet(metricIds, expectedMetricIds)) fail("analysis_candidate_metrics_invalid", "the complete metric registry must be represented");
    observedIds.add(entry.combination_id);
    return { combination_id: entry.combination_id, metrics };
  }).sort((left, right) => compareText(left.combination_id, right.combination_id));
  if (!sameSet(observedIds, eligibleIds)) fail("analysis_candidate_coverage_invalid", "observations must cover all and only eligible data-gate candidates");
  return normalized;
}

function normalizeMetricValues(candidates, metric) {
  const values = candidates.map((candidate) => candidate.values.get(metric.metric_id));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const normalized = new Map();
  for (let index = 0; index < candidates.length; index += 1) {
    const value = values[index];
    const score = minimum === maximum ? 1 : metric.direction === "maximize" ? (value - minimum) / (maximum - minimum) : (maximum - value) / (maximum - minimum);
    normalized.set(candidates[index].combination_id, round(score, 9));
  }
  return { minimum, maximum, values: normalized };
}

function rankCandidates(candidates, method, weightMap, normalization, paretoIds) {
  const rankings = candidates.map((candidate) => {
    const contributions = method.metrics.map((metric) => {
      const normalizedValue = normalization.get(metric.metric_id).values.get(candidate.combination_id);
      const weight = weightMap.get(metric.metric_id);
      return {
        metric_id: metric.metric_id,
        normalized_value: normalizedValue,
        weight_basis_points: weight,
        weighted_contribution: round(normalizedValue * weight / 10_000, method.score_precision),
      };
    });
    return {
      combination_id: candidate.combination_id,
      combination_key: candidate.combination_key,
      score: round(contributions.reduce((sum, { weighted_contribution }) => sum + weighted_contribution, 0), method.score_precision),
      pareto_frontier: paretoIds.has(candidate.combination_id),
      contributions,
    };
  }).sort((left, right) => right.score - left.score || compareText(left.combination_key, right.combination_key) || compareText(left.combination_id, right.combination_id));
  let priorScore = null;
  let priorRank = 0;
  return rankings.map((item, index) => {
    const rank = item.score === priorScore ? priorRank : index + 1;
    priorScore = item.score;
    priorRank = rank;
    return { rank, ...item };
  });
}

function winner(rankings) {
  if (rankings.length < 2) return { status: "insufficient_data", primary_candidate_id: null };
  const top = rankings.filter(({ rank }) => rank === 1);
  if (top.length !== 1) return { status: "tie", primary_candidate_id: null };
  return { status: "read_only", primary_candidate_id: top[0].combination_id };
}

function perturbWeights(weightMap, targetMetricId, targetWeight) {
  const originalTarget = weightMap.get(targetMetricId);
  const otherTotal = 10_000 - originalTarget;
  const remainder = 10_000 - targetWeight;
  const entries = [...weightMap.entries()].filter(([metricId]) => metricId !== targetMetricId);
  const allocations = entries.map(([metricId, weight]) => {
    const exact = otherTotal === 0 ? remainder / entries.length : weight * remainder / otherTotal;
    return { metricId, value: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let missing = remainder - allocations.reduce((sum, { value }) => sum + value, 0);
  allocations.sort((left, right) => right.fraction - left.fraction || compareText(left.metricId, right.metricId));
  for (let index = 0; index < allocations.length && missing > 0; index += 1, missing -= 1) allocations[index].value += 1;
  return new Map([[targetMetricId, targetWeight], ...allocations.map(({ metricId, value }) => [metricId, value])]);
}

function sensitivityForScenario({ baselineWinner, baselineWeights, candidates, method, normalization, paretoIds }) {
  if (baselineWinner.status !== "read_only") return { status: "indeterminate", delta_basis_points: method.sensitivity.delta_basis_points, variant_count: 0, leader_change_count: 0, stability_ranges: [] };
  let leaderChanges = 0;
  let variants = 0;
  const ranges = method.metrics.map(({ metric_id }) => {
    const base = baselineWeights.get(metric_id);
    const tested = [...new Set([Math.max(0, base - method.sensitivity.delta_basis_points), base, Math.min(10_000, base + method.sensitivity.delta_basis_points)])].sort((a, b) => a - b);
    const retained = [];
    for (const weight of tested) {
      const variantWinner = winner(rankCandidates(candidates, method, perturbWeights(baselineWeights, metric_id, weight), normalization, paretoIds));
      if (weight !== base) variants += 1;
      if (variantWinner.status === "read_only" && variantWinner.primary_candidate_id === baselineWinner.primary_candidate_id) retained.push(weight);
      else if (weight !== base) leaderChanges += 1;
    }
    return {
      metric_id,
      tested_weight_basis_points: tested,
      retained_leader_min_basis_points: retained.length ? Math.min(...retained) : null,
      retained_leader_max_basis_points: retained.length ? Math.max(...retained) : null,
      baseline_leader_retained_for_all_tested_weights: retained.length === tested.length,
    };
  });
  return {
    status: leaderChanges === 0 ? "stable" : "sensitive",
    delta_basis_points: method.sensitivity.delta_basis_points,
    variant_count: variants,
    leader_change_count: leaderChanges,
    stability_ranges: ranges,
  };
}

function paretoAnalysis(candidates, metrics) {
  const dominated = [];
  const frontier = [];
  for (const candidate of candidates) {
    const dominatedBy = [];
    for (const other of candidates) {
      if (other.combination_id === candidate.combination_id) continue;
      let noWorse = true;
      let strictlyBetter = false;
      for (const metric of metrics) {
        const left = other.values.get(metric.metric_id);
        const right = candidate.values.get(metric.metric_id);
        const betterOrEqual = metric.direction === "maximize" ? left >= right : left <= right;
        const better = metric.direction === "maximize" ? left > right : left < right;
        if (!betterOrEqual) noWorse = false;
        if (better) strictlyBetter = true;
      }
      if (noWorse && strictlyBetter) dominatedBy.push(other.combination_id);
    }
    dominatedBy.sort(compareText);
    if (dominatedBy.length) dominated.push({ combination_id: candidate.combination_id, dominated_by: dominatedBy });
    else frontier.push(candidate.combination_id);
  }
  frontier.sort(compareText);
  dominated.sort((left, right) => compareText(left.combination_id, right.combination_id));
  return { frontier_candidate_ids: frontier, dominated_candidates: dominated };
}

export function evaluateMultiObjectiveAnalysis({ analysisId, dataGateResult, observations, method = MULTI_OBJECTIVE_METHOD_V1, generatedAt }) {
  if (!/^advisor_analysis_[0-9a-f-]{36}$/.test(analysisId || "")) fail("analysis_id_invalid", "analysisId must be a server-owned Advisor analysis identifier");
  if (!validTimestamp(generatedAt)) fail("analysis_timestamp_invalid", "generatedAt must be a UTC timestamp");
  validateAdvisorDataGateResult(dataGateResult);
  if (dataGateResult.readiness.analysis_allowed !== true || dataGateResult.readiness.status === "blocked") fail("analysis_data_gate_blocked", "a digest-verified CT-663 result with analysis_allowed=true is required");
  const methodValidation = validateMultiObjectiveMethod(method);
  const normalizedObservations = normalizeObservations(observations, dataGateResult, method);
  const gateById = new Map(dataGateResult.candidates.map((candidate) => [candidate.combination_id, candidate]));
  const analysisCandidates = normalizedObservations.map((entry) => {
    const unknownMetricIds = entry.metrics.filter(({ status }) => status === "unknown").map(({ metric_id }) => metric_id).sort(compareText);
    return {
      combination_id: entry.combination_id,
      combination_key: gateById.get(entry.combination_id).combination_key,
      display_name: gateById.get(entry.combination_id).display_name,
      status: unknownMetricIds.length ? "incomplete" : "complete",
      unknown_metric_ids: unknownMetricIds,
      values: new Map(entry.metrics.filter(({ status }) => status === "provided").map(({ metric_id, value }) => [metric_id, value])),
    };
  });
  const completeCandidates = analysisCandidates.filter(({ status }) => status === "complete");
  const normalization = new Map(method.metrics.map((metric) => [metric.metric_id, completeCandidates.length ? normalizeMetricValues(completeCandidates, metric) : { minimum: null, maximum: null, values: new Map() }]));
  const pareto = paretoAnalysis(completeCandidates, method.metrics);
  const paretoIds = new Set(pareto.frontier_candidate_ids);
  const scenarios = method.scenarios.map((scenario) => {
    const weights = new Map(scenario.weights.map(({ metric_id, weight_basis_points }) => [metric_id, weight_basis_points]));
    const rankings = completeCandidates.length >= 2 ? rankCandidates(completeCandidates, method, weights, normalization, paretoIds) : [];
    const recommendation = winner(rankings);
    const sensitivity = sensitivityForScenario({ baselineWinner: recommendation, baselineWeights: weights, candidates: completeCandidates, method, normalization, paretoIds });
    return {
      scenario_id: scenario.scenario_id,
      status: recommendation.status === "insufficient_data" ? "insufficient_data" : "ranked",
      weights: scenario.weights.map((weight) => ({ ...weight })),
      rankings,
      recommendation: {
        ...recommendation,
        alternative_candidate_ids: rankings.filter(({ combination_id }) => combination_id !== recommendation.primary_candidate_id).map(({ combination_id }) => combination_id),
      },
      sensitivity,
    };
  });
  const balanced = scenarios.find(({ scenario_id }) => scenario_id === "balanced");
  const excluded = dataGateResult.candidates.filter(({ status }) => status !== "eligible").map(({ combination_id, status, exclusion_codes }) => ({ combination_id, status, reason_codes: [...exclusion_codes] }));
  const unknowns = analysisCandidates.filter(({ status }) => status === "incomplete").map(({ combination_id, unknown_metric_ids }) => ({ combination_id, metric_ids: unknown_metric_ids }));
  const orderedObservations = normalizedObservations;
  const inputProjection = {
    constraint_evaluation_id: dataGateResult.evaluation_id,
    constraint_evaluation_sha256: dataGateResult.content_sha256,
    constraint_evaluation_input_sha256: dataGateResult.input_sha256,
    method_sha256: methodValidation.method_sha256,
    observations: orderedObservations,
  };
  const result = {
    schema_version: MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION,
    analysis_id: analysisId,
    project_id: dataGateResult.project_id,
    method: { method_id: method.method_id, method_version: method.method_version, method_sha256: methodValidation.method_sha256 },
    constraint_evaluation: {
      evaluation_id: dataGateResult.evaluation_id,
      content_sha256: dataGateResult.content_sha256,
      input_sha256: dataGateResult.input_sha256,
      readiness_status: dataGateResult.readiness.status,
    },
    generated_at: generatedAt,
    input_sha256: sha256(inputProjection),
    observation_set_sha256: sha256(orderedObservations),
    metric_coverage: {
      metric_count: method.metrics.length,
      eligible_candidate_count: analysisCandidates.length,
      complete_candidate_count: completeCandidates.length,
      incomplete_candidate_count: unknowns.length,
      candidates: analysisCandidates.map(({ combination_id, combination_key, display_name, status, unknown_metric_ids }) => ({ combination_id, combination_key, display_name, status, unknown_metric_ids })),
    },
    normalization: method.metrics.map((metric) => ({
      metric_id: metric.metric_id,
      direction: metric.direction,
      unit: metric.unit,
      observed_minimum: normalization.get(metric.metric_id).minimum,
      observed_maximum: normalization.get(metric.metric_id).maximum,
    })),
    pareto,
    scenarios,
    decision_support: {
      primary_scenario_id: "balanced",
      status: balanced.recommendation.status,
      primary_candidate_id: balanced.recommendation.primary_candidate_id,
      alternative_candidate_ids: balanced.recommendation.alternative_candidate_ids,
      exclusions: excluded,
      unknowns,
    },
    summary: {
      eligible_candidate_count: analysisCandidates.length,
      complete_candidate_count: completeCandidates.length,
      incomplete_candidate_count: unknowns.length,
      pareto_frontier_count: pareto.frontier_candidate_ids.length,
      ranked_scenario_count: scenarios.filter(({ status }) => status === "ranked").length,
      stable_scenario_count: scenarios.filter(({ sensitivity }) => sensitivity.status === "stable").length,
      status: completeCandidates.length >= 2 ? "complete" : "partial",
    },
    boundaries: {
      hard_constraints_precede_scoring: true,
      eligible_candidates_only: true,
      same_frozen_input_across_scenarios: true,
      unknowns_imputed: false,
      recommendation_read_only: true,
      human_decision_recorded: false,
      execution_authorized: false,
      performance_claim_allowed: false,
      global_optimum_claimed: false,
      paid_capability_required: false,
    },
    content_sha256: null,
  };
  result.content_sha256 = sha256({ ...result, content_sha256: null });
  return result;
}

export function validateMultiObjectiveAnalysisResult(result) {
  if (!result || result.schema_version !== MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION || !/^advisor_analysis_[0-9a-f-]{36}$/.test(result.analysis_id || "")) fail("analysis_result_identity_invalid", "analysis result identity is invalid");
  if (result.method?.method_id !== "ct-advisor-multi-objective-analysis" || result.method?.method_version !== MULTI_OBJECTIVE_METHOD_VERSION || !/^sha256:[0-9a-f]{64}$/.test(result.method?.method_sha256 || "")) fail("analysis_result_method_invalid", "analysis result method binding is invalid");
  if (result.boundaries?.hard_constraints_precede_scoring !== true || result.boundaries?.eligible_candidates_only !== true
    || result.boundaries?.same_frozen_input_across_scenarios !== true || result.boundaries?.unknowns_imputed !== false
    || result.boundaries?.recommendation_read_only !== true || result.boundaries?.human_decision_recorded !== false
    || result.boundaries?.execution_authorized !== false || result.boundaries?.performance_claim_allowed !== false
    || result.boundaries?.global_optimum_claimed !== false || result.boundaries?.paid_capability_required !== false) fail("analysis_result_boundary_invalid", "analysis result boundaries are invalid");
  if (!Array.isArray(result.scenarios) || !sameSet(new Set(result.scenarios.map(({ scenario_id }) => scenario_id)), REQUIRED_SCENARIOS)) fail("analysis_result_scenarios_invalid", "analysis result must contain the four scenarios");
  if (!/^sha256:[0-9a-f]{64}$/.test(result.content_sha256 || "") || result.content_sha256 !== sha256({ ...result, content_sha256: null })) fail("analysis_result_digest_mismatch", "analysis result digest does not match its content");
  return { valid: true, digest_verified: true, status: result.summary.status };
}
