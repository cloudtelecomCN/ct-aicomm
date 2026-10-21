import { fingerprint } from "../agent-control/protocol.mjs";

export const EXECUTION_EVIDENCE_BINDING_VERSION = "1.0.0";

const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const COMPONENTS = Object.freeze({
  policy: Object.freeze({ id: "policy_id", version: "policy_version", hash: "policy_fingerprint", executionScoped: false }),
  agent: Object.freeze({ id: "agent_id", version: "agent_version", hash: "agent_fingerprint", executionScoped: false }),
  route: Object.freeze({ id: "route_id", version: "route_version", hash: "route_fingerprint", executionScoped: true }),
  trace: Object.freeze({ id: "trace_id", version: "trace_version", hash: "trace_fingerprint", executionScoped: true }),
  environment: Object.freeze({ id: "environment_id", version: "environment_version", hash: "environment_fingerprint", executionScoped: false })
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, code) {
  if (!isObject(value)) fail(`${code}_object_invalid`, `${code} must be a plain object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${code}_field_unknown`, `${code}.${key} is not allowed`);
  for (const key of fields) if (!Object.hasOwn(value, key)) fail(`${code}_field_missing`, `${code}.${key} is required`);
}

function requireText(value, field, pattern = ID) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${field}_invalid`, `${field} is invalid`);
  return value;
}

function requireHash(value, field) {
  return requireText(value, field, HASH);
}

function requireInstant(value, field) {
  if (typeof value !== "string") fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function componentFields(definition) {
  const fields = ["tenant_id"];
  if (definition.executionScoped) fields.push("execution_id");
  fields.push(definition.id, definition.version, definition.hash);
  return fields;
}

function validateComponents(components, tenantId, executionId, prefix = "binding") {
  exactObject(components, Object.keys(COMPONENTS), `${prefix}_components`);
  const normalized = {};

  for (const [name, definition] of Object.entries(COMPONENTS)) {
    const component = components[name];
    exactObject(component, componentFields(definition), `${prefix}_${name}`);
    requireText(component.tenant_id, `${prefix}_${name}_tenant_id`);
    if (component.tenant_id !== tenantId) fail(`${prefix}_${name}_tenant_mismatch`, `${name} evidence belongs to another tenant`);
    if (definition.executionScoped) {
      requireText(component.execution_id, `${prefix}_${name}_execution_id`);
      if (component.execution_id !== executionId) fail(`${prefix}_${name}_execution_mismatch`, `${name} evidence belongs to another execution`);
    }
    requireText(component[definition.id], `${prefix}_${definition.id}`);
    requireText(component[definition.version], `${prefix}_${definition.version}`, VERSION);
    requireHash(component[definition.hash], `${prefix}_${definition.hash}`);
    normalized[name] = structuredClone(component);
  }

  return normalized;
}

function lockBody(binding) {
  return {
    schema_version: binding.schema_version,
    tenant_id: binding.tenant_id,
    execution_id: binding.execution_id,
    components: binding.components
  };
}

function validateExpectedContext(expected) {
  exactObject(expected, ["tenant_id", "execution_id", "components"], "expected_context");
  const tenantId = requireText(expected.tenant_id, "expected_tenant_id");
  const executionId = requireText(expected.execution_id, "expected_execution_id");
  return { tenantId, executionId, components: validateComponents(expected.components, tenantId, executionId, "expected") };
}

function compareExpectedComponents(actual, expected) {
  for (const [name, definition] of Object.entries(COMPONENTS)) {
    for (const field of [definition.id, definition.version, definition.hash]) {
      if (actual[name][field] !== expected[name][field]) {
        const kind = field === definition.id ? "id" : field === definition.version ? "version" : "fingerprint";
        fail(`binding_${name}_${kind}_mismatch`, `${name} ${kind} does not match the active execution context`);
      }
    }
  }
}

export function createExecutionEvidenceBinding({ bindingId, tenantId, executionId, evidenceOrigin, components, createdAt = new Date() }) {
  requireText(bindingId, "binding_id");
  requireText(tenantId, "tenant_id");
  requireText(executionId, "execution_id");
  if (!new Set(["measured", "synthetic"]).has(evidenceOrigin)) fail("evidence_origin_invalid", "evidenceOrigin must be measured or synthetic");
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.valueOf())) fail("created_at_invalid", "createdAt must be a valid Date");

  const normalizedComponents = validateComponents(components, tenantId, executionId);
  const body = {
    schema_version: EXECUTION_EVIDENCE_BINDING_VERSION,
    binding_id: bindingId,
    tenant_id: tenantId,
    execution_id: executionId,
    evidence_origin: evidenceOrigin,
    created_at: createdAt.toISOString(),
    components: normalizedComponents
  };
  body.lock_fingerprint = fingerprint(lockBody(body));
  return deepFreeze({ ...body, binding_fingerprint: fingerprint(body) });
}

export function verifyExecutionEvidenceBinding(binding, expectedContext) {
  exactObject(binding, ["schema_version", "binding_id", "tenant_id", "execution_id", "evidence_origin", "created_at", "components", "lock_fingerprint", "binding_fingerprint"], "binding");
  if (binding.schema_version !== EXECUTION_EVIDENCE_BINDING_VERSION) fail("binding_schema_version_invalid", `schema_version must equal ${EXECUTION_EVIDENCE_BINDING_VERSION}`);
  requireText(binding.binding_id, "binding_id");
  requireText(binding.tenant_id, "tenant_id");
  requireText(binding.execution_id, "execution_id");
  if (!new Set(["measured", "synthetic"]).has(binding.evidence_origin)) fail("evidence_origin_invalid", "evidence_origin must be measured or synthetic");
  requireInstant(binding.created_at, "created_at");
  validateComponents(binding.components, binding.tenant_id, binding.execution_id);
  requireHash(binding.lock_fingerprint, "lock_fingerprint");
  requireHash(binding.binding_fingerprint, "binding_fingerprint");

  if (fingerprint(lockBody(binding)) !== binding.lock_fingerprint) fail("binding_lock_mismatch", "component lock fingerprint does not match");
  const { binding_fingerprint: claimed, ...body } = binding;
  if (fingerprint(body) !== claimed) fail("binding_tampered", "binding fingerprint does not match");

  if (expectedContext === undefined) fail("expected_context_required", "verification requires the authoritative active execution context");
  const expected = validateExpectedContext(expectedContext);
  if (binding.tenant_id !== expected.tenantId) fail("binding_tenant_mismatch", "binding belongs to another tenant");
  if (binding.execution_id !== expected.executionId) fail("binding_execution_mismatch", "binding belongs to another execution");
  compareExpectedComponents(binding.components, expected.components);

  return Object.freeze({
    valid: true,
    binding_id: binding.binding_id,
    tenant_id: binding.tenant_id,
    execution_id: binding.execution_id,
    binding_fingerprint: binding.binding_fingerprint,
    evidence_origin: binding.evidence_origin
  });
}
