export type CombinationImportFormat = "json" | "csv";
export type CombinationSourceMode = "manual" | "json_import" | "csv_import" | "rule_generated";
export type CombinationTopology = "single_gpu" | "single_node" | "multi_node" | "cross_region" | "hybrid";

export interface InfrastructureCombinationInput {
  schema_version: "1.0.0";
  combination_key: string;
  display_name: string;
  resource_refs: {
    gpu: string;
    cloud_instance: string;
    region: string;
    network_path: string;
    software_stacks: string[];
    pricing_offers: string[];
  };
  configuration: {
    precision: string;
    topology: CombinationTopology;
    gpu_count: number;
    instance_count: number;
    replica_count: number;
  };
}

export interface CombinationConflict {
  code: string;
  severity: "error" | "warning";
  field: string;
  resource_refs: string[];
  message: string;
}

export interface CombinationDimension {
  status: "provided" | "unknown";
  value: string | number | string[] | null;
  unit: string;
}

export interface InfrastructureCombinationDocument extends InfrastructureCombinationInput {
  builder_version: "1.0.0";
  combination_id: string;
  source_mode: CombinationSourceMode;
  import_row_ref: string | null;
  resolved_resources: Array<{
    resource_id: string;
    resource_type: string;
    canonical_key: string;
    display_name: string;
    data_class: string;
    lifecycle_status: string;
    freshness: string;
    source_kind: string;
    source_snapshot_sha256: string | null;
    resource_sha256: string;
  }>;
  status: "comparable" | "needs_review" | "blocked";
  conflicts: CombinationConflict[];
  comparison_dimensions: Record<string, CombinationDimension>;
  input_sha256: string;
  combination_signature_sha256: string;
  evaluated_at: string;
  created_at: string;
  boundaries: {
    decision_support_only: true;
    execution_authorized: false;
    constraint_evaluation_performed: false;
    ranking_performed: false;
    performance_claim_allowed: false;
  };
  content_sha256: string;
}

export interface CombinationImportResult {
  schema_version: "1.0.0";
  format: CombinationImportFormat;
  combinations: InfrastructureCombinationInput[];
  import_sha256: string;
}

export interface CombinationComparison {
  schema_version: "1.0.0";
  builder_version: "1.0.0";
  generated_at: string;
  dimension_order: string[];
  rows: Array<{
    combination_id: string;
    combination_key: string;
    display_name: string;
    status: string;
    dimensions: Record<string, CombinationDimension>;
    combination_signature_sha256: string;
    content_sha256: string;
  }>;
  comparability: {
    status: "comparable" | "partial" | "blocked";
    combination_count: number;
    comparable_combination_count: number;
    blocked_combination_ids: string[];
    unknown_dimensions: string[];
    reason_codes: string[];
  };
  duplicates: Array<{ code: string; combination_id: string; conflicts_with: string; combination_key: string }>;
  boundaries: {
    side_by_side_only: true;
    constraints_applied: false;
    scoring_applied: false;
    ranking_applied: false;
    recommendation_issued: false;
    execution_authorized: false;
  };
  comparison_sha256: string;
}

export const COMBINATION_SCHEMA_VERSION: "1.0.0";
export const COMBINATION_BUILDER_VERSION: "1.0.0";
export const COMBINATION_IMPORT_FORMATS: readonly CombinationImportFormat[];
export const COMBINATION_SOURCE_MODES: readonly CombinationSourceMode[];
export const COMBINATION_TOPOLOGIES: readonly CombinationTopology[];
export const combinationCsvColumns: readonly string[];
export const combinationComparisonDimensions: readonly string[];

export function normalizeInfrastructureCombinationInput(value: unknown): InfrastructureCombinationInput;
export function computeCombinationInputSha256(input: InfrastructureCombinationInput): string;
export function computeCombinationSignatureSha256(input: InfrastructureCombinationInput): string;
export function computeCombinationContentSha256(document: InfrastructureCombinationDocument): string;
export function parseInfrastructureCombinationCsv(text: string): InfrastructureCombinationInput[];
export function parseInfrastructureCombinationImport(request: { schema_version: "1.0.0"; format: CombinationImportFormat; payload: unknown }): CombinationImportResult;
export function buildInfrastructureCombination(input: InfrastructureCombinationInput, options: {
  combinationId: string;
  createdAt: string;
  sourceMode?: CombinationSourceMode;
  importRowRef?: string | null;
  resources: unknown[];
  evaluatedAt?: string;
}): InfrastructureCombinationDocument;
export function validateInfrastructureCombinationDocument(document: InfrastructureCombinationDocument): { valid: true; digest_verified: true; status: string };
export function findCombinationDuplicates(documents: InfrastructureCombinationDocument[], existingDocuments?: InfrastructureCombinationDocument[]): Array<{ code: string; combination_id: string; conflicts_with: string; combination_key: string }>;
export function buildCombinationComparison(documents: InfrastructureCombinationDocument[], options: { generatedAt: string }): CombinationComparison;
