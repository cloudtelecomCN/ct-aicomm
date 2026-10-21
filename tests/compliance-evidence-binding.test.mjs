import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXECUTION_EVIDENCE_BINDING_VERSION,
  createExecutionEvidenceBinding,
  verifyExecutionEvidenceBinding
} from "../packages/compliance/evidence-binding.mjs";

const tenantId = "tenant-alpha";
const executionId = "execution-001";

function hash(character) {
  return `sha256:${character.repeat(64)}`;
}

function components(overrides = {}) {
  return {
    policy: { tenant_id: tenantId, policy_id: "policy-low-latency", policy_version: "8", policy_fingerprint: hash("a") },
    agent: { tenant_id: tenantId, agent_id: "agent-01", agent_version: "0.1.0", agent_fingerprint: hash("b") },
    route: { tenant_id: tenantId, execution_id: executionId, route_id: "route-east", route_version: "17", route_fingerprint: hash("c") },
    trace: { tenant_id: tenantId, execution_id: executionId, trace_id: "trace-001", trace_version: "1.0.0", trace_fingerprint: hash("d") },
    environment: { tenant_id: tenantId, environment_id: "environment-01", environment_version: "2.0.0", environment_fingerprint: hash("e") },
    ...overrides
  };
}

function create(overrides = {}) {
  return createExecutionEvidenceBinding({
    bindingId: "binding-001",
    tenantId,
    executionId,
    evidenceOrigin: "measured",
    components: components(),
    createdAt: new Date("2026-10-22T08:00:00.000Z"),
    ...overrides
  });
}

function context(overrides = {}) {
  return { tenant_id: tenantId, execution_id: executionId, components: components(), ...overrides };
}

test("creates and verifies one immutable tenant- and version-locked evidence binding", () => {
  const binding = create();
  assert.equal(binding.schema_version, EXECUTION_EVIDENCE_BINDING_VERSION);
  assert.match(binding.lock_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(binding.binding_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(verifyExecutionEvidenceBinding(binding, context()), {
    valid: true,
    binding_id: "binding-001",
    tenant_id: tenantId,
    execution_id: executionId,
    binding_fingerprint: binding.binding_fingerprint,
    evidence_origin: "measured"
  });
  assert.throws(() => { binding.components.policy.policy_version = "9"; }, TypeError);
});

test("rejects cross-tenant and cross-execution evidence while creating a binding", () => {
  assert.throws(() => create({ components: components({ policy: { ...components().policy, tenant_id: "tenant-other" } }) }), (error) => error.code === "binding_policy_tenant_mismatch");
  assert.throws(() => create({ components: components({ route: { ...components().route, execution_id: "execution-other" } }) }), (error) => error.code === "binding_route_execution_mismatch");
  assert.throws(() => create({ components: components({ trace: { ...components().trace, tenant_id: "tenant-other" } }) }), (error) => error.code === "binding_trace_tenant_mismatch");
});

test("requires an authoritative context and rejects cross-tenant or cross-version reuse", () => {
  const binding = create();
  assert.throws(() => verifyExecutionEvidenceBinding(binding), (error) => error.code === "expected_context_required");
  assert.throws(() => verifyExecutionEvidenceBinding(binding, context({ tenant_id: "tenant-other", components: components({
    policy: { ...components().policy, tenant_id: "tenant-other" },
    agent: { ...components().agent, tenant_id: "tenant-other" },
    route: { ...components().route, tenant_id: "tenant-other" },
    trace: { ...components().trace, tenant_id: "tenant-other" },
    environment: { ...components().environment, tenant_id: "tenant-other" }
  }) })), (error) => error.code === "binding_tenant_mismatch");
  assert.throws(() => verifyExecutionEvidenceBinding(binding, context({ components: components({ agent: { ...components().agent, agent_version: "0.2.0" } }) })), (error) => error.code === "binding_agent_version_mismatch");
  assert.throws(() => verifyExecutionEvidenceBinding(binding, context({ components: components({ policy: { ...components().policy, policy_fingerprint: hash("f") } }) })), (error) => error.code === "binding_policy_fingerprint_mismatch");
});

test("detects tampering even when tenant and execution identifiers are unchanged", () => {
  const binding = structuredClone(create());
  binding.components.route.route_version = "18";
  assert.throws(() => verifyExecutionEvidenceBinding(binding, context()), (error) => error.code === "binding_lock_mismatch");
});

test("keeps the checked-in example synthetic and independently verifiable", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/compliance/synthetic-execution-evidence-binding.json", import.meta.url), "utf8"));
  assert.equal(example.evidence_origin, "synthetic");
  const expected = { tenant_id: example.tenant_id, execution_id: example.execution_id, components: structuredClone(example.components) };
  assert.equal(verifyExecutionEvidenceBinding(example, expected).valid, true);
});
