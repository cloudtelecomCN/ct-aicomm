export const PASSPORT_FREEZE_VERSION: "1.0.0";
export const PASSPORT_CHANGE_POLICY: "new-run-required-after-start";
export const PASSPORT_FREEZE_ERROR_CODES: Readonly<{
  inputInvalid: "passport_freeze_input_invalid";
  fieldUnknown: "passport_freeze_field_unknown";
  fieldMissing: "passport_freeze_field_missing";
  versionFloating: "passport_freeze_version_floating";
  fingerprintMismatch: "passport_freeze_fingerprint_mismatch";
  referenceMismatch: "passport_freeze_reference_mismatch";
  freezeMismatch: "passport_freeze_mismatch";
  newRunRequired: "passport_new_run_required";
  newRunIdRequired: "passport_new_run_id_required";
  runStateInvalid: "passport_run_state_invalid";
}>;

export type PassportWorkloadClass = "network-transfer" | "inference" | "training" | "other";
export type PassportWorkloadOrigin = "synthetic" | "production-like" | "production";
export type PassportDataOrigin = "synthetic" | "hybrid" | "measured";
export type PassportAggregation = "raw" | "count" | "mean" | "min" | "max" | "p50" | "p95" | "p99";

export interface PassportAuthorizationScope {
  visibility: "private" | "shared" | "public";
  purpose: string;
  recipients: string[];
  expires_at: string | null;
}

export interface PassportObjectReference {
  object_type: "scope" | "method";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface PassportScenarioMethodFreezeInput {
  freeze_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportAuthorizationScope;
  scope_ref: PassportObjectReference & { object_type: "scope" };
  method_ref: PassportObjectReference & { object_type: "method" };
  scenario: {
    sites: Array<{ site_id: string; role: "source" | "destination"; region: string }>;
    direction: "unidirectional" | "bidirectional";
    protocol: { protocol_id: string; version: string; profile: string | null };
    workload: {
      workload_class: PassportWorkloadClass;
      name: string;
      version: string;
      origin: PassportWorkloadOrigin;
      configuration_fingerprint: `sha256:${string}`;
    };
  };
  method_template: {
    template_id: string;
    version: string;
    tool: { name: string; version: string; artifact_fingerprint: `sha256:${string}` };
    parameters: Array<{ name: string; value: string | number | boolean; unit: string | null }>;
    sampling: { target_count: number; interval_ms: number; warmup_count: number };
    exclusion_rules: Array<{ rule_id: string; description: string }>;
    statistics: Array<{ metric: string; aggregations: PassportAggregation[] }>;
    environment_prerequisites: string[];
  };
  boundary: {
    data_origin: PassportDataOrigin;
    limitations: string[];
    performance_claim_allowed: false;
  };
}

export interface PassportScenarioMethodFreeze extends PassportScenarioMethodFreezeInput {
  schema_version: "1.0.0";
  record_type: "passport_scenario_method_freeze";
  content_fingerprint: `sha256:${string}`;
}

export interface PassportRunReference {
  run_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportFreezeReference {
  freeze_id: string;
  version: string;
  tenant_id: string;
  content_fingerprint: `sha256:${string}`;
}

export interface PassportRunBinding {
  schema_version: "1.0.0";
  record_type: "passport_run_freeze_binding";
  run_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportAuthorizationScope;
  freeze_ref: PassportFreezeReference;
  planned_window: { starts_at: string; ends_at: string };
  state: "planned" | "started";
  started_at: string | null;
  supersedes_run_ref: PassportRunReference | null;
  change_policy: "new-run-required-after-start";
  content_fingerprint: `sha256:${string}`;
}

export interface PassportRunPlanInput {
  run_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportAuthorizationScope;
  freeze: PassportScenarioMethodFreeze;
  planned_window: { starts_at: string; ends_at: string };
  supersedes_run_ref?: PassportRunReference | null;
}

export function createPassportScenarioMethodFreeze(input: PassportScenarioMethodFreezeInput): PassportScenarioMethodFreeze;
export function verifyPassportScenarioMethodFreeze(record: unknown): PassportScenarioMethodFreeze;
export function createPassportRunPlan(input: PassportRunPlanInput): PassportRunBinding & { state: "planned"; started_at: null };
export function verifyPassportRunBinding(record: unknown): PassportRunBinding;
export function startPassportRun(input: { plan: PassportRunBinding; version: string; started_at: string }): PassportRunBinding & { state: "started"; started_at: string };
export function assertPassportRunFreeze(input: { run: PassportRunBinding; freeze: PassportScenarioMethodFreeze }): Readonly<{
  matched: true;
  run_id: string;
  run_version: string;
  freeze_id: string;
  freeze_version: string;
  freeze_fingerprint: `sha256:${string}`;
}>;
export function createPassportReplacementRun(input: {
  previous_run: PassportRunBinding;
  freeze: PassportScenarioMethodFreeze;
  run_id: string;
  version: string;
  created_by: string;
  created_at: string;
  authorization_scope: PassportAuthorizationScope;
  planned_window: { starts_at: string; ends_at: string };
}): PassportRunBinding & { state: "planned"; started_at: null; supersedes_run_ref: PassportRunReference };
