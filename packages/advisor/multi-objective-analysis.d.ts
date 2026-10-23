import type { AdvisorDataGateResult } from "./data-gate-constraints.mjs";

export type AnalysisMetricStatus = "provided" | "unknown";
export type AnalysisSourceKind = "measured" | "vendor" | "calculated" | "declared" | "synthetic" | "unknown";
export type AnalysisSourceConfidence = "high" | "medium" | "low" | "unknown";
export type AnalysisScenarioId = "cost_first" | "performance_first" | "balanced" | "compliance_first";

export interface AnalysisObservationSource {
  kind: AnalysisSourceKind;
  confidence: AnalysisSourceConfidence;
  observed_at: string | null;
  reference: string | null;
  content_sha256: string | null;
}

export interface AnalysisMetricObservation {
  metric_id: string;
  status: AnalysisMetricStatus;
  value: number | null;
  unit: string;
  source: AnalysisObservationSource;
}

export interface CandidateMetricObservations {
  combination_id: string;
  metrics: AnalysisMetricObservation[];
}

export interface MultiObjectiveMethod {
  schema_version: "1.0.0";
  method_id: "ct-advisor-multi-objective-analysis";
  method_version: "1.0.0";
  score_precision: 9;
  metrics: Array<{ metric_id: string; objective_group: string; direction: "minimize" | "maximize"; unit: string; minimum: number; maximum: number }>;
  scenarios: Array<{ scenario_id: AnalysisScenarioId; weights: Array<{ metric_id: string; weight_basis_points: number }> }>;
  sensitivity: { mode: "one_at_a_time_weight_delta"; delta_basis_points: 1000 };
  boundaries: Record<string, boolean>;
}

export interface MultiObjectiveAnalysisResult {
  schema_version: "1.0.0";
  analysis_id: string;
  project_id: string;
  generated_at: string;
  input_sha256: string;
  observation_set_sha256: string;
  scenarios: Array<{ scenario_id: AnalysisScenarioId; status: "ranked" | "insufficient_data"; rankings: unknown[]; recommendation: unknown; sensitivity: unknown }>;
  decision_support: unknown;
  summary: { status: "complete" | "partial"; [key: string]: unknown };
  boundaries: Record<string, boolean>;
  content_sha256: string;
  [key: string]: unknown;
}

export const MULTI_OBJECTIVE_ANALYSIS_SCHEMA_VERSION: "1.0.0";
export const MULTI_OBJECTIVE_METHOD_VERSION: "1.0.0";
export const MULTI_OBJECTIVE_METHOD_V1: Readonly<MultiObjectiveMethod>;
export function computeMultiObjectiveSha256(value: unknown): string;
export function validateMultiObjectiveMethod(method?: MultiObjectiveMethod): { valid: true; metric_count: number; scenario_count: number; method_sha256: string };
export function evaluateMultiObjectiveAnalysis(input: { analysisId: string; dataGateResult: AdvisorDataGateResult; observations: CandidateMetricObservations[]; method?: MultiObjectiveMethod; generatedAt: string }): MultiObjectiveAnalysisResult;
export function validateMultiObjectiveAnalysisResult(result: MultiObjectiveAnalysisResult): { valid: true; digest_verified: true; status: "complete" | "partial" };
