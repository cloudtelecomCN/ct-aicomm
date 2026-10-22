import type {
  PassportRunBinding,
  PassportScenarioMethodFreeze
} from "./index.mjs";
import type {
  PassportNormalizedObservation,
  PassportObservationOrigin
} from "./observation.mjs";

export const PASSPORT_VERSIONING_VERSION: "1.0.0";
export const PASSPORT_VERSION_STATES: readonly ["sealed", "expired", "superseded", "revoked"];
export const PASSPORT_VERSIONING_ERROR_CODES: Readonly<{
  inputInvalid: "passport_version_input_invalid";
  fieldUnknown: "passport_version_field_unknown";
  fieldMissing: "passport_version_field_missing";
  fingerprintMismatch: "passport_version_fingerprint_mismatch";
  contextMismatch: "passport_version_context_mismatch";
  observationRequired: "passport_version_observation_required";
  duplicateObservation: "passport_version_duplicate_observation";
  timeInvalid: "passport_version_time_invalid";
  versionInvalid: "passport_version_semver_invalid";
  lineageInvalid: "passport_version_lineage_invalid";
  statusInvalid: "passport_version_status_invalid";
  terminalEventInvalid: "passport_version_terminal_event_invalid";
  eventHistoryInvalid: "passport_version_event_history_invalid";
}>;

export type PassportVersionState = "sealed" | "expired" | "superseded" | "revoked";
export type PassportTerminalState = Exclude<PassportVersionState, "sealed">;
export type PassportMeasurementValidity = "sufficient" | "partial" | "invalid" | "unknown";

export interface PassportVersionReference {
  object_type: "passport_evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportVersionContentReference {
  object_type: "run" | "passport_scenario_method_freeze" | "observation";
  object_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportEvidenceVersion {
  schema_version: "1.0.0";
  record_type: "passport_evidence_version";
  passport_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportRunBinding["authorization_scope"];
  sealed_at: string;
  freshness_ttl_seconds: number;
  valid_until: string;
  supersedes_ref: PassportVersionReference | null;
  freeze_ref: PassportVersionContentReference & { object_type: "passport_scenario_method_freeze" };
  run_ref: PassportVersionContentReference & { object_type: "run" };
  observation_sets: Array<{
    origin: PassportObservationOrigin;
    observation_refs: Array<PassportVersionContentReference & { object_type: "observation" }>;
  }>;
  status_seed: {
    measurement_validity: PassportMeasurementValidity;
    content_integrity: "passed";
    independent_review: "not-reviewed";
    freshness: "valid";
    policy_decision: "manual-review";
  };
  boundary: {
    immutable: true;
    origin_separated: true;
    review_inherited: false;
    freshness_inherited: false;
    performance_claim_allowed: false;
    certification_issued: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportEvidenceVersionInput {
  passport_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  sealed_at: string;
  freshness_ttl_seconds: number;
  run: PassportRunBinding & { state: "started"; started_at: string };
  freeze: PassportScenarioMethodFreeze;
  observations: PassportNormalizedObservation[];
}

export interface PassportVersionTerminalEvent {
  schema_version: "1.0.0";
  record_type: "passport_version_terminal_event";
  event_id: string;
  sequence: 1;
  passport_ref: PassportVersionReference;
  from_state: "sealed";
  to_state: PassportTerminalState;
  reason_code: "validity_elapsed" | "replacement_published" | "revocation_authorized";
  reason_detail: string;
  occurred_at: string;
  actor: {
    actor_id: string;
    actor_role: "system" | "operator" | "publisher";
  };
  replacement_ref: PassportVersionReference | null;
  boundary: {
    append_only: true;
    source_mutated: false;
    certification_issued: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportEvidenceVersionProjection {
  schema_version: "1.0.0";
  passport_ref: PassportVersionReference;
  lifecycle_state: PassportVersionState;
  evaluated_at: string;
  valid_until: string;
  status_axes: PassportEvidenceVersion["status_seed"] | (Omit<PassportEvidenceVersion["status_seed"], "freshness"> & { freshness: "expired" });
  terminal_event_ref: { event_id: string; content_fingerprint: `sha256:${string}` } | null;
  invalidation_reason: PassportVersionTerminalEvent["reason_code"] | null;
  replacement_ref: PassportVersionReference | null;
  active: boolean;
  review_inherited: false;
  freshness_inherited: false;
  certification_issued: false;
}

export function createPassportEvidenceVersion(input: PassportEvidenceVersionInput): PassportEvidenceVersion;
export function createPassportReplacementVersion(input: Omit<PassportEvidenceVersionInput, "passport_id" | "tenant_id"> & {
  previous_version: PassportEvidenceVersion;
}): PassportEvidenceVersion;
export function verifyPassportEvidenceVersion(input: {
  record: PassportEvidenceVersion;
  run: PassportEvidenceVersionInput["run"];
  freeze: PassportScenarioMethodFreeze;
  observations: PassportNormalizedObservation[];
  previous_version?: PassportEvidenceVersion;
}): PassportEvidenceVersion;
export function createPassportVersionTerminalEvent(input: {
  event_id: string;
  version: PassportEvidenceVersion;
  to_state: PassportTerminalState;
  reason_detail: string;
  occurred_at: string;
  actor: PassportVersionTerminalEvent["actor"];
  replacement_version: PassportEvidenceVersion | null;
}): PassportVersionTerminalEvent;
export function verifyPassportVersionTerminalEvent(input: {
  event: PassportVersionTerminalEvent;
  version: PassportEvidenceVersion;
  replacement_version: PassportEvidenceVersion | null;
}): PassportVersionTerminalEvent;
export function projectPassportEvidenceVersion(input: {
  version: PassportEvidenceVersion;
  events: Array<{ event: PassportVersionTerminalEvent; replacement_version: PassportEvidenceVersion | null }>;
  evaluated_at: string;
}): PassportEvidenceVersionProjection;
