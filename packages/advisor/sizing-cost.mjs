import { createHash } from "node:crypto";

export const SIZING_COST_SCHEMA_VERSION = "1.0.0";
export const SIZING_COST_FORMULA_VERSION = "1.0.0";

export const SIZING_COST_FORMULAS = Object.freeze({
  weight_memory_gib: "parameter_count * weight_bytes_per_parameter * (1 + weight_overhead_ratio) / 2^30",
  kv_cache_memory_gib: "active_context_tokens_per_request * concurrent_requests * kv_cache_bytes_per_token_per_request / 2^30",
  workload_memory_gib: "(weight_memory_gib + kv_cache_memory_gib) * (1 + capacity_headroom_ratio)",
  usable_memory_per_gpu_gib: "gpu_memory_per_device_gib * memory_utilization_ratio - runtime_reserved_memory_per_gpu_gib",
  memory_gpu_count: "ceil(workload_memory_gib / usable_memory_per_gpu_gib)",
  required_output_tokens_per_second: "request_rate * output_tokens_per_request * (1 + capacity_headroom_ratio)",
  throughput_gpu_count: "ceil(required_output_tokens_per_second / output_tokens_per_second_per_gpu)",
  recommended_gpu_count: "max(memory_gpu_count, throughput_gpu_count)",
  planned_gpu_utilization_ratio: "required_output_tokens_per_second / (recommended_gpu_count * output_tokens_per_second_per_gpu)",
  instance_count: "ceil(recommended_gpu_count / gpus_per_instance)",
  monthly_compute_cost: "instance_count * instance_price_per_hour * billed_hours_per_month",
  monthly_network_cost: "network_egress_gib_per_month * network_price_per_gib",
  storage_cost_per_month: "declared storage_cost_per_month, or zero only when explicitly not_applicable",
  support_cost_per_month: "declared support_cost_per_month, or zero only when explicitly not_applicable",
  other_cost_per_month: "declared other_cost_per_month, or zero only when explicitly not_applicable",
  monthly_base_cost: "monthly_compute_cost + monthly_network_cost + storage_cost_per_month + support_cost_per_month + other_cost_per_month",
  monthly_discounted_cost: "monthly_base_cost * (1 - discount_ratio)",
  monthly_total_cost: "monthly_discounted_cost * (1 + tax_ratio)",
  monthly_input_tokens: "request_rate * input_tokens_per_request * billed_hours_per_month * 3600",
  monthly_output_tokens: "request_rate * output_tokens_per_request * billed_hours_per_month * 3600",
  monthly_total_tokens: "monthly_input_tokens + monthly_output_tokens",
  blended_cost_per_million_tokens: "monthly_total_cost / monthly_total_tokens * 1,000,000",
});

const GIB = 2 ** 30;
const ESTIMATE_STATUSES = new Set(["provided", "unknown", "not_applicable"]);
const TOP_LEVEL_KEYS = new Set(["schema_version", "model", "workload", "candidate", "cost_model"]);
const MODEL_KEYS = new Set(["parameter_count", "weight_bytes_per_parameter", "weight_overhead_ratio"]);
const WORKLOAD_KEYS = new Set(["active_context_tokens_per_request", "concurrent_requests", "request_rate", "input_tokens_per_request", "output_tokens_per_request"]);
const CANDIDATE_KEYS = new Set(["gpu_memory_per_device_gib", "memory_utilization_ratio", "runtime_reserved_memory_per_gpu_gib", "kv_cache_bytes_per_token_per_request", "output_tokens_per_second_per_gpu", "capacity_headroom_ratio"]);
const COST_KEYS = new Set(["currency", "gpus_per_instance", "instance_price_per_hour", "billed_hours_per_month", "network_egress_gib_per_month", "network_price_per_gib", "storage_cost_per_month", "support_cost_per_month", "other_cost_per_month", "discount_ratio", "tax_ratio"]);
const ESTIMATE_KEYS = new Set(["status", "value", "unit", "source_refs"]);
const RANGE_KEYS = new Set(["min", "max"]);

