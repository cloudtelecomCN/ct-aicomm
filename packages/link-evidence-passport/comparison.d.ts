import type {
  PassportRunBinding,
  PassportScenarioMethodFreeze
} from "./index.mjs";
import type { PassportNormalizedObservation } from "./observation.mjs";
import type {
  PassportEvidenceVersion,
  PassportVersionTerminalEvent
} from "./versioning.mjs";

export const PASSPORT_COMPARISON_VERSION: "1.0.0";
export const PASSPORT_COMPARISON_RULE_ID: "ct-passport-default-comparability-v1";
export const PASSPORT_COMPARISON_BLOCKER_CODES: readonly [
  "authorization_scope_mismatch",
  "direction_mismatch",
  "workload_mismatch",
  "method_mismatch",
  "data_origin_mismatch",
  "observation_shape_mismatch",
  "baseline_inactive",
  "candidate_inactive",
  "baseline_measurement_not_sufficient",
  "candidate_measurement_not_sufficient",
  "baseline_observation_quality_not_valid",
  "candidate_observation_quality_not_valid"
];
export const PASSPORT_COMPARISON_ERROR_CODES: Readonly<{
  inputInvalid: "passport_comparison_input_invalid";
  fieldUnknown: "passport_comparison_field_unknown";
  fieldMissing: "passport_comparison_field_missing";
  fingerprintMismatch: "passport_comparison_fingerprint_mismatch";
  contextMismatch: "passport_comparison_context_mismatch";
  duplicateCandidate: "passport_comparison_duplicate_candidate";
  observationShapeInvalid: "passport_comparison_observation_shape_invalid";
  recordMismatch: "passport_comparison_record_mismatch";
}>;

export type PassportComparisonBlockerCode = typeof PASSPORT_COMPARISON_BLOCKER_CODES[number];
export type PassportComparisonDifferenceClass = "comparison_dimension" | "ranking_blocker" | "eligibility" | "metadata";

export interface PassportComparisonContext {
  version: PassportEvidenceVersion;
  run: PassportRunBinding & { state: "started"; started_at: string };
  freeze: PassportScenarioMethodFreeze;
  observations: PassportNormalizedObservation[];
  events: Array<{
    event: PassportVersionTerminalEvent;
    replacement_version: PassportEvidenceVersion | null;
  }>;
  previous_version?: PassportEvidenceVersion;
}

export interface PassportComparisonReference {
  object_type: "passport_evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportComparisonDifference {
  path: string;
  classification: PassportComparisonDifferenceClass;
  baseline_value_json: string;
  candidate_value_json: string;
}

export interface PassportComparisonMetricValue {
  passport_ref: PassportComparisonReference;
  normalized_value: number | null;
  quality_status: PassportNormalizedObservation["quality"]["status"];
  included_samples: number;
}

export interface PassportComparisonMetricRow {
  origin: PassportNormalizedObservation["source"]["origin"];
  observation_point: string;
  metric: string;
  aggregation: PassportNormalizedObservation["aggregation"];
  normalized_unit: string;
  values: PassportComparisonMetricValue[];
}

export interface PassportComparisonRecord {
  schema_version: "1.0.0";
  record_type: "passport_comparison";
  comparison_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  evaluated_at: string;
  group_rule: {
    rule_id: "ct-passport-default-comparability-v1";
    rule_version: "1.0.0";
    exact_dimensions: readonly [
      "authorization_scope",
      "scenario.direction",
      "scenario.workload",
      "method_template",
      "boundary.data_origin",
      "observation_shape"
    ];
    comparison_dimensions: readonly ["scenario.sites", "scenario.protocol"];
    default_ranking_applied: false;
  };
  baseline: {
    passport_ref: PassportComparisonReference;
    group_fingerprint: `sha256:${string}`;
    ranking_eligible: boolean;
    blocker_codes: PassportComparisonBlockerCode[];
  };
  candidates: Array<{
    passport_ref: PassportComparisonReference;
    group_fingerprint: `sha256:${string}`;
    same_group: boolean;
    ranking_eligible: boolean;
    view_mode: "side-by-side-unranked" | "difference-only";
    blocker_codes: PassportComparisonBlockerCode[];
    differences: PassportComparisonDifference[];
  }>;
  view: {
    side_by_side_refs: PassportComparisonReference[];
    difference_only_refs: PassportComparisonReference[];
    ranking_eligible_refs: PassportComparisonReference[];
    metric_rows: PassportComparisonMetricRow[];
    default_ranking_applied: false;
  };
  boundary: {
    comparability_is_not_equivalence: true;
    explicit_ranking_policy_required: true;
    performance_claim_allowed: false;
    independent_review_claimed: false;
    certification_issued: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportComparisonInput {
  comparison_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  baseline: PassportComparisonContext;
  candidates: PassportComparisonContext[];
}

export function createPassportComparison(input: PassportComparisonInput): PassportComparisonRecord;
export function verifyPassportComparison(input: {
  record: PassportComparisonRecord;
  baseline: PassportComparisonContext;
  candidates: PassportComparisonContext[];
}): PassportComparisonRecord;
