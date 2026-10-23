import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import * as sdk from "../sdk/index.mjs";
import {
  PASSPORT_FREEZE_ERROR_CODES,
  createPassportLocalRunImport,
  createPassportRunPlan,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun
} from "../packages/link-evidence-passport/index.mjs";
import {
  PASSPORT_OBSERVATION_ERROR_CODES,
  PASSPORT_OBSERVATION_ORIGINS,
  PASSPORT_OBSERVATION_UNIT_RULES,
  PASSPORT_OBSERVATION_VERSION,
  createPassportNormalizedObservation,
  verifyPassportNormalizedObservation
} from "../packages/link-evidence-passport/observation.mjs";

const execute = promisify(execFile);
const hash = (value) => `sha256:${value.repeat(64)}`;
const assertCode = (code) => (error) => error?.code === code;

function fixture() {
  const tenantId = "tenant-synthetic-ct611";
  const authorizationScope = {
    visibility: "private",
    purpose: "Offline synthetic CT-611 contract test.",
    recipients: [],
    expires_at: "2027-10-23T09:30:00.000Z"
  };
  const freeze = createPassportScenarioMethodFreeze({
    freeze_id: "freeze-ct611-test",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: "principal-synthetic-author",
    created_at: "2026-10-23T09:00:00.000Z",
    authorization_scope: authorizationScope,
    scope_ref: { object_type: "scope", object_id: "scope-ct611-test", version: "1.0.0", tenant_id: tenantId },
    method_ref: { object_type: "method", object_id: "method-ct611-test", version: "1.0.0", tenant_id: tenantId },
    scenario: {
      sites: [
        { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" },
        { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" }
      ],
      direction: "unidirectional",
      protocol: { protocol_id: "protocol-synthetic", version: "fixture-1", profile: null },
      workload: {
        workload_class: "inference",
        name: "synthetic-ct611",
        version: "fixture-1",
        origin: "synthetic",
        configuration_fingerprint: hash("a")
      }
    },
    method_template: {
      template_id: "method-template-ct611-test",
      version: "1.0.0",
      tool: { name: "ct-bench-synthetic", version: "1.0.0", artifact_fingerprint: hash("b") },
      parameters: [],
      sampling: { target_count: 10, interval_ms: 100, warmup_count: 1 },
      exclusion_rules: [{ rule_id: "exclude-warmup", description: "Exclude the declared synthetic warm-up sample." }],
      statistics: [{ metric: "ttft_ms", aggregations: ["mean", "p95"] }],
      environment_prerequisites: ["Node.js 22 or later; external network disabled."]
    },
    boundary: {
      data_origin: "synthetic",
      limitations: ["Contract tests use generated values only."],
      performance_claim_allowed: false
    }
  });
  const plan = createPassportRunPlan({
    run_id: "run-ct611-test",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T09:01:00.000Z",
    authorization_scope: authorizationScope,
    freeze,
    planned_window: { starts_at: "2026-10-23T09:10:00.000Z", ends_at: "2026-10-23T09:20:00.000Z" }
  });
  const localImport = createPassportLocalRunImport({
    import_id: "import-ct611-test",
    version: "1.0.0",
    tenant_id: tenantId,
    imported_by: plan.created_by,
    imported_at: "2026-10-23T09:08:00.000Z",
    source: { kind: "local-process", media_type: "application/json", payload_fingerprint: hash("c") },
    plan,
    freeze
  });
  const runRef = { run_id: plan.run_id, version: plan.version, tenant_id: tenantId, content_fingerprint: plan.content_fingerprint };
  const freezeRef = { freeze_id: freeze.freeze_id, version: freeze.version, tenant_id: tenantId, content_fingerprint: freeze.content_fingerprint };
  const preflight = createPassportRunPreflight({
    preflight_id: "preflight-ct611-test",
    version: "1.0.0",
    tenant_id: tenantId,
    evaluated_by: "principal-synthetic-preflight",
    execution_principal_id: plan.created_by,
    evaluated_at: "2026-10-23T09:09:30.000Z",
    local_import: localImport,
    plan,
    freeze,
    authorization: {
      authorization_id: "authorization-ct611-test",
      version: "1.0.0",
      tenant_id: tenantId,
      principal_id: plan.created_by,
      action: "execute-passport-run",
      decision: "allow",
      valid_from: "2026-10-23T09:00:00.000Z",
      valid_until: "2026-10-23T09:30:00.000Z",
      revoked_at: null,
      run_ref: runRef,
      freeze_ref: freezeRef,
      source_fingerprint: hash("d")
    },
    clock: {
      source: "declared",
      checked_at: "2026-10-23T09:09:30.000Z",
      maximum_age_ms: 120000,
      maximum_skew_ms: 100,
      observed_skew_ms: 5,
      synchronized: true,
      source_fingerprint: hash("e")
    },
    budget: {
      budget_id: "budget-ct611-test",
      version: "1.0.0",
      tenant_id: tenantId,
      run_ref: runRef,
      currency: "USD",
      limit_minor: 1000,
      committed_minor: 100,
      estimated_run_minor: 200,
      valid_until: "2026-10-23T09:30:00.000Z",
      source_fingerprint: hash("f")
    },
    concurrency: {
      scope_id: "concurrency-ct611-test",
      tenant_id: tenantId,
      run_ref: runRef,
      checked_at: "2026-10-23T09:09:30.000Z",
      maximum_age_ms: 120000,
      maximum: 2,
      active: 0,
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
    started_at: "2026-10-23T09:10:00.000Z"
  });
  const artifactRef = {
    object_type: "artifact",
    object_id: "artifact-ct611-synthetic",
    version: "1.0.0",
    tenant_id: tenantId,
    content_fingerprint: hash("2")
  };
  const input = {
    observation_id: "observation-ct611-test",
    version: "1.0.0",
    tenant_id: tenantId,
    created_by: plan.created_by,
    created_at: "2026-10-23T09:15:02.000Z",
    run: started,
    freeze,
    observed_at: "2026-10-23T09:15:00.000Z",
    observation_point: "synthetic-destination",
    metric: "ttft_ms",
    aggregation: "p95",
    value: 0.046,
    unit: "s",
    samples: { attempted: 10, successful: 9, failed: 1, excluded: 1, included: 8 },
    failures: [{ code: "synthetic_timeout", stage: "request", count: 1 }],
    exclusions: [{ rule_id: "exclude-warmup", count: 1 }],
    source: {
      origin: "synthetic",
      kind: "generator",
      source_id: "source-ct611-test",
      collected_at: "2026-10-23T09:15:01.000Z",
      content_fingerprint: hash("3"),
      artifact_ref: artifactRef,
      input_observation_refs: [],
      declared_by: null
    },
    limitations: ["Generated test values are not measured performance."]
  };
  return { freeze, plan, started, input, artifactRef };
}

test("normalizes units and derives partial quality from a closed sample account", () => {
  const { freeze, started, input } = fixture();
  const observation = createPassportNormalizedObservation(input);
  assert.equal(observation.schema_version, PASSPORT_OBSERVATION_VERSION);
  assert.equal(observation.measurement.source_value, 0.046);
  assert.equal(observation.measurement.source_unit, "s");
  assert.equal(observation.measurement.normalized_value, 46);
  assert.equal(observation.measurement.normalized_unit, "ms");
  assert.equal(observation.samples.attempted, observation.samples.successful + observation.samples.failed);
  assert.equal(observation.samples.successful, observation.samples.included + observation.samples.excluded);
  assert.deepEqual(observation.quality, {
    status: "partial",
    flags: ["excluded_samples_retained", "failed_samples_retained"]
  });
  assert.equal(
    verifyPassportNormalizedObservation({ record: observation, run: started, freeze }).content_fingerprint,
    observation.content_fingerprint
  );
  assert.ok(Object.isFrozen(observation));
});

test("retains an all-failed attempt without inventing a metric value", () => {
  const { freeze, started, input } = fixture();
  const failed = createPassportNormalizedObservation({
    ...input,
    observation_id: "observation-ct611-all-failed",
    value: null,
    samples: { attempted: 2, successful: 0, failed: 2, excluded: 0, included: 0 },
    failures: [{ code: "synthetic_timeout", stage: "request", count: 2 }],
    exclusions: [],
    limitations: ["All generated attempts failed, so no aggregate value exists."]
  });
  assert.equal(failed.measurement.source_value, null);
  assert.equal(failed.measurement.normalized_value, null);
  assert.deepEqual(failed.quality, {
    status: "invalid",
    flags: ["failed_samples_retained", "no_included_samples"]
  });
  assert.equal(verifyPassportNormalizedObservation({ record: failed, run: started, freeze }).quality.status, "invalid");
});

test("rejects sample counts, failures, and exclusions that do not close", () => {
  const { input } = fixture();
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, samples: { ...input.samples, attempted: 11 } }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid)
  );
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, failures: [{ ...input.failures[0], count: 2 }] }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.sampleAccountingInvalid)
  );
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, exclusions: [{ rule_id: "exclude-not-frozen", count: 1 }] }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.exclusionNotFrozen)
  );
});

