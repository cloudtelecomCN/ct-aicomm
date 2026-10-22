import { pathToFileURL } from "node:url";

import {
  createPassportLocalRunImport,
  createPassportReplacementRun,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun
} from "../../packages/link-evidence-passport/index.mjs";
import { createPassportNormalizedObservation } from "../../packages/link-evidence-passport/observation.mjs";
import {
  createPassportComparison,
  verifyPassportComparison
} from "../../packages/link-evidence-passport/comparison.mjs";
import { createPassportEvidenceVersion } from "../../packages/link-evidence-passport/versioning.mjs";
import { buildSyntheticPassportVersioningScenario } from "./sealing-versioning-synthetic.mjs";

const hash = (value) => `sha256:${value.repeat(64)}`;

function inputFromFreeze(freeze) {
  const { schema_version, record_type, content_fingerprint, ...input } = freeze;
  return structuredClone(input);
}

function observationFor({
  observationId,
  run,
  freeze,
  createdAt,
  observedAt,
  value,
  sourceId,
  sourceHash,
  artifactHash
}) {
  return createPassportNormalizedObservation({
    observation_id: observationId,
    version: "1.0.0",
    tenant_id: run.tenant_id,
    created_by: run.created_by,
    created_at: createdAt,
    run,
    freeze,
    observed_at: observedAt,
    observation_point: "synthetic-destination-ingress",
    metric: "ttft_ms",
    aggregation: "mean",
    value,
    unit: "ms",
    samples: { attempted: 10, successful: 10, failed: 0, excluded: 0, included: 10 },
    failures: [],
    exclusions: [],
    source: {
      origin: "synthetic",
      kind: "generator",
      source_id: sourceId,
      collected_at: createdAt,
      content_fingerprint: sourceHash,
      artifact_ref: {
        object_type: "artifact",
        object_id: `${observationId}-samples`,
        version: "1.0.0",
        tenant_id: run.tenant_id,
        content_fingerprint: artifactHash
      },
      input_observation_refs: [],
      declared_by: null
    },
    limitations: ["Deterministic synthetic values are not measured performance."]
  });
}

