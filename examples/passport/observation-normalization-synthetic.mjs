import {
  createPassportLocalRunImport,
  createPassportRunPlan,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun
} from "../../packages/link-evidence-passport/index.mjs";
import {
  createPassportNormalizedObservation,
  verifyPassportNormalizedObservation
} from "../../packages/link-evidence-passport/observation.mjs";

const hash = (value) => `sha256:${value.repeat(64)}`;
const tenantId = "tenant-synthetic-alpha";
const authorizationScope = {
  visibility: "private",
  purpose: "Offline synthetic CT-611 observation normalization example.",
  recipients: [],
  expires_at: "2027-10-23T10:30:00.000Z"
};

const freeze = createPassportScenarioMethodFreeze({
  freeze_id: "freeze-ct611-synthetic",
  version: "1.0.0",
  tenant_id: tenantId,
  created_by: "principal-synthetic-author",
  created_at: "2026-10-23T10:00:00.000Z",
  authorization_scope: authorizationScope,
  scope_ref: { object_type: "scope", object_id: "scope-ct611-synthetic", version: "1.0.0", tenant_id: tenantId },
  method_ref: { object_type: "method", object_id: "method-ct611-synthetic", version: "1.0.0", tenant_id: tenantId },
  scenario: {
    sites: [
      { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" },
      { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" }
    ],
    direction: "unidirectional",
    protocol: { protocol_id: "protocol-synthetic-quic", version: "fixture-1", profile: null },
    workload: {
      workload_class: "inference",
      name: "synthetic-ttft",
      version: "fixture-1",
      origin: "synthetic",
      configuration_fingerprint: hash("a")
    }
  },
  method_template: {
    template_id: "method-template-ct611-synthetic",
    version: "1.0.0",
    tool: { name: "ct-bench-synthetic", version: "1.0.0", artifact_fingerprint: hash("b") },
    parameters: [{ name: "external_network_access", value: false, unit: null }],
    sampling: { target_count: 10, interval_ms: 100, warmup_count: 1 },
    exclusion_rules: [{ rule_id: "exclude-warmup", description: "Exclude the declared synthetic warm-up sample." }],
    statistics: [{ metric: "ttft_ms", aggregations: ["p95"] }],
    environment_prerequisites: ["Node.js 22 or later; external network disabled."]
  },
  boundary: {
    data_origin: "synthetic",
    limitations: ["Generated values do not describe a real endpoint or customer workload."],
    performance_claim_allowed: false
  }
});

const plan = createPassportRunPlan({
  run_id: "passport-run-ct611-synthetic",
  version: "1.0.0",
  tenant_id: tenantId,
  created_by: "principal-synthetic-runner",
  created_at: "2026-10-23T10:01:00.000Z",
  authorization_scope: authorizationScope,
  freeze,
  planned_window: { starts_at: "2026-10-23T10:10:00.000Z", ends_at: "2026-10-23T10:20:00.000Z" }
});
const localImport = createPassportLocalRunImport({
  import_id: "passport-import-ct611-synthetic",
  version: "1.0.0",
  tenant_id: tenantId,
  imported_by: plan.created_by,
  imported_at: "2026-10-23T10:08:00.000Z",
  source: { kind: "local-process", media_type: "application/json", payload_fingerprint: hash("c") },
  plan,
  freeze
});
const runRef = {
  run_id: plan.run_id,
  version: plan.version,
  tenant_id: tenantId,
  content_fingerprint: plan.content_fingerprint
};
const freezeRef = {
  freeze_id: freeze.freeze_id,
  version: freeze.version,
  tenant_id: tenantId,
  content_fingerprint: freeze.content_fingerprint
};
const preflight = createPassportRunPreflight({
  preflight_id: "passport-preflight-ct611-synthetic",
  version: "1.0.0",
  tenant_id: tenantId,
  evaluated_by: "principal-synthetic-preflight",
  execution_principal_id: plan.created_by,
  evaluated_at: "2026-10-23T10:09:30.000Z",
  local_import: localImport,
  plan,
  freeze,
  authorization: {
    authorization_id: "authorization-ct611-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
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
    source_fingerprint: hash("e")
  },
  budget: {
    budget_id: "budget-ct611-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    run_ref: runRef,
    currency: "USD",
    limit_minor: 1000,
    committed_minor: 100,
    estimated_run_minor: 200,
    valid_until: "2026-10-23T10:30:00.000Z",
    source_fingerprint: hash("f")
  },
  concurrency: {
    scope_id: "concurrency-ct611-synthetic",
    tenant_id: tenantId,
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
});
const started = startPassportRun({
  plan,
  freeze,
  local_import: localImport,
  preflight,
  execution_principal_id: plan.created_by,
  version: "1.0.1",
  started_at: "2026-10-23T10:10:00.000Z"
});

const observation = createPassportNormalizedObservation({
  observation_id: "observation-ct611-synthetic-ttft-p95",
  version: "1.0.0",
  tenant_id: tenantId,
  created_by: "principal-synthetic-runner",
  created_at: "2026-10-23T10:15:02.000Z",
  run: started,
  freeze,
  observed_at: "2026-10-23T10:15:00.000Z",
  observation_point: "synthetic-destination-ingress",
  metric: "ttft_ms",
  aggregation: "p95",
  value: 0.046,
  unit: "s",
  samples: { attempted: 10, successful: 9, failed: 1, excluded: 1, included: 8 },
  failures: [{ code: "synthetic_timeout", stage: "synthetic-request", count: 1 }],
  exclusions: [{ rule_id: "exclude-warmup", count: 1 }],
  source: {
    origin: "synthetic",
    kind: "generator",
    source_id: "source-ct611-synthetic-generator",
    collected_at: "2026-10-23T10:15:01.000Z",
    content_fingerprint: hash("2"),
    artifact_ref: {
      object_type: "artifact",
      object_id: "artifact-ct611-synthetic-samples",
      version: "1.0.0",
      tenant_id: tenantId,
      content_fingerprint: hash("3")
    },
    input_observation_refs: [],
    declared_by: null
  },
  limitations: ["Values are deterministic synthetic fixtures and are not measured performance."]
});
const verified = verifyPassportNormalizedObservation({ record: observation, run: started, freeze });

console.log(JSON.stringify({
  schema_version: verified.schema_version,
  data_origin: verified.source.origin,
  normalized_value: verified.measurement.normalized_value,
  normalized_unit: verified.measurement.normalized_unit,
  attempted_samples: verified.samples.attempted,
  failed_samples_retained: verified.samples.failed === 1 && verified.failures.length === 1,
  excluded_samples_retained: verified.samples.excluded === 1 && verified.exclusions.length === 1,
  sample_accounting_closed: verified.samples.attempted === verified.samples.successful + verified.samples.failed
    && verified.samples.successful === verified.samples.included + verified.samples.excluded,
  quality_status: verified.quality.status,
  origins_strictly_separated: verified.boundary.origin_separated,
  external_network_used: false,
  performance_claim_allowed: verified.boundary.performance_claim_allowed,
  certification_issued: verified.boundary.certification_issued
}));
