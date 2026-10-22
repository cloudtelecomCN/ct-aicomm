import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import * as sdk from "../sdk/index.mjs";
import {
  PASSPORT_FREEZE_ERROR_CODES,
  PASSPORT_PREFLIGHT_POLICY,
  PASSPORT_PREFLIGHT_VERSION,
  createPassportLocalRunImport,
  createPassportRunPlan,
  createPassportRunPreflight,
  createPassportScenarioMethodFreeze,
  startPassportRun,
  verifyPassportLocalRunImport,
  verifyPassportRunPreflight
} from "../packages/link-evidence-passport/index.mjs";

const execute = promisify(execFile);
const hash = (value) => `sha256:${value.repeat(64)}`;
const assertCode = (code) => (error) => error?.code === code;

function fixture() {
  const authorizationScope = {
    visibility: "private",
    purpose: "Offline synthetic CT-610 preflight contract test.",
    recipients: [],
    expires_at: "2027-10-23T09:00:00.000Z"
  };
  const freeze = createPassportScenarioMethodFreeze({
    freeze_id: "freeze-ct610-synthetic-a-b",
    version: "1.0.0",
    tenant_id: "tenant-synthetic-alpha",
    created_by: "principal-synthetic-author",
    created_at: "2026-10-23T09:00:00.000Z",
    authorization_scope: authorizationScope,
    scope_ref: { object_type: "scope", object_id: "scope-ct610-synthetic-a-b", version: "1.0.0", tenant_id: "tenant-synthetic-alpha" },
    method_ref: { object_type: "method", object_id: "method-ct610-synthetic", version: "1.0.0", tenant_id: "tenant-synthetic-alpha" },
    scenario: {
      sites: [
        { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" },
        { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" }
      ],
      direction: "unidirectional",
      protocol: { protocol_id: "protocol-synthetic-quic", version: "draft-synthetic-1", profile: null },
      workload: {
        workload_class: "network-transfer",
        name: "synthetic-local-preflight",
        version: "fixture-1",
        origin: "synthetic",
        configuration_fingerprint: hash("a")
      }
    },
    method_template: {
      template_id: "method-template-ct610-synthetic",
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
      limitations: ["No customer endpoint, credential, or measured performance is included."],
      performance_claim_allowed: false
    }
  });
  const plan = createPassportRunPlan({
    run_id: "passport-run-ct610-synthetic-001",
    version: "1.0.0",
    tenant_id: freeze.tenant_id,
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T09:01:00.000Z",
    authorization_scope: authorizationScope,
    freeze,
    planned_window: {
      starts_at: "2026-10-23T09:10:00.000Z",
      ends_at: "2026-10-23T09:20:00.000Z"
    }
  });
  const localImport = createPassportLocalRunImport({
    import_id: "passport-import-ct610-synthetic-001",
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    imported_by: plan.created_by,
    imported_at: "2026-10-23T09:08:00.000Z",
    source: { kind: "local-file", media_type: "application/json", payload_fingerprint: hash("c") },
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
    preflight_id: "passport-preflight-ct610-synthetic-001",
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    evaluated_by: "principal-synthetic-preflight",
    execution_principal_id: plan.created_by,
    evaluated_at: "2026-10-23T09:09:30.000Z",
    local_import: localImport,
    plan,
    freeze,
    authorization: {
      authorization_id: "authorization-ct610-synthetic-001",
      version: "1.0.0",
      tenant_id: plan.tenant_id,
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
      source_fingerprint: hash("f")
    },
    budget: {
      budget_id: "budget-ct610-synthetic",
      version: "1.0.0",
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      currency: "USD",
      limit_minor: 1000,
      committed_minor: 100,
      estimated_run_minor: 200,
      valid_until: "2026-10-23T09:30:00.000Z",
      source_fingerprint: hash("e")
    },
    concurrency: {
      scope_id: "concurrency-ct610-synthetic",
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      checked_at: "2026-10-23T09:09:30.000Z",
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
  return { freeze, plan, localImport, preflightInput };
}

test("creates an offline local import without retaining a path, payload, or credentials", () => {
  const { localImport } = fixture();
  assert.equal(localImport.schema_version, PASSPORT_PREFLIGHT_VERSION);
  assert.equal(localImport.boundary.mode, "local-offline");
  assert.equal(localImport.boundary.network_accessed, false);
  assert.equal(localImport.boundary.raw_payload_retained, false);
  assert.equal(localImport.boundary.credentials_retained, false);
  assert.equal(Object.hasOwn(localImport.source, "path"), false);
  assert.equal(Object.hasOwn(localImport, "payload"), false);
  assert.equal(verifyPassportLocalRunImport(localImport).content_fingerprint, localImport.content_fingerprint);
  assert.equal(Object.isFrozen(localImport), true);
});

test("passes all five gates and starts only the exact imported run", () => {
  const { freeze, plan, localImport, preflightInput } = fixture();
  const preflight = createPassportRunPreflight(preflightInput);
  assert.equal(preflight.policy, PASSPORT_PREFLIGHT_POLICY);
  assert.equal(preflight.decision, "passed");
  assert.deepEqual(preflight.blockers, []);
  assert.deepEqual(Object.values(preflight.gate_results).map(({ status }) => status), Array(5).fill("passed"));
  assert.equal(verifyPassportRunPreflight(preflight).content_fingerprint, preflight.content_fingerprint);
  assert.throws(
    () => startPassportRun({
      plan,
      freeze,
      local_import: localImport,
      preflight,
      execution_principal_id: "principal-synthetic-other",
      version: "1.0.1",
      started_at: "2026-10-23T09:10:00.000Z"
    }),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch)
  );

  const started = startPassportRun({
    plan,
    freeze,
    local_import: localImport,
    preflight,
    execution_principal_id: plan.created_by,
    version: "1.0.1",
    started_at: "2026-10-23T09:10:00.000Z"
  });
  assert.equal(started.state, "started");
  assert.equal(started.started_at, "2026-10-23T09:10:00.000Z");
  assert.equal(plan.state, "planned");
});

test("requires both a local import and a preflight for the only public start transition", () => {
  const { freeze, plan, localImport } = fixture();
  assert.throws(
    () => startPassportRun({ plan, freeze, version: "1.0.1", started_at: "2026-10-23T09:10:00.000Z" }),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.localImportRequired)
  );
  assert.throws(
    () => startPassportRun({ plan, freeze, local_import: localImport, version: "1.0.1", started_at: "2026-10-23T09:10:00.000Z" }),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.preflightRequired)
  );
  assert.equal(plan.state, "planned");
});

for (const [name, mutate, expectedGate, expectedCode] of [
  ["authorization denial", (input) => { input.authorization.decision = "deny"; }, "authorization", "authorization_denied"],
  ["scheduled authorization revocation", (input) => { input.authorization.revoked_at = "2026-10-23T09:15:00.000Z"; }, "authorization", "authorization_revoked"],
  ["clock skew", (input) => { input.clock.observed_skew_ms = 101; }, "clock", "clock_skew_exceeded"],
  ["clock expiry before run", (input) => { input.clock.maximum_age_ms = 10000; }, "clock", "clock_stale"],
  ["budget exhaustion", (input) => { input.budget.estimated_run_minor = 901; }, "budget", "budget_exceeded"],
  ["cross-tenant budget", (input) => { input.budget.tenant_id = "tenant-synthetic-other"; }, "budget", "budget_scope_mismatch"],
  ["concurrency exhaustion", (input) => { input.concurrency.requested = 4; }, "concurrency", "concurrency_exceeded"],
  ["concurrency snapshot expiry before run", (input) => { input.concurrency.maximum_age_ms = 10000; }, "concurrency", "concurrency_stale"],
  ["cross-run concurrency snapshot", (input) => { input.concurrency.run_ref.run_id = "passport-run-synthetic-other"; }, "concurrency", "concurrency_scope_mismatch"],
  ["unsafe stop action", (input) => { input.stop_conditions[0].action = "warn"; }, "stop_conditions", "stop_condition_unsafe"],
  ["missing hard stop conditions", (input) => { input.stop_conditions = []; }, "stop_conditions", "stop_conditions_incomplete"]
]) {
  test(`${name} produces failed evidence and cannot enter started`, () => {
    const { freeze, plan, localImport, preflightInput } = fixture();
    mutate(preflightInput);
    const preflight = createPassportRunPreflight(preflightInput);
    assert.equal(preflight.decision, "failed");
    assert.equal(preflight.gate_results[expectedGate].status, "failed");
    assert.ok(preflight.gate_results[expectedGate].codes.includes(expectedCode));
    assert.throws(
      () => startPassportRun({
        plan,
        freeze,
        local_import: localImport,
        preflight,
        execution_principal_id: plan.created_by,
        version: "1.0.1",
        started_at: "2026-10-23T09:10:00.000Z"
      }),
      assertCode(PASSPORT_FREEZE_ERROR_CODES.preflightFailed)
    );
    assert.equal(plan.state, "planned");
  });
}

test("rejects an otherwise passed preflight after its freshness window", () => {
  const { freeze, plan, localImport, preflightInput } = fixture();
  const preflight = createPassportRunPreflight(preflightInput);
  assert.equal(preflight.valid_until, "2026-10-23T09:11:30.000Z");
  assert.throws(
    () => startPassportRun({
      plan,
      freeze,
      local_import: localImport,
      preflight,
      execution_principal_id: plan.created_by,
      version: "1.0.1",
      started_at: "2026-10-23T09:12:00.000Z"
    }),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.preflightExpired)
  );
  assert.equal(plan.state, "planned");
});

test("detects tampering and refuses a forged passed decision", () => {
  const { preflightInput } = fixture();
  preflightInput.authorization.decision = "deny";
  const failed = createPassportRunPreflight(preflightInput);
  const forged = structuredClone(failed);
  forged.decision = "passed";
  forged.blockers = [];
  for (const gate of Object.keys(forged.gate_results)) forged.gate_results[gate] = { status: "passed", codes: [] };
  assert.throws(
    () => verifyPassportRunPreflight(forged),
    (error) => [PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch].includes(error?.code)
  );
});

test("publishes strict schemas, SDK exports, bilingual docs, and the contributor scenario", async () => {
  const [localSchema, preflightSchema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/local-run-import-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/passport/run-preflight-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/local-import-and-run-preflight-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/local-import-and-run-preflight-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/index.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(localSchema.additionalProperties, false);
  assert.equal(preflightSchema.additionalProperties, false);
  assert.equal(localSchema.properties.boundary.$ref, "#/$defs/boundary");
  assert.equal(preflightSchema.properties.policy.const, PASSPORT_PREFLIGHT_POLICY);
  assert.equal(publicApi.sdk_version, "0.20.0");
  for (const contract of [
    "specs/passport/local-run-import-v1.schema.json",
    "specs/passport/run-preflight-v1.schema.json"
  ]) assert.ok(publicApi.public_contracts.includes(contract), contract);
  for (const exported of [
    "PASSPORT_PREFLIGHT_VERSION",
    "PASSPORT_PREFLIGHT_POLICY",
    "createPassportLocalRunImport",
    "verifyPassportLocalRunImport",
    "createPassportRunPreflight",
    "verifyPassportRunPreflight"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /failed preflight cannot/i);
  assert.match(chinese, /预检失败.*不能/);
  assert.ok(environment.contract_tests.includes("tests/passport-local-import-preflight.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-local-import-preflight"));
});

test("runs the offline synthetic preflight scenario without credentials or network", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/local-import-preflight-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  const result = JSON.parse(stdout);
  assert.deepEqual(result, {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    local_import_verified: true,
    passed_preflight_verified: true,
    all_five_gates_passed: true,
    started_after_passed_preflight: true,
    failed_preflight_recorded: true,
    failed_preflight_blocked_start: true,
    failed_run_remained_planned: true,
    raw_payload_retained: false,
    credentials_retained: false,
    external_network_used: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
});
