import { createHash } from "node:crypto";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * probability) - 1)];
}

function rng(seed) {
  let state = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function indexBatch(batch) {
  if (!batch || !Array.isArray(batch.samples) || !Array.isArray(batch.assignments)) fail("comparison_batch_invalid", "samples and assignments are required");
  const samples = new Map(batch.samples.map((sample) => [sample.sample_id, sample]));
  return batch.assignments.map((assignment) => ({ assignment, sample: samples.get(assignment.sample_id) })).filter(({ sample }) => sample);
}

function strataFor(batches) {
  const strata = new Map();
  for (const batch of batches) {
    for (const { assignment, sample } of indexBatch(batch)) {
      if (!sample.outcome?.success) continue;
      const value = sample.segments?.ttft_ms;
      if (!Number.isFinite(value) || value < 0) fail("comparison_ttft_invalid", "successful samples require non-negative TTFT");
      const key = `${assignment.repetition}|${assignment.concurrency}|${assignment.prompt_class}`;
      const values = strata.get(key) ?? [];
      values.push(value);
      strata.set(key, values);
    }
  }
  return strata;
}

function resampleStrata(strata, random) {
  const values = [];
  for (const source of strata.values()) for (let index = 0; index < source.length; index += 1) values.push(source[Math.floor(random() * source.length)]);
  return values;
}

function summarize(values) {
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99) };
}

function effect(baseline, treatment) {
  return Object.fromEntries(Object.keys(baseline).map((metric) => [metric, ((baseline[metric] - treatment[metric]) / baseline[metric]) * 100]));
}

export function compareExperimentGroups({ baselineBatches, treatmentBatch, resamples = 10_000, confidenceLevel = 0.95, seed = "ct-aicomm-comparison-v1" }) {
  if (!Array.isArray(baselineBatches) || !baselineBatches.length || !treatmentBatch) fail("comparison_groups_missing", "baseline and treatment groups are required");
  if (!Number.isInteger(resamples) || resamples < 100) fail("comparison_resamples_invalid", "at least 100 bootstrap resamples are required");
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) fail("comparison_confidence_invalid", "confidence level must be between zero and one");
  const fingerprint = treatmentBatch.environment_fingerprint;
  if (!fingerprint || baselineBatches.some((batch) => batch.environment_fingerprint !== fingerprint)) fail("comparison_environment_mismatch", "all groups must use one environment fingerprint");
  if (treatmentBatch.group !== "connector_only" || baselineBatches.some((batch) => batch.group !== "baseline")) fail("comparison_group_invalid", "baseline and connector_only groups are required");

  const baselineStrata = strataFor(baselineBatches);
  const treatmentStrata = strataFor([treatmentBatch]);
  const missing = [...new Set([...baselineStrata.keys(), ...treatmentStrata.keys()])].filter((key) => !baselineStrata.has(key) || !treatmentStrata.has(key));
  if (missing.length) fail("comparison_strata_mismatch", `unpaired strata: ${missing.join(",")}`);

  const baselineValues = [...baselineStrata.values()].flat();
  const treatmentValues = [...treatmentStrata.values()].flat();
  const baselineSummary = summarize(baselineValues);
  const treatmentSummary = summarize(treatmentValues);
  const observedEffect = effect(baselineSummary, treatmentSummary);
  const distributions = { p50: [], p95: [], p99: [] };
  const random = rng(seed);
  for (let index = 0; index < resamples; index += 1) {
    const sampledEffect = effect(summarize(resampleStrata(baselineStrata, random)), summarize(resampleStrata(treatmentStrata, random)));
    for (const metric of Object.keys(distributions)) distributions[metric].push(sampledEffect[metric]);
  }
  const alpha = (1 - confidenceLevel) / 2;
  const confidenceIntervals = Object.fromEntries(Object.entries(distributions).map(([metric, values]) => [metric, {
    lower: percentile(values, alpha),
    upper: percentile(values, 1 - alpha)
  }]));
  const baselineAttempts = baselineBatches.reduce((sum, batch) => sum + batch.sample_count, 0);
  const baselineSuccesses = baselineBatches.reduce((sum, batch) => sum + batch.success_count, 0);
  const baselineSuccessRate = baselineSuccesses / baselineAttempts;
  const treatmentSuccessRate = treatmentBatch.success_count / treatmentBatch.sample_count;
  const claimAllowed = confidenceIntervals.p50.lower > 0 && confidenceIntervals.p95.lower > 0 && confidenceIntervals.p99.lower >= 0 && treatmentSuccessRate >= baselineSuccessRate;
  const body = {
    schema_version: "1.0.0",
    analysis: "stratified_bootstrap_ttft_v1",
    data_origin: "measured",
    environment_fingerprint: fingerprint,
    baseline_batch_sha256: baselineBatches.map(({ batch_sha256 }) => batch_sha256),
    treatment_batch_sha256: treatmentBatch.batch_sha256,
    paired_strata: [...baselineStrata.keys()].sort(),
    resamples,
    confidence_level: confidenceLevel,
    seed,
    baseline: { sample_count: baselineValues.length, success_rate: baselineSuccessRate, ttft_ms: baselineSummary },
    treatment: { sample_count: treatmentValues.length, success_rate: treatmentSuccessRate, ttft_ms: treatmentSummary },
    relative_improvement_percent: observedEffect,
    confidence_interval_percent: confidenceIntervals,
    claim_gate: { allowed: claimAllowed, rule: "P50 and P95 lower bounds > 0; P99 lower bound >= 0; success rate not lower." },
    conclusion: claimAllowed ? "statistically_supported_improvement" : "no_supported_improvement_claim"
  };
  return Object.freeze({ ...body, analysis_sha256: digest(body) });
}
