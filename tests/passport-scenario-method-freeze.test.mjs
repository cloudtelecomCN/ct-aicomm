import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PASSPORT_CHANGE_POLICY,
  PASSPORT_FREEZE_ERROR_CODES,
  PASSPORT_FREEZE_VERSION,
  assertPassportRunFreeze,
  createPassportLocalRunImport,
  createPassportReplacementRun,
  createPassportRunPreflight,
  createPassportRunPlan,
  createPassportScenarioMethodFreeze,
  startPassportRun,
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "../packages/link-evidence-passport/index.mjs";

const execute = promisify(execFile);
const hash = (value) => `sha256:${value.repeat(64)}`;

function authorizationScope() {
  return {
    visibility: "shared",
    purpose: "Offline synthetic CT-609 contract test.",
    recipients: ["organization-synthetic-reviewer"],
    expires_at: "2027-10-23T08:00:00.000Z"
  };
}

function freezeInput() {
  return {
    freeze_id: "freeze-synthetic-link-a-b",
    version: "1.0.0",
    tenant_id: "tenant-synthetic-alpha",
    created_by: "principal-synthetic-author",
    created_at: "2026-10-23T08:00:00.000Z",
    authorization_scope: authorizationScope(),
    scope_ref: {
      object_type: "scope",
      object_id: "scope-synthetic-link-a-b",
      version: "1.0.0",
      tenant_id: "tenant-synthetic-alpha"
    },
    method_ref: {
      object_type: "method",
      object_id: "method-synthetic-link-v1",
      version: "1.0.0",
      tenant_id: "tenant-synthetic-alpha"
    },
    scenario: {
      sites: [
        { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" },
        { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" }
      ],
      direction: "unidirectional",
      protocol: { protocol_id: "protocol-synthetic-quic", version: "draft-synthetic-1", profile: "datagram-disabled" },
      workload: {
        workload_class: "inference",
        name: "synthetic-ttft-workload",
        version: "fixture-1",
        origin: "synthetic",
        configuration_fingerprint: hash("c")
      }
    },
    method_template: {
      template_id: "method-template-synthetic-ttft",
      version: "1.0.0",
      tool: { name: "ct-bench-synthetic-fixture", version: "1.0.0", artifact_fingerprint: hash("a") },
      parameters: [
        { name: "request_timeout_ms", value: 30000, unit: "ms" },
        { name: "external_network_access", value: false, unit: null }
      ],
      sampling: { target_count: 20, interval_ms: 100, warmup_count: 2 },
      exclusion_rules: [
        { rule_id: "exclude-synthetic-warmup", description: "Exclude the two declared synthetic warm-up samples." }
      ],
      statistics: [
        { metric: "ttft_ms", aggregations: ["p95", "count", "mean"] }
      ],
      environment_prerequisites: ["Node.js 22 or later with external network access disabled."]
    },
    boundary: {
      data_origin: "synthetic",
      limitations: ["No network request, customer endpoint, or measured performance is included."],
      performance_claim_allowed: false
    }
  };
}

function runPlan(freeze = createPassportScenarioMethodFreeze(freezeInput())) {
  return createPassportRunPlan({
    run_id: "passport-run-synthetic-001",
    version: "1.0.0",
    tenant_id: freeze.tenant_id,
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T08:05:00.000Z",
    authorization_scope: authorizationScope(),
    freeze,
    planned_window: {
      starts_at: "2026-10-23T08:10:00.000Z",
      ends_at: "2026-10-23T08:20:00.000Z"
    }
  });
}

function startGate(plan, freeze) {
  const localImport = createPassportLocalRunImport({
    import_id: `import-${plan.run_id}`,
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    imported_by: plan.created_by,
    imported_at: "2026-10-23T08:09:00.000Z",
    source: {
      kind: "local-process",
      media_type: "application/json",
      payload_fingerprint: hash("9")
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
    preflight_id: `preflight-${plan.run_id}`,
    version: "1.0.0",
    tenant_id: plan.tenant_id,
    evaluated_by: "principal-synthetic-preflight",
    execution_principal_id: plan.created_by,
    evaluated_at: "2026-10-23T08:09:30.000Z",
    local_import: localImport,
    plan,
    freeze,
    authorization: {
      authorization_id: `authorization-${plan.run_id}`,
      version: "1.0.0",
      tenant_id: plan.tenant_id,
      principal_id: plan.created_by,
      action: "execute-passport-run",
      decision: "allow",
      valid_from: "2026-10-23T08:00:00.000Z",
      valid_until: "2026-10-23T08:30:00.000Z",
      revoked_at: null,
      run_ref: runRef,
      freeze_ref: freezeRef,
      source_fingerprint: hash("8")
    },
    clock: {
      source: "declared",
      checked_at: "2026-10-23T08:09:30.000Z",
      maximum_age_ms: 600000,
      maximum_skew_ms: 100,
      observed_skew_ms: 5,
      synchronized: true,
      source_fingerprint: hash("6")
    },
    budget: {
      budget_id: "budget-synthetic-passport",
      version: "1.0.0",
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      currency: "USD",
      limit_minor: 1000,
      committed_minor: 100,
      estimated_run_minor: 200,
      valid_until: "2026-10-23T08:30:00.000Z",
      source_fingerprint: hash("7")
    },
    concurrency: {
      scope_id: "concurrency-synthetic-passport",
      tenant_id: plan.tenant_id,
      run_ref: runRef,
      checked_at: "2026-10-23T08:09:30.000Z",
      maximum_age_ms: 600000,
      maximum: 4,
      active: 1,
      requested: 1,
      source_fingerprint: hash("5")
    },
    stop_conditions: [
      { condition_id: "stop-budget", kind: "budget-exhausted", metric: "spent_minor", operator: "gte", threshold: 900, unit: "USD:minor", action: "stop" },
      { condition_id: "stop-duration", kind: "max-duration", metric: "elapsed_ms", operator: "gte", threshold: 600000, unit: "ms", action: "stop" },
      { condition_id: "stop-failures", kind: "max-failures", metric: "failure_count", operator: "gte", threshold: 3, unit: "count", action: "stop" }
    ]
  });
  return { localImport, preflight };
}

function startPlan(plan, freeze, version = "1.0.1") {
  const { localImport, preflight } = startGate(plan, freeze);
  return startPassportRun({
    plan,
    freeze,
    local_import: localImport,
    preflight,
    execution_principal_id: plan.created_by,
    version,
    started_at: "2026-10-23T08:10:00.000Z"
  });
}

function startedRun(freeze = createPassportScenarioMethodFreeze(freezeInput())) {
  return startPlan(runPlan(freeze), freeze);
}

function assertCode(code) {
  return (error) => error?.code === code;
}

function assertClosedObjectSchemas(value, path = "$", seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.type === "object" && value.properties) {
    assert.equal(value.additionalProperties, false, `${path} must reject unknown fields`);
  }
  for (const [key, child] of Object.entries(value)) assertClosedObjectSchemas(child, `${path}.${key}`, seen);
}

test("creates a deterministic freeze for site, direction, protocol, workload, and method", () => {
  const input = freezeInput();
  const first = createPassportScenarioMethodFreeze(input);
  const reordered = createPassportScenarioMethodFreeze({
    ...input,
    authorization_scope: { ...input.authorization_scope, recipients: [...input.authorization_scope.recipients].reverse() },
    scenario: { ...input.scenario, sites: [...input.scenario.sites].reverse() },
    method_template: {
      ...input.method_template,
      parameters: [...input.method_template.parameters].reverse(),
      statistics: input.method_template.statistics.map((entry) => ({ ...entry, aggregations: [...entry.aggregations].reverse() }))
    }
  });

  assert.equal(first.content_fingerprint, reordered.content_fingerprint);
  assert.equal(first.scenario.sites[0].role, "source");
  assert.deepEqual(first.method_template.statistics[0].aggregations, ["count", "mean", "p95"]);
  assert.equal(verifyPassportScenarioMethodFreeze(first).content_fingerprint, first.content_fingerprint);
  assert.equal(Object.isFrozen(first.method_template.parameters), true);
  assert.throws(() => { first.scenario.direction = "bidirectional"; }, TypeError);
});

test("rejects floating versions, unknown fields, cross-tenant references, and false claim boundaries", () => {
  const unknown = freezeInput();
  unknown.credential = "must-not-be-carried";
  assert.throws(() => createPassportScenarioMethodFreeze(unknown), assertCode(PASSPORT_FREEZE_ERROR_CODES.fieldUnknown));

  const floating = freezeInput();
  floating.scenario.protocol.version = "latest";
  assert.throws(() => createPassportScenarioMethodFreeze(floating), assertCode(PASSPORT_FREEZE_ERROR_CODES.versionFloating));

  const crossTenant = freezeInput();
  crossTenant.method_ref.tenant_id = "tenant-synthetic-other";
  assert.throws(() => createPassportScenarioMethodFreeze(crossTenant), assertCode(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch));

  const duplicateRole = freezeInput();
  duplicateRole.scenario.sites[0].role = "source";
  assert.throws(() => createPassportScenarioMethodFreeze(duplicateRole), assertCode(PASSPORT_FREEZE_ERROR_CODES.inputInvalid));

  const claim = freezeInput();
  claim.boundary.performance_claim_allowed = true;
  assert.throws(() => createPassportScenarioMethodFreeze(claim), assertCode(PASSPORT_FREEZE_ERROR_CODES.inputInvalid));

  const mislabeled = freezeInput();
  mislabeled.boundary.data_origin = "measured";
  assert.throws(() => createPassportScenarioMethodFreeze(mislabeled), assertCode(PASSPORT_FREEZE_ERROR_CODES.inputInvalid));
});

test("binds a started run to one exact freeze and protects both fingerprints", () => {
  const freeze = createPassportScenarioMethodFreeze(freezeInput());
  const plan = runPlan(freeze);
  const started = startPlan(plan, freeze);

  assert.equal(plan.state, "planned");
  assert.equal(plan.started_at, null);
  assert.equal(started.state, "started");
  assert.equal(started.freeze_ref.content_fingerprint, freeze.content_fingerprint);
  assert.equal(started.change_policy, PASSPORT_CHANGE_POLICY);
  assert.equal(assertPassportRunFreeze({ run: started, freeze }).matched, true);
  assert.equal(verifyPassportRunBinding(started).content_fingerprint, started.content_fingerprint);
  assert.throws(
    () => startPlan(plan, freeze, plan.version),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.inputInvalid)
  );

  const tamperedFreeze = structuredClone(freeze);
  tamperedFreeze.scenario.protocol.profile = "tampered";
  assert.throws(() => verifyPassportScenarioMethodFreeze(tamperedFreeze), assertCode(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch));

  const tamperedRun = structuredClone(started);
  tamperedRun.freeze_ref.version = "2.0.0";
  assert.throws(() => verifyPassportRunBinding(tamperedRun), assertCode(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch));
});

test("requires a new run after every protected scenario or method change", () => {
  const originalFreeze = createPassportScenarioMethodFreeze(freezeInput());
  const started = startedRun(originalFreeze);
  const mutations = [
    (input) => { input.scenario.sites[0].region = "synthetic-central"; },
    (input) => { input.scenario.direction = "bidirectional"; },
    (input) => { input.scenario.protocol.version = "draft-synthetic-2"; },
    (input) => { input.scenario.workload.configuration_fingerprint = hash("d"); },
    (input) => { input.method_ref.version = "1.1.0"; },
    (input) => { input.method_template.parameters[0].value = 45000; },
    (input) => { input.method_template.sampling.target_count = 40; },
    (input) => { input.method_template.exclusion_rules[0].description = "Exclude three declared synthetic warm-up samples."; },
    (input) => { input.method_template.statistics[0].aggregations.push("p99"); },
    (input) => { input.method_template.environment_prerequisites.push("A deterministic fixture clock is available."); }
  ];

  mutations.forEach((mutate, index) => {
    const input = freezeInput();
    input.version = `1.${index + 1}.0`;
    input.created_at = `2026-10-23T08:${String(index + 11).padStart(2, "0")}:00.000Z`;
    mutate(input);
    const changed = createPassportScenarioMethodFreeze(input);
    assert.notEqual(changed.content_fingerprint, originalFreeze.content_fingerprint, `mutation ${index} must change the freeze fingerprint`);
    assert.throws(
      () => assertPassportRunFreeze({ run: started, freeze: changed }),
      assertCode(PASSPORT_FREEZE_ERROR_CODES.newRunRequired)
    );
  });
});

test("creates a traceable replacement only with a different run identity", () => {
  const originalFreeze = createPassportScenarioMethodFreeze(freezeInput());
  const started = startedRun(originalFreeze);
  const changedInput = freezeInput();
  changedInput.version = "1.1.0";
  changedInput.method_template.sampling.target_count = 40;
  const changedFreeze = createPassportScenarioMethodFreeze(changedInput);
  const replacementInput = {
    previous_run: started,
    freeze: changedFreeze,
    run_id: "passport-run-synthetic-002",
    version: "1.0.0",
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T08:12:00.000Z",
    authorization_scope: authorizationScope(),
    planned_window: {
      starts_at: "2026-10-23T08:30:00.000Z",
      ends_at: "2026-10-23T08:40:00.000Z"
    }
  };

  assert.throws(
    () => createPassportReplacementRun({ ...replacementInput, run_id: started.run_id }),
    assertCode(PASSPORT_FREEZE_ERROR_CODES.newRunIdRequired)
  );
  const replacement = createPassportReplacementRun(replacementInput);
  assert.equal(replacement.state, "planned");
  assert.equal(replacement.freeze_ref.content_fingerprint, changedFreeze.content_fingerprint);
  assert.deepEqual(replacement.supersedes_run_ref, {
    run_id: started.run_id,
    version: started.version,
    tenant_id: started.tenant_id,
    content_fingerprint: started.content_fingerprint
  });
  assert.equal(assertPassportRunFreeze({ run: replacement, freeze: changedFreeze }).matched, true);
  assert.equal(started.freeze_ref.content_fingerprint, originalFreeze.content_fingerprint);
});

test("publishes strict schemas, bilingual guidance, SDK exports, and an offline scenario", async () => {
  const [freezeSchema, runSchema, english, chinese, packageEnglish, packageChinese, publicApi, environment, sdk, types] = await Promise.all([
    readFile(new URL("../specs/passport/scenario-method-freeze-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/passport/run-freeze-binding-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/scenario-and-method-freeze-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/scenario-and-method-freeze-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs"),
    readFile(new URL("../packages/link-evidence-passport/index.d.ts", import.meta.url), "utf8")
  ]);

  assert.equal(freezeSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(runSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(freezeSchema.additionalProperties, false);
  assert.equal(runSchema.additionalProperties, false);
  assertClosedObjectSchemas(freezeSchema);
  assertClosedObjectSchemas(runSchema);
  for (const document of [english, chinese, packageEnglish, packageChinese]) {
    assert.match(document, /passport_new_run_required/iu);
    assert.match(document, /run_id/iu);
    assert.match(document, /synthetic|合成/iu);
    assert.match(document, /certification|认证/iu);
  }
  assert.equal(publicApi.sdk_version, "0.27.0");
  for (const contract of [
    "specs/passport/scenario-method-freeze-v1.schema.json",
    "specs/passport/run-freeze-binding-v1.schema.json"
  ]) assert.ok(publicApi.public_contracts.includes(contract));
  for (const tool of [
    "packages/link-evidence-passport/index.mjs",
    "packages/link-evidence-passport/index.d.ts"
  ]) assert.ok(publicApi.public_tools.includes(tool));
  for (const exported of [
    "PASSPORT_FREEZE_VERSION",
    "PASSPORT_CHANGE_POLICY",
    "PASSPORT_FREEZE_ERROR_CODES",
    "createPassportScenarioMethodFreeze",
    "verifyPassportScenarioMethodFreeze",
    "createPassportRunPlan",
    "verifyPassportRunBinding",
    "startPassportRun",
    "assertPassportRunFreeze",
    "createPassportReplacementRun"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.equal(typeof sdk[exported] === "function" || typeof sdk[exported] === "object" || typeof sdk[exported] === "string", true, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.ok(environment.contract_tests.includes("tests/passport-scenario-method-freeze.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-scenario-method-freeze"));

  const scenario = await execute(process.execPath, ["examples/passport/scenario-method-freeze-synthetic.mjs"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8"
  });
  const output = JSON.parse(scenario.stdout);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.changed_parameter_rejected, true);
  assert.equal(output.new_run_required, true);
  assert.equal(output.same_run_id_rejected, true);
  assert.equal(output.replacement_run_created, true);
  assert.equal(output.external_network_used, false);
  assert.equal(output.certification_issued, false);
});
