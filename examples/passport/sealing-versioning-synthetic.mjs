import { pathToFileURL } from "node:url";

import {
  createPassportLocalRunImport,
  createPassportRunPlan,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun
} from "../../packages/link-evidence-passport/index.mjs";
import {
  createPassportNormalizedObservation
} from "../../packages/link-evidence-passport/observation.mjs";
import {
  createPassportEvidenceVersion,
  createPassportReplacementVersion,
  createPassportVersionTerminalEvent,
  projectPassportEvidenceVersion,
  verifyPassportEvidenceVersion,
  verifyPassportVersionTerminalEvent
} from "../../packages/link-evidence-passport/versioning.mjs";

const hash = (value) => `sha256:${value.repeat(64)}`;

export function buildSyntheticPassportVersioningScenario() {
  const tenantId = "tenant-synthetic-ct612";
  const authorizationScope = {
    visibility: "private",
    purpose: "Offline synthetic CT-612 sealing and versioning example.",
    recipients: [],
    expires_at: "2027-10-23T10:30:00.000Z"
  };
  const freeze = createPassportScenarioMethodFreeze({
    freeze_id: "freeze-ct612-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: "principal-synthetic-author",
    created_at: "2026-10-23T10:00:00.000Z",
    authorization_scope: authorizationScope,
    scope_ref: { object_type: "scope", object_id: "scope-ct612-synthetic", version: "1.0.0", tenant_id: tenantId },
    method_ref: { object_type: "method", object_id: "method-ct612-synthetic", version: "1.0.0", tenant_id: tenantId },
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
      template_id: "method-template-ct612-synthetic",
      version: "1.0.0",
      tool: { name: "ct-bench-synthetic", version: "1.0.0", artifact_fingerprint: hash("b") },
      parameters: [{ name: "external_network_access", value: false, unit: null }],
      sampling: { target_count: 10, interval_ms: 100, warmup_count: 1 },
      exclusion_rules: [{ rule_id: "exclude-warmup", description: "Exclude the declared synthetic warm-up sample." }],
      statistics: [{ metric: "ttft_ms", aggregations: ["mean", "p95"] }],
      environment_prerequisites: ["Node.js 22 or later; external network disabled."]
    },
    boundary: {
      data_origin: "synthetic",
      limitations: ["Generated values do not describe a real endpoint or customer workload."],
      performance_claim_allowed: false
    }
  });
  const plan = createPassportRunPlan({
    run_id: "passport-run-ct612-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T10:01:00.000Z",
    authorization_scope: authorizationScope,
    freeze,
    planned_window: { starts_at: "2026-10-23T10:10:00.000Z", ends_at: "2026-10-23T10:20:00.000Z" }
  });
  const localImport = createPassportLocalRunImport({
    import_id: "passport-import-ct612-synthetic",
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
    preflight_id: "passport-preflight-ct612-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    evaluated_by: "principal-synthetic-preflight",
    execution_principal_id: plan.created_by,
    evaluated_at: "2026-10-23T10:09:30.000Z",
    local_import: localImport,
    plan,
    freeze,
    authorization: {
      authorization_id: "authorization-ct612-synthetic",
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
      budget_id: "budget-ct612-synthetic",
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
      scope_id: "concurrency-ct612-synthetic",
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
  const sourceArtifact = {
    object_type: "artifact",
    object_id: "artifact-ct612-synthetic-samples",
    version: "1.0.0",
    tenant_id: tenantId,
    content_fingerprint: hash("2")
  };
  const partialObservation = createPassportNormalizedObservation({
    observation_id: "observation-ct612-synthetic-ttft-p95",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: plan.created_by,
    created_at: "2026-10-23T10:15:02.000Z",
    run: started,
    freeze,
    observed_at: "2026-10-23T10:15:00.000Z",
    observation_point: "synthetic-destination-ingress",
    metric: "ttft_ms",
    aggregation: "p95",
    value: 46,
    unit: "ms",
    samples: { attempted: 10, successful: 9, failed: 1, excluded: 1, included: 8 },
    failures: [{ code: "synthetic_timeout", stage: "synthetic-request", count: 1 }],
    exclusions: [{ rule_id: "exclude-warmup", count: 1 }],
    source: {
      origin: "synthetic",
      kind: "generator",
      source_id: "source-ct612-synthetic-generator-p95",
      collected_at: "2026-10-23T10:15:01.000Z",
      content_fingerprint: hash("3"),
      artifact_ref: sourceArtifact,
      input_observation_refs: [],
      declared_by: null
    },
    limitations: ["Values are deterministic synthetic fixtures and are not measured performance."]
  });
  const validObservation = createPassportNormalizedObservation({
    observation_id: "observation-ct612-synthetic-ttft-mean",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: plan.created_by,
    created_at: "2026-10-23T10:19:02.000Z",
    run: started,
    freeze,
    observed_at: "2026-10-23T10:19:00.000Z",
    observation_point: "synthetic-destination-ingress",
    metric: "ttft_ms",
    aggregation: "mean",
    value: 32,
    unit: "ms",
    samples: { attempted: 10, successful: 10, failed: 0, excluded: 0, included: 10 },
    failures: [],
    exclusions: [],
    source: {
      origin: "synthetic",
      kind: "generator",
      source_id: "source-ct612-synthetic-generator-mean",
      collected_at: "2026-10-23T10:19:01.000Z",
      content_fingerprint: hash("4"),
      artifact_ref: sourceArtifact,
      input_observation_refs: [],
      declared_by: null
    },
    limitations: ["Values are deterministic synthetic fixtures and are not measured performance."]
  });
  const initial = createPassportEvidenceVersion({
    passport_id: "passport-ct612-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:20:10.000Z",
    freshness_ttl_seconds: 3600,
    run: started,
    freeze,
    observations: [partialObservation]
  });
  const replacement = createPassportReplacementVersion({
    previous_version: initial,
    version: "1.1.0",
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:21:00.000Z",
    freshness_ttl_seconds: 7200,
    run: started,
    freeze,
    observations: [partialObservation, validObservation]
  });
  const supersededEvent = createPassportVersionTerminalEvent({
    event_id: "passport-event-ct612-synthetic-superseded",
    version: initial,
    to_state: "superseded",
    reason_detail: "Synthetic replacement version sealed for the offline contract example.",
    occurred_at: "2026-10-23T10:21:01.000Z",
    actor: { actor_id: "principal-synthetic-publisher", actor_role: "publisher" },
    replacement_version: replacement
  });
  const verifiedInitial = verifyPassportEvidenceVersion({
    record: initial,
    run: started,
    freeze,
    observations: [partialObservation]
  });
  const verifiedReplacement = verifyPassportEvidenceVersion({
    record: replacement,
    run: started,
    freeze,
    observations: [partialObservation, validObservation],
    previous_version: initial
  });
  const verifiedEvent = verifyPassportVersionTerminalEvent({
    event: supersededEvent,
    version: initial,
    replacement_version: replacement
  });
  const initialProjection = projectPassportEvidenceVersion({
    version: initial,
    events: [{ event: supersededEvent, replacement_version: replacement }],
    evaluated_at: "2026-10-23T10:21:02.000Z"
  });
  const replacementProjection = projectPassportEvidenceVersion({
    version: replacement,
    events: [],
    evaluated_at: "2026-10-23T10:21:02.000Z"
  });
  const expiredProjection = projectPassportEvidenceVersion({
    version: replacement,
    events: [],
    evaluated_at: replacement.valid_until
  });

  return {
    freeze,
    plan,
    started,
    partialObservation,
    validObservation,
    initial: verifiedInitial,
    replacement: verifiedReplacement,
    supersededEvent: verifiedEvent,
    initialProjection,
    replacementProjection,
    expiredProjection
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticPassportVersioningScenario();
  console.log(JSON.stringify({
    schema_version: scenario.replacement.schema_version,
    data_origin: scenario.replacement.observation_sets[0].origin,
    initial_state: scenario.initialProjection.lifecycle_state,
    replacement_state: scenario.replacementProjection.lifecycle_state,
    expiry_fail_closed: scenario.expiredProjection.lifecycle_state === "expired",
    immutable_versions: scenario.initial.boundary.immutable && scenario.replacement.boundary.immutable,
    exact_supersession_link: scenario.replacement.supersedes_ref.content_fingerprint === scenario.initial.content_fingerprint,
    review_inherited: scenario.replacement.boundary.review_inherited,
    freshness_inherited: scenario.replacement.boundary.freshness_inherited,
    replacement_review_status: scenario.replacement.status_seed.independent_review,
    replacement_freshness_status: scenario.replacement.status_seed.freshness,
    terminal_event_append_only: scenario.supersededEvent.boundary.append_only,
    source_version_mutated: scenario.supersededEvent.boundary.source_mutated,
    external_network_used: false,
    performance_claim_allowed: scenario.replacement.boundary.performance_claim_allowed,
    certification_issued: scenario.replacement.boundary.certification_issued
  }));
}
