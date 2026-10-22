import type {
  PassportRunBinding,
  PassportScenarioMethodFreeze
} from "./index.mjs";
import type { PassportNormalizedObservation } from "./observation.mjs";
import type { PassportEvidenceVersion } from "./versioning.mjs";

export const PASSPORT_DELIVERY_VERSION: "1.0.0";
export const PASSPORT_DELIVERY_STATISTICS_PROFILE: "ct-passport-statistics-v1";
export const PASSPORT_DELIVERY_CSV_HEADER: "observation_id,sample_id,sequence,disposition,value,unit,reason_code,reason_stage";
export const PASSPORT_DELIVERY_ERROR_CODES: Readonly<{
  inputInvalid: "passport_delivery_input_invalid";
  fieldUnknown: "passport_delivery_field_unknown";
  fieldMissing: "passport_delivery_field_missing";
  contextMismatch: "passport_delivery_context_mismatch";
  sampleAccountingMismatch: "passport_delivery_sample_accounting_mismatch";
  statisticMismatch: "passport_delivery_statistic_mismatch";
  csvInvalid: "passport_delivery_csv_invalid";
  fileSetMismatch: "passport_delivery_file_set_mismatch";
  checksumMismatch: "passport_delivery_checksum_mismatch";
  manifestMismatch: "passport_delivery_manifest_mismatch";
  contentMismatch: "passport_delivery_content_mismatch";
}>;

export type PassportDeliverySampleDisposition = "included" | "excluded" | "failed";

export interface PassportDeliverySample {
  observation_id: string;
  sample_id: string;
  sequence: number;
  disposition: PassportDeliverySampleDisposition;
  value: number | null;
  unit: string | null;
  reason_code: string | null;
  reason_stage: string | null;
}

export interface PassportDeliveryReference {
  object_type: string;
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportDeliveryStatistic {
  observation_ref: PassportDeliveryReference;
  data_origin: PassportNormalizedObservation["source"]["origin"];
  observation_point: string;
  metric: string;
  aggregation: PassportNormalizedObservation["aggregation"];
  source_unit: string;
  normalized_unit: string;
  attempted_samples: number;
  included_samples: number;
  failed_samples: number;
  excluded_samples: number;
  reported_value: number | null;
  recomputed_value: number | null;
  exact_match: true;
}

export interface PassportDeliveryManifest {
  schema_version: "1.0.0";
  record_type: "passport_delivery_manifest";
  delivery_id: string;
  version: string;
  tenant_id: string;
  created_at: string;
  passport_ref: PassportDeliveryReference & { object_type: "passport_evidence_version" };
  run_ref: PassportDeliveryReference & { object_type: "run" };
  freeze_ref: PassportDeliveryReference & { object_type: "passport_scenario_method_freeze" };
  data_origins: PassportNormalizedObservation["source"]["origin"][];
  statistics_profile: {
    profile_id: "ct-passport-statistics-v1";
    profile_version: "1.0.0";
    numeric_model: "IEEE-754-binary64-15-significant-digits";
    percentile_method: "nearest-rank";
    sample_order: "observation-id-sequence-sample-id";
    unit_catalog: "ct-passport-observation-unit-rules-v1";
  };
  summary: {
    observation_count: number;
    sample_count: number;
    statistic_count: number;
    all_statistics_exact: true;
    statistics: PassportDeliveryStatistic[];
  };
  artifacts: Array<{
    path: string;
    media_type: "application/json" | "text/csv" | "text/markdown";
    role: string;
    sha256: `sha256:${string}`;
    bytes: number;
  }>;
  verification: {
    command: "node scripts/verify-passport-delivery.mjs <delivery-directory>";
    minimum_node_version: "22";
    external_network_required: false;
    credentials_required: false;
  };
  boundary: {
    content_integrity_only: true;
    statistics_recomputed: true;
    human_summary_recomputed: true;
    principal_authentication_verified: false;
    export_authorization_verified: false;
    independent_review_verified: false;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportDeliveryFile {
  path: string;
  content: string | Uint8Array;
}

export interface PassportDeliveryInput {
  delivery_id: string;
  version: string;
  created_at: string;
  record: PassportEvidenceVersion;
  previous_version?: PassportEvidenceVersion;
  run: PassportRunBinding & { state: "started"; started_at: string };
  freeze: PassportScenarioMethodFreeze;
  observations: PassportNormalizedObservation[];
  samples: PassportDeliverySample[];
}

export interface PassportDeliveryPackage {
  manifest: PassportDeliveryManifest;
  files: ReadonlyArray<{ path: string; content: string }>;
}

export interface PassportDeliveryVerificationResult {
  valid: true;
  delivery_id: string;
  passport_ref: PassportDeliveryManifest["passport_ref"];
  data_origins: PassportDeliveryManifest["data_origins"];
  observation_count: number;
  sample_count: number;
  statistic_count: number;
  checksums_verified: true;
  statistics_recomputed: true;
  summary_recomputed: true;
  external_network_used: false;
  principal_authentication_verified: false;
  export_authorization_verified: false;
  independent_review_verified: false;
  performance_claim_allowed: false;
  certification_issued: false;
}

export function renderPassportDeliverySamplesCsv(samples: PassportDeliverySample[]): string;
export function parsePassportDeliverySamplesCsv(text: string | Uint8Array): ReadonlyArray<PassportDeliverySample>;
export function renderPassportDeliverySummary(manifest: PassportDeliveryManifest): string;
export function renderPassportDeliveryVerificationGuide(): string;
export function createPassportDeliveryPackage(input: PassportDeliveryInput): PassportDeliveryPackage;
export function verifyPassportDeliveryPackage(input: { files: PassportDeliveryFile[] }): PassportDeliveryVerificationResult;