function startVariant(base, {
  suffix,
  freezeCreatedAt,
  planCreatedAt,
  importedAt,
  preflightAt,
  authorizationStartsAt,
  authorizationEndsAt,
  windowStartsAt,
  windowEndsAt,
  hashCharacters,
  mutateFreeze
}) {
  const authorizationScope = base.started.authorization_scope;
  const freezeInput = inputFromFreeze(base.freeze);
  const mutated = mutateFreeze(freezeInput);
  const freeze = createPassportScenarioMethodFreeze({
    ...freezeInput,
    ...mutated,
    freeze_id: `freeze-ct613-${suffix}`,
    version: "1.0.0",
    created_at: freezeCreatedAt
  });
  const plan = createPassportReplacementRun({
    previous_run: base.started,
    freeze,
    run_id: `passport-run-ct613-${suffix}`,
    version: "1.0.0",
    created_by: base.started.created_by,
    created_at: planCreatedAt,
    authorization_scope: authorizationScope,
    planned_window: {
      starts_at: windowStartsAt,
      ends_at: windowEndsAt
    }
  });
  const localImport = createPassportLocalRunImport({
    import_id: `passport-import-ct613-${suffix}`,
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    imported_by: plan.created_by,
    imported_at: importedAt,
    source: {
      kind: "local-process",
      media_type: "application/json",
      payload_fingerprint: hash(hashCharacters[0])
    },
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
  const preflight = createPassportRunPreflight({
    preflight_id: `passport-preflight-ct613-${suffix}`,
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    evaluated_by: "principal-synthetic-preflight",
    execution_principal_id: plan.created_by,
    evaluated_at: preflightAt,
    local_import: localImport,
    plan,
    freeze,
    authorization: {
      authorization_id: `authorization-ct613-${suffix}`,
      version: "1.0.0",
      tenant_id: plan.tenant_id,
      principal_id: plan.created_by,
      action: "execute-passport-run",
      decision: "allow",
      valid_from: authorizationStartsAt,
      valid_until: authorizationEndsAt,
      revoked_at: null,
      run_ref: runRef,
      freeze_ref: freezeRef,
      source_fingerprint: hash(hashCharacters[1])
    },
    clock: {
      source: "declared",
      checked_at: preflightAt,
      maximum_age_ms: 120000,
      maximum_skew_ms: 100,
      observed_skew_ms: 5,
      synchronized: true,
      source_fingerprint: hash(hashCharacters[2])
    },
    budget: {
      budget_id: `budget-ct613-${suffix}`,
      version: "1.0.0",
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      currency: "USD",
      limit_minor: 1000,
      committed_minor: 100,
      estimated_run_minor: 200,
      valid_until: authorizationEndsAt,
      source_fingerprint: hash(hashCharacters[3])
    },
    concurrency: {
      scope_id: `concurrency-ct613-${suffix}`,
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      checked_at: preflightAt,
      maximum_age_ms: 120000,
      maximum: 4,
      active: 1,
      requested: 1,
      source_fingerprint: hash(hashCharacters[4])
    },
    stop_conditions: [
      { condition_id: "stop-budget", kind: "budget-exhausted", metric: "spent_minor", operator: "gte", threshold: 900, unit: "USD:minor", action: "stop" },
      { condition_id: "stop-duration", kind: "max-duration", metric: "elapsed_ms", operator: "gte", threshold: 600000, unit: "ms", action: "stop" },
      { condition_id: "stop-failures", kind: "max-failures", metric: "failure_count", operator: "gte", threshold: 3, unit: "count", action: "stop" }
    ]
  });
  const run = startPassportRun({
    plan,
    freeze,
    local_import: localImport,
    preflight,
    execution_principal_id: plan.created_by,
    version: "1.0.1",
    started_at: windowStartsAt
  });
  return { freeze, run };
}

export function buildSyntheticPassportComparisonScenario() {
  const base = buildSyntheticPassportVersioningScenario();
  const baselineObservation = base.validObservation;
  const baselineVersion = createPassportEvidenceVersion({
    passport_id: "passport-ct613-baseline",
    version: "1.0.0",
    tenant_id: base.started.tenant_id,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:20:10.000Z",
    freshness_ttl_seconds: 7200,
    run: base.started,
    freeze: base.freeze,
    observations: [baselineObservation]
  });
  const comparableVariant = startVariant(base, {
    suffix: "comparison-dimension",
    freezeCreatedAt: "2026-10-23T10:20:30.000Z",
    planCreatedAt: "2026-10-23T10:21:00.000Z",
    importedAt: "2026-10-23T10:22:00.000Z",
    preflightAt: "2026-10-23T10:23:30.000Z",
    authorizationStartsAt: "2026-10-23T10:20:00.000Z",
    authorizationEndsAt: "2026-10-23T11:00:00.000Z",
    windowStartsAt: "2026-10-23T10:24:00.000Z",
    windowEndsAt: "2026-10-23T10:34:00.000Z",
    hashCharacters: ["0", "1", "2", "3", "4"],
    mutateFreeze: (input) => ({
      scenario: {
        ...input.scenario,
        sites: [
          input.scenario.sites[0],
          { site_id: "site-synthetic-c", role: "destination", region: "synthetic-north" }
        ],
        protocol: {
          protocol_id: "protocol-synthetic-grpc",
          version: "fixture-2",
          profile: null
        }
      }
    })
  });
  const comparableObservation = observationFor({
    observationId: "observation-ct613-comparable-mean",
    run: comparableVariant.run,
    freeze: comparableVariant.freeze,
    createdAt: "2026-10-23T10:30:03.000Z",
    observedAt: "2026-10-23T10:30:01.000Z",
    value: 30,
    sourceId: "source-ct613-comparable-generator",
    sourceHash: hash("b"),
    artifactHash: hash("c")
  });
  const comparableVersion = createPassportEvidenceVersion({
    passport_id: "passport-ct613-comparable",
    version: "1.0.0",
    tenant_id: comparableVariant.run.tenant_id,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:34:10.000Z",
    freshness_ttl_seconds: 7200,
    run: comparableVariant.run,
    freeze: comparableVariant.freeze,
    observations: [comparableObservation]
  });
  const workloadVariant = startVariant(base, {
    suffix: "workload-drift",
    freezeCreatedAt: "2026-10-23T10:21:00.000Z",
    planCreatedAt: "2026-10-23T10:22:00.000Z",
    importedAt: "2026-10-23T10:28:00.000Z",
    preflightAt: "2026-10-23T10:29:30.000Z",
    authorizationStartsAt: "2026-10-23T10:20:00.000Z",
    authorizationEndsAt: "2026-10-23T11:00:00.000Z",
    windowStartsAt: "2026-10-23T10:30:00.000Z",
    windowEndsAt: "2026-10-23T10:40:00.000Z",
    hashCharacters: ["6", "7", "8", "9", "a"],
    mutateFreeze: (input) => ({
      scenario: {
        ...input.scenario,
        workload: {
          ...input.scenario.workload,
          name: "synthetic-ttft-different-workload",
          configuration_fingerprint: hash("5")
        }
      }
    })
  });
  const workloadObservation = observationFor({
    observationId: "observation-ct613-workload-drift-mean",
    run: workloadVariant.run,
    freeze: workloadVariant.freeze,
    createdAt: "2026-10-23T10:35:02.000Z",
    observedAt: "2026-10-23T10:35:00.000Z",
    value: 24,
    sourceId: "source-ct613-workload-drift-generator",
    sourceHash: hash("d"),
    artifactHash: hash("e")
  });
  const workloadVersion = createPassportEvidenceVersion({
    passport_id: "passport-ct613-workload-drift",
    version: "1.0.0",
    tenant_id: workloadVariant.run.tenant_id,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:40:10.000Z",
    freshness_ttl_seconds: 7200,
    run: workloadVariant.run,
    freeze: workloadVariant.freeze,
    observations: [workloadObservation]
  });
  const methodVariant = startVariant(base, {
    suffix: "method-drift",
    freezeCreatedAt: "2026-10-23T10:41:00.000Z",
    planCreatedAt: "2026-10-23T10:42:00.000Z",
    importedAt: "2026-10-23T10:43:00.000Z",
    preflightAt: "2026-10-23T10:44:30.000Z",
    authorizationStartsAt: "2026-10-23T10:40:00.000Z",
    authorizationEndsAt: "2026-10-23T11:15:00.000Z",
    windowStartsAt: "2026-10-23T10:45:00.000Z",
    windowEndsAt: "2026-10-23T10:55:00.000Z",
    hashCharacters: ["f", "1", "2", "3", "4"],
    mutateFreeze: (input) => ({
      method_template: {
        ...input.method_template,
        version: "1.1.0",
        sampling: { ...input.method_template.sampling, target_count: 20 }
      }
    })
  });
  const methodObservation = observationFor({
    observationId: "observation-ct613-method-drift-mean",
    run: methodVariant.run,
    freeze: methodVariant.freeze,
    createdAt: "2026-10-23T10:50:02.000Z",
    observedAt: "2026-10-23T10:50:00.000Z",
    value: 22,
    sourceId: "source-ct613-method-drift-generator",
    sourceHash: hash("1"),
    artifactHash: hash("2")
  });
  const methodVersion = createPassportEvidenceVersion({
    passport_id: "passport-ct613-method-drift",
    version: "1.0.0",
    tenant_id: methodVariant.run.tenant_id,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:55:10.000Z",
    freshness_ttl_seconds: 7200,
    run: methodVariant.run,
    freeze: methodVariant.freeze,
    observations: [methodObservation]
  });
  const baseline = {
    version: baselineVersion,
    run: base.started,
    freeze: base.freeze,
    observations: [baselineObservation],
    events: []
  };
  const comparable = {
    version: comparableVersion,
    run: comparableVariant.run,
    freeze: comparableVariant.freeze,
    observations: [comparableObservation],
    events: []
  };
  const workloadDrift = {
    version: workloadVersion,
    run: workloadVariant.run,
    freeze: workloadVariant.freeze,
    observations: [workloadObservation],
    events: []
  };
  const methodDrift = {
    version: methodVersion,
    run: methodVariant.run,
    freeze: methodVariant.freeze,
    observations: [methodObservation],
    events: []
  };
  const candidates = [comparable, workloadDrift, methodDrift];
  const comparison = createPassportComparison({
    comparison_id: "passport-comparison-ct613-synthetic",
    version: "1.0.0",
    tenant_id: base.started.tenant_id,
    created_by: "principal-synthetic-analyst",
    created_at: "2026-10-23T10:55:20.000Z",
    baseline,
    candidates
  });
  const verified = verifyPassportComparison({ record: comparison, baseline, candidates });
  return { baseline, comparable, workloadDrift, methodDrift, comparison: verified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticPassportComparisonScenario();
  const comparable = scenario.comparison.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-comparable");
  const excluded = scenario.comparison.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-workload-drift");
  const methodExcluded = scenario.comparison.candidates.find(({ passport_ref: ref }) => ref.object_id === "passport-ct613-method-drift");
  console.log(JSON.stringify({
    schema_version: scenario.comparison.schema_version,
    data_origin: scenario.baseline.observations[0].source.origin,
    same_group_candidate: comparable.same_group,
    same_group_side_by_side: comparable.view_mode === "side-by-side-unranked",
    same_group_ranking_eligible: comparable.ranking_eligible,
    workload_drift_excluded: excluded.view_mode === "difference-only",
    workload_drift_blocked: excluded.blocker_codes.includes("workload_mismatch"),
    workload_drift_in_metric_rows: scenario.comparison.view.metric_rows.some(({ values }) => values.some(({ passport_ref: ref }) => ref.object_id === "passport-ct613-workload-drift")),
    method_drift_excluded: methodExcluded.view_mode === "difference-only",
    method_drift_blocked: methodExcluded.blocker_codes.includes("method_mismatch"),
    method_drift_in_metric_rows: scenario.comparison.view.metric_rows.some(({ values }) => values.some(({ passport_ref: ref }) => ref.object_id === "passport-ct613-method-drift")),
    default_ranking_applied: scenario.comparison.view.default_ranking_applied,
    explicit_ranking_policy_required: scenario.comparison.boundary.explicit_ranking_policy_required,
    comparison_record_immutable: Object.isFrozen(scenario.comparison),
    external_network_used: false,
    performance_claim_allowed: scenario.comparison.boundary.performance_claim_allowed,
    independent_review_claimed: scenario.comparison.boundary.independent_review_claimed,
    certification_issued: scenario.comparison.boundary.certification_issued
  }));
}
