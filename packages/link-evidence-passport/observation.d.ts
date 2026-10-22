import type {
  PassportRunBinding,
  PassportScenarioMethodFreeze
} from "./index.mjs";

export const PASSPORT_OBSERVATION_VERSION: "1.0.0";
export const PASSPORT_OBSERVATION_ORIGINS: readonly ["measured", "synthetic", "inferred", "declared"];
export const PASSPORT_OBSERVATION_UNIT_RULES: Readonly<Record<string, Readonly<{
  canonical_unit: string;
  conversion_factor: number;
}>>>;
export const PASSPORT_OBSERVATION_ERROR_CODES: Readonly<{
  inputInvalid: "passport_observation_input_invalid";
  fieldUnknown: "passport_observation_field_unknown";
  fieldMissing: "passport_observation_field_missing";
  fingerprintMismatch: "passport_observation_fingerprint_mismatch";
  runNotStarted: "passport_observation_run_not_started";
  contextMismatch: "passport_observation_context_mismatch";
  metricNotFrozen: "passport_observation_metric_not_frozen";
  aggregationNotFrozen: "passport_observation_aggregation_not_frozen";
  unitInvalid: "passport_observation_unit_invalid";
  sampleAccountingInvalid: "passport_observation_sample_accounting_invalid";
  exclusionNotFrozen: "passport_observation_exclusion_not_frozen";
  originMismatch: "passport_observation_origin_mismatch";
  timeInvalid: "passport_observation_time_invalid";
}>;

export type PassportObservationOrigin = "measured" | "synthetic" | "inferred" | "declared";
export type PassportObservationSourceKind = "instrument" | "generator" | "derivation" | "attestation";
export type PassportObservationQuality = "valid" | "partial" | "invalid" | "unknown";
export type PassportObservationAggregation = "raw" | "count" | "mean" | "min" | "max" | "p50" | "p95" | "p99";

export interface PassportContentReference {
  object_type: "artifact" | "observation";
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportObservationSource {
  origin: PassportObservationOrigin;
  kind: PassportObservationSourceKind;
  source_id: string;
  collected_at: string;
  content_fingerprint: `sha256:${string}`;
  artifact_ref: (PassportContentReference & { object_type: "artifact" }) | null;
  input_observation_refs: Array<PassportContentReference & { object_type: "observation" }>;
  declared_by: string | null;
}

export interface PassportObservationSamples {
  attempted: number;
  successful: number;
  failed: number;
  excluded: number;
  included: number;
}

export interface PassportNormalizedObservation {
  schema_version: "1.0.0";
  record_type: "passport_normalized_observation";
  observation_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportRunBinding["authorization_scope"];
  run_ref: {
    object_type: "run";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: `sha256:${string}`;
  };
  freeze_ref: {
    object_type: "passport_scenario_method_freeze";
    object_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: `sha256:${string}`;
  };
  observed_at: string;
  observation_point: string;
  metric: string;
  aggregation: PassportObservationAggregation;
  measurement: {
    source_value: number | null;
    source_unit: string;
    normalized_value: number | null;
    normalized_unit: string;
    conversion_factor: number;
  };
  samples: PassportObservationSamples;
  failures: Array<{ code: string; stage: string; count: number }>;
  exclusions: Array<{ rule_id: string; count: number }>;
  source: PassportObservationSource;
  quality: {
    status: PassportObservationQuality;
    flags: string[];
  };
  limitations: string[];
  boundary: {
    data_origin: PassportObservationOrigin;
    origin_separated: true;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportNormalizedObservationInput {
  observation_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  run: PassportRunBinding & { state: "started"; started_at: string };
  freeze: PassportScenarioMethodFreeze;
  observed_at: string;
  observation_point: string;
  metric: string;
  aggregation: PassportObservationAggregation;
  value: number | null;
  unit: string;
  samples: PassportObservationSamples;
  failures: Array<{ code: string; stage: string; count: number }>;
  exclusions: Array<{ rule_id: string; count: number }>;
  source: PassportObservationSource;
  limitations: string[];
}

export function createPassportNormalizedObservation(input: PassportNormalizedObservationInput): PassportNormalizedObservation;
export function verifyPassportNormalizedObservation(input: {
  record: PassportNormalizedObservation;
  run: PassportRunBinding & { state: "started"; started_at: string };
  freeze: PassportScenarioMethodFreeze;
}): PassportNormalizedObservation;
