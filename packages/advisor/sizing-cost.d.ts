export type EstimateStatus = "provided" | "unknown" | "not_applicable";
export type CalculationStatus = "complete" | "partial" | "insufficient";

export interface NumericRange {
  min: number;
  max: number;
}

export interface SizingCostEstimate {
  status: EstimateStatus;
  value: NumericRange | null;
  unit: string;
  source_refs: string[];
}

export interface SizingCostInput {
  schema_version: "1.0.0";
  model: {
    parameter_count: SizingCostEstimate;
    weight_bytes_per_parameter: SizingCostEstimate;
    weight_overhead_ratio: SizingCostEstimate;
  };
  workload: {
    active_context_tokens_per_request: SizingCostEstimate;
    concurrent_requests: SizingCostEstimate;
    request_rate: SizingCostEstimate;
    input_tokens_per_request: SizingCostEstimate;
    output_tokens_per_request: SizingCostEstimate;
  };
  candidate: {
    gpu_memory_per_device_gib: SizingCostEstimate;
    memory_utilization_ratio: SizingCostEstimate;
    runtime_reserved_memory_per_gpu_gib: SizingCostEstimate;
    kv_cache_bytes_per_token_per_request: SizingCostEstimate;
    output_tokens_per_second_per_gpu: SizingCostEstimate;
    capacity_headroom_ratio: SizingCostEstimate;
  };
  cost_model: null | {
    currency: string;
    gpus_per_instance: SizingCostEstimate;
    instance_price_per_hour: SizingCostEstimate;
    billed_hours_per_month: SizingCostEstimate;
    network_egress_gib_per_month: SizingCostEstimate;
    network_price_per_gib: SizingCostEstimate;
    storage_cost_per_month: SizingCostEstimate;
    support_cost_per_month: SizingCostEstimate;
    other_cost_per_month: SizingCostEstimate;
    discount_ratio: SizingCostEstimate;
    tax_ratio: SizingCostEstimate;
  };
}

export interface SizingCostMetric {
  status: "computed" | "unknown";
  value: NumericRange | null;
  unit: string;
  formula_id: string;
  inputs: string[];
  missing_inputs: string[];
}

export interface SizingCostResult {
  schema_version: "1.0.0";
  formula_version: "1.0.0";
  input_sha256: string;
  status: CalculationStatus;
  sizing: { status: "computed" | "partial"; metrics: Record<string, SizingCostMetric> };
  cost: { status: "computed" | "partial" | "not_requested"; currency: string | null; metrics: Record<string, SizingCostMetric> };
  missing_inputs: string[];
  formulas: string[];
  calculation_sha256: string;
  boundaries: {
    estimate_only: true;
    inventory_claim_allowed: false;
    performance_claim_allowed: false;
    execution_authorized: false;
    missing_values_imputed: false;
  };
}

export declare const SIZING_COST_SCHEMA_VERSION: "1.0.0";
export declare const SIZING_COST_FORMULA_VERSION: "1.0.0";
export declare const SIZING_COST_FORMULAS: Readonly<Record<string, string>>;
export declare function normalizeSizingCostInput(input: SizingCostInput): SizingCostInput;
export declare function computeSizingCostInputDigest(input: SizingCostInput): string;
export declare function computeSizingCostResultDigest(result: SizingCostResult): string;
export declare function calculateSizingCost(input: SizingCostInput): Promise<{ input: SizingCostInput; result: SizingCostResult }>;
