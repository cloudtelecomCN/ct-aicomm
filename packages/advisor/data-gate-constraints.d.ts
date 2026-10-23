import type { InfrastructureCombinationDocument } from "./combination-builder.mjs";

export type DataGateStatus = "ready" | "ready_with_gaps" | "blocked";
export type CandidateEligibilityStatus = "eligible" | "excluded" | "indeterminate";
export type ConstraintOutcome = "pass" | "fail" | "unknown";

export interface DataReadinessRuleset {
  schema_version: "1.0.0";
  ruleset_id: "ct-advisor-data-readiness-hard-constraints";
  ruleset_version: "1.0.0";
  minimum_combination_count: number;
  policy: Record<string, string>;
  mappings: Array<{
    rule_id: string;
    field_id: string;
    dimension_ids: string[];
    operator: "equals_ci" | "one_of_ci" | "none_of_ci" | "contains_ci" | "less_than_or_equal" | "greater_than_or_equal";
    requirement_units: string[];
    dimension_unit: string;
  }>;
  boundaries: {
    hard_constraints_precede_scoring: true;
    scoring_performed: false;
    ranking_performed: false;
    recommendation_issued: false;
    execution_authorized: false;
    unknowns_imputed: false;
  };
}

export interface AdvisorDataGateResult {
  schema_version: "1.0.0";
  ruleset_version: "1.0.0";
  ruleset_sha256: string;
  evaluation_id: string;
  project_id: string;
  passport: { passport_id: string; revision: number; content_sha256: string };
  generated_at: string;
  input_sha256: string;
  readiness: { status: DataGateStatus; analysis_allowed: boolean; blocking_issue_count: number; warning_issue_count: number; issues: Array<Record<string, unknown>> };
  constraint_set: { hard_constraint_count: number; constraints: Array<Record<string, unknown>> };
  candidates: Array<{ combination_id: string; combination_key: string; display_name: string; status: CandidateEligibilityStatus; evaluations: Array<Record<string, unknown>>; exclusion_codes: string[]; combination_content_sha256: string }>;
  summary: { combination_count: number; eligible_count: number; excluded_count: number; indeterminate_count: number };
  boundaries: DataReadinessRuleset["boundaries"];
  content_sha256: string;
}

export const DATA_GATE_SCHEMA_VERSION: "1.0.0";
export const DATA_GATE_RULESET_VERSION: "1.0.0";
export function computeDataGateSha256(value: unknown): string;
export function validateDataReadinessRuleset(ruleset: DataReadinessRuleset): { valid: true; mapping_count: number; ruleset_sha256: string };
export function evaluateAdvisorDataGate(input: { evaluationId: string; passport: Record<string, unknown>; combinations: InfrastructureCombinationDocument[]; requirementRegistry: Record<string, unknown>; ruleset: DataReadinessRuleset; generatedAt: string }): AdvisorDataGateResult;
export function validateAdvisorDataGateResult(result: AdvisorDataGateResult): { valid: true; digest_verified: true; status: DataGateStatus };