test("rejects units, metrics, aggregations, and timestamps outside the frozen run", () => {
  const { input } = fixture();
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, unit: "milliseconds" }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid)
  );
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, metric: "rtt_ms" }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.metricNotFrozen)
  );
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, aggregation: "p99" }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.aggregationNotFrozen)
  );
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, observed_at: "2026-10-23T09:21:00.000Z", created_at: "2026-10-23T09:21:02.000Z", source: { ...input.source, collected_at: "2026-10-23T09:21:01.000Z" } }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.timeInvalid)
  );
});

test("strictly separates measured, synthetic, inferred, and declared source rules", () => {
  const { input, artifactRef } = fixture();
  assert.deepEqual(PASSPORT_OBSERVATION_ORIGINS, ["measured", "synthetic", "inferred", "declared"]);
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, source: { ...input.source, origin: "measured", kind: "instrument" } }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch)
  );
  assert.throws(
    () => createPassportNormalizedObservation({
      ...input,
      source: {
        ...input.source,
        origin: "inferred",
        kind: "derivation",
        artifact_ref: null,
        input_observation_refs: [{ object_type: "observation", object_id: "observation-source", version: "1.0.0", tenant_id: input.tenant_id, content_fingerprint: hash("4") }]
      }
    }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch)
  );
  assert.throws(
    () => createPassportNormalizedObservation({
      ...input,
      source: { ...input.source, origin: "declared", kind: "attestation", artifact_ref: null, declared_by: "principal-declarant" }
    }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch)
  );
  assert.throws(
    () => createPassportNormalizedObservation({
      ...input,
      source: { ...input.source, origin: "synthetic", kind: "instrument", artifact_ref: artifactRef }
    }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch)
  );
});

