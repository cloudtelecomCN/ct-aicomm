import {
  PASSPORT_FREEZE_ERROR_CODES,
  PASSPORT_PREFLIGHT_VERSION,
  createPassportLocalRunImport,
  createPassportRunPlan,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun,
  verifyPassportLocalRunImport,
  verifyPassportRunPreflight
} from "../../packages/link-evidence-passport/index.mjs";

const hash = (value) => `sha256:${value.repeat(64)}`;
const authorizationScope = {
  visibility: "private",
  purpose: "Offline synthetic CT-610 example.",
  recipients: [],
  expires_at: "2027-10-23T10:00:00.000Z"
};

const freeze = createPassportScenarioMethodFreeze({
  freeze_id: "freeze-ct610-example",
  version: "1.0.0",
  tenant_id: "tenant-synthetic-alpha",
  created_by: "principal-synthetic-author",
  created_at: "2026-10-23T10:00:00.000Z",
  authorization_scope: authorizationScope,
  scope_ref: { object_type: "scope", object_id: "scope-ct610-example", version: "1.0.0", tenant_id: "tenant-synthetic-alpha" },
  method_ref: { object_type: "method", object_id: "method-ct610-example", version: "1.0.0", tenant_id: "tenant-synthetic-alpha" },
  scenario: {
    sites: [
      { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" },
      { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" }
    ],
    direction: "unidirectional",
    protocol: { protocol_id: "protocol-synthetic-quic", version: "draft-synthetic-1", profile: null },
    workload: {
      workload_class: "network-transfer",
      name: "synthetic-preflight-workload",
      version: "fixture-1",
      origin: "synthetic",
      configuration_fingerprint: hash("a")
    }
  },
  method_template: {
    template_id: "method-ct610-example",
    version: "1.0.0",
    tool: { name: "ct-bench-synthetic", version: "1.0.0", artifact_fingerprint: hash("b") },
    parameters: [{ name: "external_network_access", value: false, unit: null }],
    sampling: { target_count: 10, interval_ms: 100, warmup_count: 1 },
    exclusion_rules: [{ rule_id: "exclude-warmup", description: "Exclude the declared synthetic warm-up sample." }],
    statistics: [{ metric: "rtt_ms", aggregations: ["count", "p95"] }],
    environment_prerequisites: ["Node.js 22 or later; external network disabled."]
  },
  boundary: {
    data_origin: "synthetic",
    limitations: ["No real endpoint, credential, observation, or performance claim is included."],
    performance_claim_allowed: false
  }
});

const plan = createPassportRunPlan({
  run_id: "passport-run-ct610-example",
  version: "1.0.0",
  tenant_id: freeze.tenant_id,
  created_by: "principal-synthetic-runner",
  created_at: "2026-10-23T10:01:00.000Z",
  authorization_scope: authorizationScope,
  freeze,
  planned_window: { starts_at: "2026-10-23T10:10:00.000Z", ends_at: "2026-10-23T10:20:00.000Z" }
});

const localImport = createPassportLocalRunImport({
  import_id: "passport-import-ct610-example",
  version: "1.0.0",
  tenant_id: plan.tenant_id,
  imported_by: plan.created_by,
  imported_at: "2026-10-23T10:08:00.000Z",
  source: { kind: "local-process", media_type: "application/json", payload_fingerprint: hash("c") },
  plan,
  freeze
});

const runRef = {
  run_id: plan.run_id,
  version: plan.version,
  tenant_id: plan.tenant_id,
  content_fingerprint: plan.content_fingerprint
};
const freezeRef = {
  freeze_id: freeze.freeze_id,
  version: freeze.version,
  tenant_id: freeze.tenant_id,
  content_fingerprint: freeze.content_fingerprint
};
const preflightInput = {
  preflight_id: "passport-preflight-ct610-example",
  version: "1.0.0",
  tenant_id: plan.tenant_id,
  evaluated_by: "principal-synthetic-preflight",
  execution_principal_id: plan.created_by,
  evaluated_at: "2026-10-23T10:09:30.000Z",
  local_import: localImport,
  plan,
  freeze,
  authorization: {
    authorization_id: "authorization-ct610-example",
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    principal_id: plan.created_by,
    action: "execute-passport-run",
    decision: "allow",
    valid_from: "2026-10-23T10:00:00.000Z",
    valid_until: "2026-10-23T10:30:00.000Z",
    revoked_at: null,
    run_ref: runRef,
    freeze_ref: freezeRef,
    source_fingerprint: hash("d")
  },
  clock: {
    source: "declared",
    checked_at: "2026-10-23T10:09:30.000Z",
    maximum_age_ms: 120000,
    maximum_skew_ms: 100,
    observed_skew_ms: 5,
    synchronized: true,
    source_fingerprint: hash("f")
  },
  budget: {
    budget_id: "budget-ct610-example",
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    run_ref: runRef,
    currency: "USD",
    limit_minor: 1000,
    committed_minor: 100,
    estimated_run_minor: 200,
    valid_until: "2026-10-23T10:30:00.000Z",
    source_fingerprint: hash("e")
  },
  concurrency: {
    scope_id: "concurrency-ct610-example",
    tenant_id: plan.tenant_id,
    run_ref: runRef,
    checked_at: "2026-10-23T10:09:30.000Z",
    maximum_age_ms: 120000,
    maximum: 4,
    active: 1,
    requested: 1,
    source_fingerprint: hash("1")
  },
  stop_conditions: [
    { condition_id: "stop-budget", kind: "budget-exhausted", metric: "spent_minor", operator: "gte", threshold: 900, unit: "USD:minor", action: "stop" },
    { condition_id: "stop-duration", kind: "max-duration", metric: "elapsed_ms", operator: "gte", threshold: 600000, unit: "ms", action: "stop" },
    { condition_id: "stop-failures", kind: "max-failures", metric: "failure_count", operator: "gte", threshold: 3, unit: "count", action: "stop" }
  ]
};

const passedPreflight = createPassportRunPreflight(preflightInput);
const started = startPassportRun({
  plan,
  freeze,
  local_import: localImport,
  preflight: passedPreflight,
  execution_principal_id: plan.created_by,
  version: "1.0.1",
  started_at: "2026-10-23T10:10:00.000Z"
});

const failedInput = structuredClone(preflightInput);
failedInput.preflight_id = "passport-preflight-ct610-example-failed";
failedInput.budget.estimated_run_minor = 901;
const failedPreflight = createPassportRunPreflight(failedInput);
let failedPreflightBlockedStart = false;
try {
  startPassportRun({
    plan,
    freeze,
    local_import: localImport,
    preflight: failedPreflight,
    execution_principal_id: plan.created_by,
    version: "1.0.1",
    started_at: "2026-10-23T10:10:00.000Z"
  });
} catch (error) {
  failedPreflightBlockedStart = error.code === PASSPORT_FREEZE_ERROR_CODES.preflightFailed;
}

console.log(JSON.stringify({
  schema_version: PASSPORT_PREFLIGHT_VERSION,
  data_origin: freeze.boundary.data_origin,
  local_import_verified: verifyPassportLocalRunImport(localImport).content_fingerprint === localImport.content_fingerprint,
  passed_preflight_verified: verifyPassportRunPreflight(passedPreflight).content_fingerprint === passedPreflight.content_fingerprint,
  all_five_gates_passed: Object.values(passedPreflight.gate_results).every(({ status }) => status === "passed"),
  started_after_passed_preflight: started.state === "started",
  failed_preflight_recorded: failedPreflight.decision === "failed" && failedPreflight.blockers.some(({ code }) => code === "budget_exceeded"),
  failed_preflight_blocked_start: failedPreflightBlockedStart,
  failed_run_remained_planned: plan.state === "planned",
  raw_payload_retained: localImport.boundary.raw_payload_retained,
  credentials_retained: localImport.boundary.credentials_retained,
  external_network_used: false,
  performance_claim_allowed: false,
  certification_issued: false
}));