const DEFINITIONS = Object.freeze({
  "model.parameter_count": { unit: "parameters", positive: true },
  "model.weight_bytes_per_parameter": { unit: "bytes_per_parameter", positive: true },
  "model.weight_overhead_ratio": { unit: "ratio", min: 0, max: 4 },
  "workload.active_context_tokens_per_request": { unit: "tokens", positive: true, integer: true },
  "workload.concurrent_requests": { unit: "count", positive: true, integer: true },
  "workload.request_rate": { unit: "requests_per_second", positive: true },
  "workload.input_tokens_per_request": { unit: "tokens", min: 0, integer: true },
  "workload.output_tokens_per_request": { unit: "tokens", positive: true, integer: true },
  "candidate.gpu_memory_per_device_gib": { unit: "gibibytes", positive: true },
  "candidate.memory_utilization_ratio": { unit: "ratio", positive: true, max: 1 },
  "candidate.runtime_reserved_memory_per_gpu_gib": { unit: "gibibytes", min: 0 },
  "candidate.kv_cache_bytes_per_token_per_request": { unit: "bytes_per_token", positive: true },
  "candidate.output_tokens_per_second_per_gpu": { unit: "tokens_per_second", positive: true },
  "candidate.capacity_headroom_ratio": { unit: "ratio", min: 0, max: 4 },
  "cost_model.gpus_per_instance": { unit: "gpu_count", positive: true, integer: true },
  "cost_model.instance_price_per_hour": { unit: "currency_per_hour", min: 0 },
  "cost_model.billed_hours_per_month": { unit: "hours", positive: true },
  "cost_model.network_egress_gib_per_month": { unit: "gibibytes", min: 0, allowNotApplicable: true },
  "cost_model.network_price_per_gib": { unit: "currency_per_gibibyte", min: 0, allowNotApplicable: true },
  "cost_model.storage_cost_per_month": { unit: "currency_per_month", min: 0, allowNotApplicable: true },
  "cost_model.support_cost_per_month": { unit: "currency_per_month", min: 0, allowNotApplicable: true },
  "cost_model.other_cost_per_month": { unit: "currency_per_month", min: 0, allowNotApplicable: true },
  "cost_model.discount_ratio": { unit: "ratio", min: 0, max: 1, allowNotApplicable: true },
  "cost_model.tax_ratio": { unit: "ratio", min: 0, max: 1, allowNotApplicable: true },
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_invalid`, `${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${label}_field_unknown`, `${label} contains unknown field ${unknown}`);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function round(value) {
  if (!Number.isFinite(value)) fail("sizing_cost_non_finite", "calculation produced a non-finite value");
  return Math.round((value + Number.EPSILON) * 1e9) / 1e9;
}

function normalizedRange(min, max) {
  return { min: round(min), max: round(max) };
}

function addRanges(...ranges) {
  return normalizedRange(ranges.reduce((sum, range) => sum + range.min, 0), ranges.reduce((sum, range) => sum + range.max, 0));
}

function multiplyRanges(...ranges) {
  return normalizedRange(ranges.reduce((product, range) => product * range.min, 1), ranges.reduce((product, range) => product * range.max, 1));
}

function divideRanges(numerator, denominator) {
  if (denominator.min <= 0) fail("sizing_cost_divisor_invalid", "calculation divisor must remain positive");
  return normalizedRange(numerator.min / denominator.max, numerator.max / denominator.min);
}

function ceilRange(range) {
  return { min: Math.ceil(range.min), max: Math.ceil(range.max) };
}

function maxRange(left, right) {
  return { min: Math.max(left.min, right.min), max: Math.max(left.max, right.max) };
}

function cleanSourceRefs(value, path) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail("sizing_cost_source_refs_invalid", `${path}.source_refs must contain 1-20 entries`);
  const refs = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.length > 500) fail("sizing_cost_source_ref_invalid", `${path}.source_refs contains an invalid reference`);
    return entry.trim();
  });
  if (new Set(refs).size !== refs.length) fail("sizing_cost_source_ref_duplicate", `${path}.source_refs contains duplicates`);
  return refs.sort(compareText);
}

function normalizeEstimate(estimate, path) {
  const definition = DEFINITIONS[path];
  exactKeys(estimate, ESTIMATE_KEYS, path);
  if (!ESTIMATE_STATUSES.has(estimate.status)) fail("sizing_cost_status_invalid", `${path}.status is invalid`);
  if (estimate.unit !== definition.unit) fail("sizing_cost_unit_invalid", `${path}.unit must be ${definition.unit}`);
  if (estimate.status === "not_applicable" && !definition.allowNotApplicable) fail("sizing_cost_not_applicable_invalid", `${path} cannot be not_applicable`);
  const sourceRefs = cleanSourceRefs(estimate.source_refs, path);
  if (estimate.status !== "provided") {
    if (estimate.value !== null) fail("sizing_cost_unknown_value_present", `${path}.value must be null when not provided`);
    return { status: estimate.status, value: null, unit: estimate.unit, source_refs: sourceRefs };
  }
  exactKeys(estimate.value, RANGE_KEYS, `${path}.value`);
  const { min, max } = estimate.value;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) fail("sizing_cost_range_invalid", `${path}.value must be a finite ascending range`);
  if (definition.integer && (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))) fail("sizing_cost_integer_range_invalid", `${path}.value must contain safe integers`);
  if (definition.positive && min <= 0) fail("sizing_cost_range_invalid", `${path}.value must remain positive`);
  if (definition.min !== undefined && min < definition.min) fail("sizing_cost_range_invalid", `${path}.value is below its minimum`);
  if (definition.max !== undefined && max > definition.max) fail("sizing_cost_range_invalid", `${path}.value exceeds its maximum`);
  return { status: "provided", value: normalizedRange(min, max), unit: estimate.unit, source_refs: sourceRefs };
}

function normalizeGroup(value, keys, prefix) {
  exactKeys(value, keys, prefix);
  const normalized = {};
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail("sizing_cost_input_missing", `${prefix}.${key} is required`);
    normalized[key] = normalizeEstimate(value[key], `${prefix}.${key}`);
  }
  return normalized;
}

export function normalizeSizingCostInput(input) {
  exactKeys(input, TOP_LEVEL_KEYS, "sizing_cost_input");
  if (input.schema_version !== SIZING_COST_SCHEMA_VERSION) fail("sizing_cost_schema_unsupported", "unsupported sizing and cost schema version");
  const normalized = {
    schema_version: SIZING_COST_SCHEMA_VERSION,
    model: normalizeGroup(input.model, MODEL_KEYS, "model"),
    workload: normalizeGroup(input.workload, WORKLOAD_KEYS, "workload"),
    candidate: normalizeGroup(input.candidate, CANDIDATE_KEYS, "candidate"),
    cost_model: null,
  };
  if (input.cost_model !== null) {
    exactKeys(input.cost_model, COST_KEYS, "cost_model");
    if (typeof input.cost_model.currency !== "string" || !/^[A-Z]{3}$/.test(input.cost_model.currency)) fail("sizing_cost_currency_invalid", "cost_model.currency must be a three-letter uppercase currency code");
    const costModel = { currency: input.cost_model.currency };
    for (const key of COST_KEYS) {
      if (key === "currency") continue;
      if (!Object.hasOwn(input.cost_model, key)) fail("sizing_cost_input_missing", `cost_model.${key} is required`);
      costModel[key] = normalizeEstimate(input.cost_model[key], `cost_model.${key}`);
    }
    const networkStatuses = [costModel.network_egress_gib_per_month.status, costModel.network_price_per_gib.status];
    if (networkStatuses.includes("not_applicable") && !networkStatuses.every((status) => status === "not_applicable")) fail("sizing_cost_network_pair_invalid", "network usage and price must both be not_applicable or both remain in scope");
    normalized.cost_model = costModel;
  }
  return normalized;
}

export function computeSizingCostInputDigest(input) {
  return sha256(normalizeSizingCostInput(input));
}

function pathValue(input, path) {
  return path.split(".").reduce((value, key) => value?.[key], input);
}

function rawMetric(input, formulaId, unit, paths, calculator, { notApplicableAsZero = false } = {}) {
  const missing = [];
  const ranges = paths.map((path) => {
    const estimate = pathValue(input, path);
    if (estimate.status === "provided") return estimate.value;
    if (notApplicableAsZero && estimate.status === "not_applicable") return { min: 0, max: 0 };
    missing.push(path);
    return null;
  });
  if (missing.length) return { status: "unknown", value: null, unit, formula_id: formulaId, inputs: [...paths], missing_inputs: missing.sort(compareText) };
  return { status: "computed", value: calculator(...ranges), unit, formula_id: formulaId, inputs: [...paths], missing_inputs: [] };
}

function derivedMetric(formulaId, unit, metrics, calculator) {
  const inputs = [...new Set(metrics.flatMap((metric) => metric.inputs))].sort(compareText);
  const missing = [...new Set(metrics.flatMap((metric) => metric.missing_inputs))].sort(compareText);
  if (metrics.some((metric) => metric.status !== "computed")) return { status: "unknown", value: null, unit, formula_id: formulaId, inputs, missing_inputs: missing };
  return { status: "computed", value: calculator(...metrics.map((metric) => metric.value)), unit, formula_id: formulaId, inputs, missing_inputs: [] };
}

function optionalFixedMetric(input, path) {
  return rawMetric(input, path.slice("cost_model.".length), "currency_per_month", [path], (value) => value, { notApplicableAsZero: true });
}

function sizingMetrics(input) {
  const weightMemory = rawMetric(input, "weight_memory_gib", "gibibytes", ["model.parameter_count", "model.weight_bytes_per_parameter", "model.weight_overhead_ratio"], (parameters, bytes, overhead) => multiplyRanges(parameters, bytes, addRanges({ min: 1, max: 1 }, overhead), { min: 1 / GIB, max: 1 / GIB }));
  const kvCache = rawMetric(input, "kv_cache_memory_gib", "gibibytes", ["workload.active_context_tokens_per_request", "workload.concurrent_requests", "candidate.kv_cache_bytes_per_token_per_request"], (tokens, concurrency, bytes) => multiplyRanges(tokens, concurrency, bytes, { min: 1 / GIB, max: 1 / GIB }));
  const memoryBeforeHeadroom = derivedMetric("memory_before_headroom_gib", "gibibytes", [weightMemory, kvCache], addRanges);
  const workloadMemory = derivedMetric("workload_memory_gib", "gibibytes", [memoryBeforeHeadroom, rawMetric(input, "capacity_headroom_ratio", "ratio", ["candidate.capacity_headroom_ratio"], (value) => value)], (memory, headroom) => multiplyRanges(memory, addRanges({ min: 1, max: 1 }, headroom)));
  const usableMemory = rawMetric(input, "usable_memory_per_gpu_gib", "gibibytes", ["candidate.gpu_memory_per_device_gib", "candidate.memory_utilization_ratio", "candidate.runtime_reserved_memory_per_gpu_gib"], (memory, utilization, reserve) => {
    const usable = normalizedRange(memory.min * utilization.min - reserve.max, memory.max * utilization.max - reserve.min);
    if (usable.min <= 0) fail("sizing_cost_usable_memory_invalid", "runtime reserve leaves no guaranteed usable GPU memory");
    return usable;
  });
  const memoryGpuCount = derivedMetric("memory_gpu_count", "gpu_count", [workloadMemory, usableMemory], (required, available) => ceilRange(divideRanges(required, available)));
  const requiredOutput = rawMetric(input, "required_output_tokens_per_second", "tokens_per_second", ["workload.request_rate", "workload.output_tokens_per_request", "candidate.capacity_headroom_ratio"], (rate, tokens, headroom) => multiplyRanges(rate, tokens, addRanges({ min: 1, max: 1 }, headroom)));
  const throughputPerGpu = rawMetric(input, "output_tokens_per_second_per_gpu", "tokens_per_second", ["candidate.output_tokens_per_second_per_gpu"], (value) => value);
  const throughputGpuCount = derivedMetric("throughput_gpu_count", "gpu_count", [requiredOutput, throughputPerGpu], (required, capacity) => ceilRange(divideRanges(required, capacity)));
  const recommendedGpuCount = derivedMetric("recommended_gpu_count", "gpu_count", [memoryGpuCount, throughputGpuCount], maxRange);
  const plannedUtilization = derivedMetric("planned_gpu_utilization_ratio", "ratio", [requiredOutput, recommendedGpuCount, throughputPerGpu], (required, count, throughput) => divideRanges(required, multiplyRanges(count, throughput)));
  return {
    weight_memory_gib: weightMemory,
    kv_cache_memory_gib: kvCache,
    workload_memory_gib: workloadMemory,
    usable_memory_per_gpu_gib: usableMemory,
    memory_gpu_count: memoryGpuCount,
    required_output_tokens_per_second: requiredOutput,
    throughput_gpu_count: throughputGpuCount,
    recommended_gpu_count: recommendedGpuCount,
    planned_gpu_utilization_ratio: plannedUtilization,
  };
}

function costMetrics(input, sizing) {
  if (input.cost_model === null) return { status: "not_requested", currency: null, metrics: {} };
  const gpuPerInstance = rawMetric(input, "gpus_per_instance", "gpu_count", ["cost_model.gpus_per_instance"], (value) => value);
  const instances = derivedMetric("instance_count", "instance_count", [sizing.recommended_gpu_count, gpuPerInstance], (gpuCount, perInstance) => ceilRange(divideRanges(gpuCount, perInstance)));
  const price = rawMetric(input, "instance_price_per_hour", "currency_per_hour", ["cost_model.instance_price_per_hour"], (value) => value);
  const hours = rawMetric(input, "billed_hours_per_month", "hours", ["cost_model.billed_hours_per_month"], (value) => value);
  const compute = derivedMetric("monthly_compute_cost", "currency_per_month", [instances, price, hours], multiplyRanges);
  const network = rawMetric(input, "monthly_network_cost", "currency_per_month", ["cost_model.network_egress_gib_per_month", "cost_model.network_price_per_gib"], multiplyRanges, { notApplicableAsZero: true });
  const storage = optionalFixedMetric(input, "cost_model.storage_cost_per_month");
  const support = optionalFixedMetric(input, "cost_model.support_cost_per_month");
  const other = optionalFixedMetric(input, "cost_model.other_cost_per_month");
  const base = derivedMetric("monthly_base_cost", "currency_per_month", [compute, network, storage, support, other], addRanges);
  const discount = rawMetric(input, "discount_ratio", "ratio", ["cost_model.discount_ratio"], (value) => value, { notApplicableAsZero: true });
  const discounted = derivedMetric("monthly_discounted_cost", "currency_per_month", [base, discount], (amount, ratio) => normalizedRange(amount.min * (1 - ratio.max), amount.max * (1 - ratio.min)));
  const tax = rawMetric(input, "tax_ratio", "ratio", ["cost_model.tax_ratio"], (value) => value, { notApplicableAsZero: true });
  const total = derivedMetric("monthly_total_cost", "currency_per_month", [discounted, tax], (amount, ratio) => multiplyRanges(amount, addRanges({ min: 1, max: 1 }, ratio)));
  const requestRate = rawMetric(input, "request_rate", "requests_per_second", ["workload.request_rate"], (value) => value);
  const inputTokens = rawMetric(input, "input_tokens_per_request", "tokens", ["workload.input_tokens_per_request"], (value) => value);
  const outputTokens = rawMetric(input, "output_tokens_per_request", "tokens", ["workload.output_tokens_per_request"], (value) => value);
  const seconds = derivedMetric("billed_seconds_per_month", "seconds", [hours], (value) => multiplyRanges(value, { min: 3600, max: 3600 }));
  const monthlyInput = derivedMetric("monthly_input_tokens", "tokens_per_month", [requestRate, inputTokens, seconds], multiplyRanges);
  const monthlyOutput = derivedMetric("monthly_output_tokens", "tokens_per_month", [requestRate, outputTokens, seconds], multiplyRanges);
  const monthlyTotal = derivedMetric("monthly_total_tokens", "tokens_per_month", [monthlyInput, monthlyOutput], addRanges);
  const blended = derivedMetric("blended_cost_per_million_tokens", "currency_per_million_tokens", [total, monthlyTotal], (amount, tokens) => multiplyRanges(divideRanges(amount, tokens), { min: 1_000_000, max: 1_000_000 }));
  const metrics = {
    instance_count: instances,
    monthly_compute_cost: compute,
    monthly_network_cost: network,
    storage_cost_per_month: storage,
    support_cost_per_month: support,
    other_cost_per_month: other,
    monthly_base_cost: base,
    monthly_discounted_cost: discounted,
    monthly_total_cost: total,
    monthly_input_tokens: monthlyInput,
    monthly_output_tokens: monthlyOutput,
    monthly_total_tokens: monthlyTotal,
    blended_cost_per_million_tokens: blended,
  };
  return { status: total.status === "computed" && blended.status === "computed" ? "computed" : "partial", currency: input.cost_model.currency, metrics };
}

function resultProjection(result) {
  const { calculation_sha256: ignored, ...projection } = result;
  return projection;
}

export function computeSizingCostResultDigest(result) {
  return sha256(resultProjection(result));
}

export async function calculateSizingCost(rawInput) {
  const input = normalizeSizingCostInput(rawInput);
  const sizing = sizingMetrics(input);
  const cost = costMetrics(input, sizing);
  const allMetrics = [...Object.values(sizing), ...Object.values(cost.metrics)];
  const missingInputs = [...new Set(allMetrics.flatMap((metric) => metric.missing_inputs))].sort(compareText);
  const primaryComputed = sizing.recommended_gpu_count.status === "computed";
  const status = primaryComputed && (cost.status === "not_requested" || cost.status === "computed") ? "complete" : allMetrics.some((metric) => metric.status === "computed") ? "partial" : "insufficient";
  const result = {
    schema_version: SIZING_COST_SCHEMA_VERSION,
    formula_version: SIZING_COST_FORMULA_VERSION,
    input_sha256: sha256(input),
    status,
    sizing: { status: primaryComputed ? "computed" : "partial", metrics: sizing },
    cost,
    missing_inputs: missingInputs,
    formulas: Object.keys(SIZING_COST_FORMULAS).sort(compareText),
    calculation_sha256: null,
    boundaries: {
      estimate_only: true,
      inventory_claim_allowed: false,
      performance_claim_allowed: false,
      execution_authorized: false,
      missing_values_imputed: false,
    },
  };
  result.calculation_sha256 = computeSizingCostResultDigest(result);
  return { input, result };
}