test("detects normalized-value, quality, and fingerprint tampering", () => {
  const { freeze, started, input } = fixture();
  const observation = createPassportNormalizedObservation(input);
  const wrongConversion = structuredClone(observation);
  wrongConversion.measurement.normalized_value = 45;
  assert.throws(
    () => verifyPassportNormalizedObservation({ record: wrongConversion, run: started, freeze }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.unitInvalid)
  );
  const promoted = structuredClone(observation);
  promoted.quality = { status: "valid", flags: [] };
  assert.throws(
    () => verifyPassportNormalizedObservation({ record: promoted, run: started, freeze }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.originMismatch)
  );
  const forged = structuredClone(observation);
  forged.content_fingerprint = hash("9");
  assert.throws(
    () => verifyPassportNormalizedObservation({ record: forged, run: started, freeze }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.fingerprintMismatch)
  );
});

test("requires an exact started run", () => {
  const { freeze, plan, input } = fixture();
  assert.throws(
    () => createPassportNormalizedObservation({ ...input, run: plan }),
    assertCode(PASSPORT_OBSERVATION_ERROR_CODES.runNotStarted)
  );
  assert.equal(plan.state, "planned");
  assert.equal(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "passport_run_state_invalid");
});

test("publishes the schema, SDK surface, bilingual guide, and contributor scenario", async () => {
  const [schema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/normalized-observation-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/observation-normalization-and-quality-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/observation-normalization-and-quality-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/observation.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.record_type.const, "passport_normalized_observation");
  assert.equal(publicApi.sdk_version, "0.28.0");
  assert.ok(publicApi.public_contracts.includes("specs/passport/normalized-observation-v1.schema.json"));
  for (const exported of [
    "PASSPORT_OBSERVATION_VERSION",
    "PASSPORT_OBSERVATION_ORIGINS",
    "PASSPORT_OBSERVATION_UNIT_RULES",
    "PASSPORT_OBSERVATION_ERROR_CODES",
    "createPassportNormalizedObservation",
    "verifyPassportNormalizedObservation"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /measured.*synthetic.*inferred.*declared/is);
  assert.match(chinese, /实测、推断和声明|实测.*合成.*推断.*声明/s);
  assert.ok(environment.contract_tests.includes("tests/passport-observation-normalization.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-observation-normalization"));
});

test("runs the offline synthetic observation scenario without credentials or network", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/observation-normalization-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    normalized_value: 46,
    normalized_unit: "ms",
    attempted_samples: 10,
    failed_samples_retained: true,
    excluded_samples_retained: true,
    sample_accounting_closed: true,
    quality_status: "partial",
    origins_strictly_separated: true,
    external_network_used: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
});

test("keeps every canonical output unit inside Evidence Core", () => {
  for (const rule of Object.values(PASSPORT_OBSERVATION_UNIT_RULES)) {
    assert.ok(sdk.EVIDENCE_CANONICAL_UNITS.includes(rule.canonical_unit));
  }
});
