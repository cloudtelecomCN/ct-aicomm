export const PASSPORT_FREEZE_VERSION: "1.0.0";
export const PASSPORT_CHANGE_POLICY: "new-run-required-after-start";
export const PASSPORT_PREFLIGHT_VERSION: "1.0.0";
export const PASSPORT_PREFLIGHT_POLICY: "all-gates-must-pass-before-start";
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
  localImportRequired: "passport_local_import_required";
  preflightRequired: "passport_preflight_required";
  preflightFailed: "passport_preflight_failed";
  preflightExpired: "passport_preflight_expired";
  preflightMismatch: "passport_preflight_mismatch";
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

export interface PassportLocalRunImport {
  schema_version: "1.0.0";
  record_type: "passport_local_run_import";
  import_id: string;
  version: string;
  tenant_id: string;
  imported_by: string;
  imported_at: string;
  source: {
    kind: "local-file" | "stdin" | "local-process";
    media_type: string;
    payload_fingerprint: `sha256:${string}`;
  };
  run_ref: PassportRunReference;
  freeze_ref: PassportFreezeReference;
  boundary: {
    mode: "local-offline";
    network_accessed: false;
    raw_payload_retained: false;
    credentials_retained: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportExecutionAuthorizationCheck {
  authorization_id: string;
  version: string;
  tenant_id: string;
  principal_id: string;
  action: string;
  decision: "allow" | "deny";
  valid_from: string;
  valid_until: string;
  revoked_at: string | null;
  run_ref: PassportRunReference;
  freeze_ref: PassportFreezeReference;
  source_fingerprint: `sha256:${string}`;
}

export interface PassportClockCheck {
  source: "system-utc" | "ntp" | "ptp" | "declared";
  checked_at: string;
  maximum_age_ms: number;
  maximum_skew_ms: number;
  observed_skew_ms: number;
  synchronized: boolean;
  source_fingerprint: `sha256:${string}`;
}

export interface PassportBudgetCheck {
  budget_id: string;
  version: string;
  tenant_id: string;
  run_ref: PassportRunReference;
  currency: string;
  limit_minor: number;
  committed_minor: number;
  estimated_run_minor: number;
  valid_until: string;
  source_fingerprint: `sha256:${string}`;
}

export interface PassportConcurrencyCheck {
  scope_id: string;
  tenant_id: string;
  run_ref: PassportRunReference;
  checked_at: string;
  maximum_age_ms: number;
  maximum: number;
  active: number;
  requested: number;
  source_fingerprint: `sha256:${string}`;
}

export interface PassportStopCondition {
  condition_id: string;
  kind: "max-duration" | "max-failures" | "budget-exhausted" | "manual-cancel" | "custom";
  metric: string;
  operator: "gte" | "gt" | "eq";
  threshold: number;
  unit: string;
  action: "stop" | "warn";
}

export type PassportPreflightGate = "authorization" | "clock" | "budget" | "concurrency" | "stop_conditions";

export interface PassportRunPreflight {
  schema_version: "1.0.0";
  record_type: "passport_run_preflight";
  preflight_id: string;
  version: string;
  tenant_id: string;
  evaluated_by: string;
  execution_principal_id: string;
  evaluated_at: string;
  valid_until: string;
  policy: "all-gates-must-pass-before-start";
  import_ref: {
    import_id: string;
    version: string;
    tenant_id: string;
    content_fingerprint: `sha256:${string}`;
  };
  run_ref: PassportRunReference;
  freeze_ref: PassportFreezeReference;
  planned_window: { starts_at: string; ends_at: string };
  authorization: PassportExecutionAuthorizationCheck;
  clock: PassportClockCheck;
  budget: PassportBudgetCheck;
  concurrency: PassportConcurrencyCheck;
  stop_conditions: PassportStopCondition[];
  gate_results: Record<PassportPreflightGate, { status: "passed" | "failed"; codes: string[] }>;
  decision: "passed" | "failed";
  blockers: Array<{ gate: PassportPreflightGate; code: string }>;
  boundary: {
    preflight_only: true;
    execution_performed: false;
    performance_claim_allowed: false;
  };
  content_fingerprint: `sha256:${string}`;
}

export interface PassportRunPreflightInput {
  preflight_id: string;
  version: string;
  tenant_id: string;
  evaluated_by: string;
  execution_principal_id: string;
  evaluated_at: string;
  local_import: PassportLocalRunImport;
  plan: PassportRunBinding;
  freeze: PassportScenarioMethodFreeze;
  authorization: PassportExecutionAuthorizationCheck;
  clock: PassportClockCheck;
  budget: PassportBudgetCheck;
  concurrency: PassportConcurrencyCheck;
  stop_conditions: PassportStopCondition[];
}

export function createPassportScenarioMethodFreeze(input: PassportScenarioMethodFreezeInput): PassportScenarioMethodFreeze;
export function verifyPassportScenarioMethodFreeze(record: unknown): PassportScenarioMethodFreeze;
export function createPassportRunPlan(input: PassportRunPlanInput): PassportRunBinding & { state: "planned"; started_at: null };
export function verifyPassportRunBinding(record: unknown): PassportRunBinding;
export function createPassportLocalRunImport(input: {
  import_id: string;
  version: string;
  tenant_id: string;
  imported_by: string;
  imported_at: string;
  source: PassportLocalRunImport["source"];
  plan: PassportRunBinding;
  freeze: PassportScenarioMethodFreeze;
}): PassportLocalRunImport;
export function verifyPassportLocalRunImport(record: unknown): PassportLocalRunImport;
export function createPassportRunPreflight(input: PassportRunPreflightInput): PassportRunPreflight;
export function verifyPassportRunPreflight(record: unknown): PassportRunPreflight;
export function startPassportRun(input: {
  plan: PassportRunBinding;
  freeze: PassportScenarioMethodFreeze;
  local_import: PassportLocalRunImport;
  preflight: PassportRunPreflight;
  execution_principal_id: string;
  version: string;
  started_at: string;
}): PassportRunBinding & { state: "started"; started_at: string };
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
