import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const PASSPORT_FREEZE_VERSION = "1.0.0";
export const PASSPORT_CHANGE_POLICY = "new-run-required-after-start";
export const PASSPORT_PREFLIGHT_VERSION = "1.0.0";
export const PASSPORT_PREFLIGHT_POLICY = "all-gates-must-pass-before-start";

export const PASSPORT_FREEZE_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_freeze_input_invalid",
  fieldUnknown: "passport_freeze_field_unknown",
  fieldMissing: "passport_freeze_field_missing",
  versionFloating: "passport_freeze_version_floating",
  fingerprintMismatch: "passport_freeze_fingerprint_mismatch",
  referenceMismatch: "passport_freeze_reference_mismatch",
  freezeMismatch: "passport_freeze_mismatch",
  newRunRequired: "passport_new_run_required",
  newRunIdRequired: "passport_new_run_id_required",
  runStateInvalid: "passport_run_state_invalid",
  localImportRequired: "passport_local_import_required",
  preflightRequired: "passport_preflight_required",
  preflightFailed: "passport_preflight_failed",
  preflightExpired: "passport_preflight_expired",
  preflightMismatch: "passport_preflight_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SITE_ROLES = new Set(["source", "destination"]);
const DIRECTIONS = new Set(["unidirectional", "bidirectional"]);
const WORKLOAD_CLASSES = new Set(["network-transfer", "inference", "training", "other"]);
const WORKLOAD_ORIGINS = new Set(["synthetic", "production-like", "production"]);
const DATA_ORIGINS = new Set(["synthetic", "hybrid", "measured"]);
const AGGREGATIONS = new Set(["raw", "count", "mean", "min", "max", "p50", "p95", "p99"]);
const AGGREGATION_ORDER = Object.freeze(["raw", "count", "mean", "min", "max", "p50", "p95", "p99"]);
const RUN_STATES = new Set(["planned", "started"]);
const LOCAL_IMPORT_SOURCE_KINDS = new Set(["local-file", "stdin", "local-process"]);
const CLOCK_SOURCES = new Set(["system-utc", "ntp", "ptp", "declared"]);
const AUTHORIZATION_DECISIONS = new Set(["allow", "deny"]);
const STOP_CONDITION_KINDS = new Set(["max-duration", "max-failures", "budget-exhausted", "manual-cancel", "custom"]);
const STOP_CONDITION_OPERATORS = new Set(["gte", "gt", "eq"]);
const REQUIRED_STOP_CONDITIONS = Object.freeze(["max-duration", "max-failures", "budget-exhausted"]);
const PREFLIGHT_GATES = Object.freeze(["authorization", "clock", "budget", "concurrency", "stop_conditions"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_FREEZE_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_FREEZE_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 500, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireSemver(value, label) {
  if (typeof value === "string" && value.toLowerCase() === "latest") {
    fail(PASSPORT_FREEZE_ERROR_CODES.versionFloating, `${label} must be an exact version, not latest`);
  }
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function requireExactLabelVersion(value, label) {
  const version = requireString(value, label, { max: 120 });
  if (version.trim().toLowerCase() === "latest") {
    fail(PASSPORT_FREEZE_ERROR_CODES.versionFloating, `${label} must be exact, not latest`);
  }
  return version;
}

function requireHash(value, label) {
  return requireString(value, label, { max: 71, pattern: HASH });
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function requireFiniteNumber(value, label, minimum = -Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must be a boolean`);
  return value;
}

function requireEnum(value, values, label) {
  if (!values.has(value)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function uniqueSorted(values, label, normalize) {
  if (!Array.isArray(values)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must be an array`);
  const result = values.map((value, index) => normalize(value, `${label}[${index}]`));
  const serialized = result.map((value) => canonicalizeEvidenceValue(value));
  if (new Set(serialized).size !== result.length) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} contains duplicates`);
  return result.sort((left, right) => {
    const leftValue = canonicalizeEvidenceValue(left);
    const rightValue = canonicalizeEvidenceValue(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  });
}

function normalizeAuthorizationScope(value, label = "authorization_scope") {
  exactObject(value, ["visibility", "purpose", "recipients", "expires_at"], [], label);
  const visibility = requireEnum(value.visibility, new Set(["private", "shared", "public"]), `${label}.visibility`);
  const recipients = uniqueSorted(value.recipients, `${label}.recipients`, (recipient, location) => requireId(recipient, location));
  if (visibility !== "private" && recipients.length === 0) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.recipients must name the intended shared or public audience`);
  }
  return {
    visibility,
    purpose: requireString(value.purpose, `${label}.purpose`, { min: 3, max: 240 }),
    recipients,
    expires_at: value.expires_at === null ? null : canonicalInstant(value.expires_at, `${label}.expires_at`)
  };
}

function normalizeObjectReference(value, expectedType, tenantId, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], [], label);
  if (value.object_type !== expectedType) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, `${label}.object_type must be ${expectedType}`);
  const reference = {
    object_type: expectedType,
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`)
  };
  if (reference.tenant_id !== tenantId) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, `${label}.tenant_id must match the freeze tenant`);
  return reference;
}

function normalizeSites(value, label = "scenario.sites") {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must contain exactly one source and one destination`);
  }
  const sites = uniqueSorted(value, label, (site, location) => {
    exactObject(site, ["site_id", "role", "region"], [], location);
    return {
      site_id: requireId(site.site_id, `${location}.site_id`),
      role: requireEnum(site.role, SITE_ROLES, `${location}.role`),
      region: requireString(site.region, `${location}.region`, { min: 2, max: 96 })
    };
  });
  if (new Set(sites.map(({ site_id: siteId }) => siteId)).size !== 2
      || new Set(sites.map(({ role }) => role)).size !== 2) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must contain distinct source and destination sites`);
  }
  return sites.sort((left, right) => left.role === "source" ? -1 : right.role === "source" ? 1 : 0);
}

function normalizeScenario(value, label = "scenario") {
  exactObject(value, ["sites", "direction", "protocol", "workload"], [], label);
  exactObject(value.protocol, ["protocol_id", "version", "profile"], [], `${label}.protocol`);
  exactObject(value.workload, ["workload_class", "name", "version", "origin", "configuration_fingerprint"], [], `${label}.workload`);
  return {
    sites: normalizeSites(value.sites, `${label}.sites`),
    direction: requireEnum(value.direction, DIRECTIONS, `${label}.direction`),
    protocol: {
      protocol_id: requireId(value.protocol.protocol_id, `${label}.protocol.protocol_id`),
      version: requireExactLabelVersion(value.protocol.version, `${label}.protocol.version`),
      profile: value.protocol.profile === null ? null : requireString(value.protocol.profile, `${label}.protocol.profile`, { max: 120 })
    },
    workload: {
      workload_class: requireEnum(value.workload.workload_class, WORKLOAD_CLASSES, `${label}.workload.workload_class`),
      name: requireString(value.workload.name, `${label}.workload.name`, { max: 120 }),
      version: requireExactLabelVersion(value.workload.version, `${label}.workload.version`),
      origin: requireEnum(value.workload.origin, WORKLOAD_ORIGINS, `${label}.workload.origin`),
      configuration_fingerprint: requireHash(value.workload.configuration_fingerprint, `${label}.workload.configuration_fingerprint`)
    }
  };
}

function normalizeParameter(value, label) {
  exactObject(value, ["name", "value", "unit"], [], label);
  if (!["string", "number", "boolean"].includes(typeof value.value) || (typeof value.value === "number" && !Number.isFinite(value.value))) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.value must be a finite scalar`);
  }
  return {
    name: requireString(value.name, `${label}.name`, { max: 96 }),
    value: value.value,
    unit: value.unit === null ? null : requireString(value.unit, `${label}.unit`, { max: 48 })
  };
}

function normalizeMethodTemplate(value, label = "method_template") {
  exactObject(value, ["template_id", "version", "tool", "parameters", "sampling", "exclusion_rules", "statistics", "environment_prerequisites"], [], label);
  exactObject(value.tool, ["name", "version", "artifact_fingerprint"], [], `${label}.tool`);
  exactObject(value.sampling, ["target_count", "interval_ms", "warmup_count"], [], `${label}.sampling`);

  const parameters = uniqueSorted(value.parameters, `${label}.parameters`, normalizeParameter);
  if (new Set(parameters.map(({ name }) => name)).size !== parameters.length) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.parameters contains duplicate names`);
  }

  const exclusionRules = uniqueSorted(value.exclusion_rules, `${label}.exclusion_rules`, (rule, location) => {
    exactObject(rule, ["rule_id", "description"], [], location);
    return {
      rule_id: requireId(rule.rule_id, `${location}.rule_id`),
      description: requireString(rule.description, `${location}.description`, { min: 3, max: 500 })
    };
  });
  if (new Set(exclusionRules.map(({ rule_id: ruleId }) => ruleId)).size !== exclusionRules.length) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.exclusion_rules contains duplicate rule IDs`);
  }

  const statistics = uniqueSorted(value.statistics, `${label}.statistics`, (statistic, location) => {
    exactObject(statistic, ["metric", "aggregations"], [], location);
    const aggregations = uniqueSorted(statistic.aggregations, `${location}.aggregations`, (aggregation, aggregationLocation) => requireEnum(aggregation, AGGREGATIONS, aggregationLocation));
    if (aggregations.length === 0) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${location}.aggregations must not be empty`);
    aggregations.sort((left, right) => AGGREGATION_ORDER.indexOf(left) - AGGREGATION_ORDER.indexOf(right));
    return {
      metric: requireString(statistic.metric, `${location}.metric`, { max: 96 }),
      aggregations
    };
  });
  if (statistics.length === 0 || new Set(statistics.map(({ metric }) => metric)).size !== statistics.length) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.statistics must contain unique metrics`);
  }

  const environmentPrerequisites = uniqueSorted(value.environment_prerequisites, `${label}.environment_prerequisites`, (entry, location) => requireString(entry, location, { min: 3, max: 300 }));
  return {
    template_id: requireId(value.template_id, `${label}.template_id`),
    version: requireSemver(value.version, `${label}.version`),
    tool: {
      name: requireString(value.tool.name, `${label}.tool.name`, { max: 120 }),
      version: requireExactLabelVersion(value.tool.version, `${label}.tool.version`),
      artifact_fingerprint: requireHash(value.tool.artifact_fingerprint, `${label}.tool.artifact_fingerprint`)
    },
    parameters,
    sampling: {
      target_count: requireInteger(value.sampling.target_count, `${label}.sampling.target_count`, 1),
      interval_ms: requireInteger(value.sampling.interval_ms, `${label}.sampling.interval_ms`),
      warmup_count: requireInteger(value.sampling.warmup_count, `${label}.sampling.warmup_count`)
    },
    exclusion_rules: exclusionRules,
    statistics,
    environment_prerequisites: environmentPrerequisites
  };
}

function normalizeBoundary(value, workloadOrigin, label = "boundary") {
  exactObject(value, ["data_origin", "limitations", "performance_claim_allowed"], [], label);
  const dataOrigin = requireEnum(value.data_origin, DATA_ORIGINS, `${label}.data_origin`);
  if (workloadOrigin === "synthetic" && dataOrigin !== "synthetic") {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.data_origin must remain synthetic for a synthetic workload`);
  }
  if (value.performance_claim_allowed !== false) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.performance_claim_allowed must be false because a freeze is not measurement evidence`);
  }
  const limitations = uniqueSorted(value.limitations, `${label}.limitations`, (limitation, location) => requireString(limitation, location, { min: 3, max: 500 }));
  if (limitations.length === 0) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.limitations must not be empty`);
  return { data_origin: dataOrigin, limitations, performance_claim_allowed: false };
}

function normalizeFreezeBody(value, label = "freeze") {
  exactObject(value, [
    "schema_version", "record_type", "freeze_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "scope_ref", "method_ref", "scenario", "method_template", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_FREEZE_VERSION || value.record_type !== "passport_scenario_method_freeze") {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const scenario = normalizeScenario(value.scenario, `${label}.scenario`);
  return {
    schema_version: PASSPORT_FREEZE_VERSION,
    record_type: "passport_scenario_method_freeze",
    freeze_id: requireId(value.freeze_id, `${label}.freeze_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: canonicalInstant(value.created_at, `${label}.created_at`),
    authorization_scope: normalizeAuthorizationScope(value.authorization_scope, `${label}.authorization_scope`),
    scope_ref: normalizeObjectReference(value.scope_ref, "scope", tenantId, `${label}.scope_ref`),
    method_ref: normalizeObjectReference(value.method_ref, "method", tenantId, `${label}.method_ref`),
    scenario,
    method_template: normalizeMethodTemplate(value.method_template, `${label}.method_template`),
    boundary: normalizeBoundary(value.boundary, scenario.workload.origin, `${label}.boundary`)
  };
}

function freezeBodyFromInput(value) {
  exactObject(value, [
    "freeze_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope",
    "scope_ref", "method_ref", "scenario", "method_template", "boundary"
  ], [], "input");
  return normalizeFreezeBody({
    schema_version: PASSPORT_FREEZE_VERSION,
    record_type: "passport_scenario_method_freeze",
    ...value
  });
}

function fingerprintBody(value) {
  return digestEvidenceBytes(canonicalizeEvidenceValue(value));
}

export function createPassportScenarioMethodFreeze(input) {
  const body = freezeBodyFromInput(input);
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportScenarioMethodFreeze(record) {
  exactObject(record, [
    "schema_version", "record_type", "freeze_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "scope_ref", "method_ref", "scenario", "method_template", "boundary", "content_fingerprint"
  ], [], "record");
  const { content_fingerprint: suppliedFingerprint, ...candidate } = record;
  const body = normalizeFreezeBody(candidate, "record");
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, "record.content_fingerprint") !== expectedFingerprint) {
    fail(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch, "record.content_fingerprint does not match the frozen scenario and method");
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

function normalizeTimeWindow(value, label) {
  exactObject(value, ["starts_at", "ends_at"], [], label);
  const startsAt = canonicalInstant(value.starts_at, `${label}.starts_at`);
  const endsAt = canonicalInstant(value.ends_at, `${label}.ends_at`);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} must have positive duration`);
  return { starts_at: startsAt, ends_at: endsAt };
}

function normalizeRunReference(value, tenantId, label) {
  if (value === null) return null;
  exactObject(value, ["run_id", "version", "tenant_id", "content_fingerprint"], [], label);
  const reference = {
    run_id: requireId(value.run_id, `${label}.run_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, `${label}.tenant_id must match the run tenant`);
  return reference;
}

function normalizeFreezeReference(value, tenantId, label) {
  exactObject(value, ["freeze_id", "version", "tenant_id", "content_fingerprint"], [], label);
  const reference = {
    freeze_id: requireId(value.freeze_id, `${label}.freeze_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, `${label}.tenant_id must match the run tenant`);
  return reference;
}

function freezeReference(freeze) {
  return {
    freeze_id: freeze.freeze_id,
    version: freeze.version,
    tenant_id: freeze.tenant_id,
    content_fingerprint: freeze.content_fingerprint
  };
}

function runReference(run) {
  return {
    run_id: run.run_id,
    version: run.version,
    tenant_id: run.tenant_id,
    content_fingerprint: run.content_fingerprint
  };
}

function normalizeRunBody(value, label = "run") {
  exactObject(value, [
    "schema_version", "record_type", "run_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "freeze_ref", "planned_window", "state", "started_at", "supersedes_run_ref", "change_policy"
  ], [], label);
  if (value.schema_version !== PASSPORT_FREEZE_VERSION || value.record_type !== "passport_run_freeze_binding") {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  if (value.change_policy !== PASSPORT_CHANGE_POLICY) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.change_policy is unsupported`);
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const plannedWindow = normalizeTimeWindow(value.planned_window, `${label}.planned_window`);
  const state = requireEnum(value.state, RUN_STATES, `${label}.state`);
  const startedAt = value.started_at === null ? null : canonicalInstant(value.started_at, `${label}.started_at`);
  if ((state === "planned") !== (startedAt === null)) {
    fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, `${label}.state and started_at are inconsistent`);
  }
  if (startedAt !== null && (Date.parse(startedAt) < Date.parse(plannedWindow.starts_at) || Date.parse(startedAt) > Date.parse(plannedWindow.ends_at))) {
    fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, `${label}.started_at must be inside planned_window`);
  }
  return {
    schema_version: PASSPORT_FREEZE_VERSION,
    record_type: "passport_run_freeze_binding",
    run_id: requireId(value.run_id, `${label}.run_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    created_by: requireId(value.created_by, `${label}.created_by`),
    created_at: canonicalInstant(value.created_at, `${label}.created_at`),
    authorization_scope: normalizeAuthorizationScope(value.authorization_scope, `${label}.authorization_scope`),
    freeze_ref: normalizeFreezeReference(value.freeze_ref, tenantId, `${label}.freeze_ref`),
    planned_window: plannedWindow,
    state,
    started_at: startedAt,
    supersedes_run_ref: normalizeRunReference(value.supersedes_run_ref, tenantId, `${label}.supersedes_run_ref`),
    change_policy: PASSPORT_CHANGE_POLICY
  };
}

function buildRunRecord(body) {
  const normalized = normalizeRunBody(body);
  return deepFreeze({ ...normalized, content_fingerprint: fingerprintBody(normalized) });
}

export function createPassportRunPlan(input) {
  exactObject(input, [
    "run_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "freeze", "planned_window"
  ], ["supersedes_run_ref"], "input");
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  const tenantId = requireId(input.tenant_id, "input.tenant_id");
  if (freeze.tenant_id !== tenantId) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, "input.freeze must belong to input.tenant_id");
  return buildRunRecord({
    schema_version: PASSPORT_FREEZE_VERSION,
    record_type: "passport_run_freeze_binding",
    run_id: input.run_id,
    version: input.version,
    tenant_id: tenantId,
    created_by: input.created_by,
    created_at: input.created_at,
    authorization_scope: input.authorization_scope,
    freeze_ref: freezeReference(freeze),
    planned_window: input.planned_window,
    state: "planned",
    started_at: null,
    supersedes_run_ref: input.supersedes_run_ref ?? null,
    change_policy: PASSPORT_CHANGE_POLICY
  });
}

export function verifyPassportRunBinding(record) {
  exactObject(record, [
    "schema_version", "record_type", "run_id", "version", "tenant_id", "created_by", "created_at",
    "authorization_scope", "freeze_ref", "planned_window", "state", "started_at", "supersedes_run_ref",
    "change_policy", "content_fingerprint"
  ], [], "record");
  const { content_fingerprint: suppliedFingerprint, ...candidate } = record;
  const body = normalizeRunBody(candidate, "record");
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, "record.content_fingerprint") !== expectedFingerprint) {
    fail(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch, "record.content_fingerprint does not match the run binding");
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

function normalizeLocalImportSource(value, label = "source") {
  exactObject(value, ["kind", "media_type", "payload_fingerprint"], [], label);
  return {
    kind: requireEnum(value.kind, LOCAL_IMPORT_SOURCE_KINDS, `${label}.kind`),
    media_type: requireString(value.media_type, `${label}.media_type`, {
      max: 96,
      pattern: /^[a-z0-9][a-z0-9!#$&^_.+-]+\/[a-z0-9][a-z0-9!#$&^_.+-]+$/i
    }),
    payload_fingerprint: requireHash(value.payload_fingerprint, `${label}.payload_fingerprint`)
  };
}

function normalizeImportReference(value, tenantId, label) {
  exactObject(value, ["import_id", "version", "tenant_id", "content_fingerprint"], [], label);
  const reference = {
    import_id: requireId(value.import_id, `${label}.import_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
  if (reference.tenant_id !== tenantId) fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, `${label}.tenant_id must match the preflight tenant`);
  return reference;
}

function importReference(record) {
  return {
    import_id: record.import_id,
    version: record.version,
    tenant_id: record.tenant_id,
    content_fingerprint: record.content_fingerprint
  };
}

function normalizeLocalImportBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "import_id", "version", "tenant_id", "imported_by", "imported_at",
    "source", "run_ref", "freeze_ref", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_PREFLIGHT_VERSION || value.record_type !== "passport_local_run_import") {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  exactObject(value.boundary, ["mode", "network_accessed", "raw_payload_retained", "credentials_retained"], [], `${label}.boundary`);
  if (value.boundary.mode !== "local-offline"
      || value.boundary.network_accessed !== false
      || value.boundary.raw_payload_retained !== false
      || value.boundary.credentials_retained !== false) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.boundary must preserve the local offline import boundary`);
  }
  const runRef = normalizeRunReference(value.run_ref, tenantId, `${label}.run_ref`);
  if (runRef === null) fail(PASSPORT_FREEZE_ERROR_CODES.fieldMissing, `${label}.run_ref is required`);
  return {
    schema_version: PASSPORT_PREFLIGHT_VERSION,
    record_type: "passport_local_run_import",
    import_id: requireId(value.import_id, `${label}.import_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    imported_by: requireId(value.imported_by, `${label}.imported_by`),
    imported_at: canonicalInstant(value.imported_at, `${label}.imported_at`),
    source: normalizeLocalImportSource(value.source, `${label}.source`),
    run_ref: runRef,
    freeze_ref: normalizeFreezeReference(value.freeze_ref, tenantId, `${label}.freeze_ref`),
    boundary: {
      mode: "local-offline",
      network_accessed: false,
      raw_payload_retained: false,
      credentials_retained: false
    }
  };
}

export function createPassportLocalRunImport(input) {
  exactObject(input, [
    "import_id", "version", "tenant_id", "imported_by", "imported_at", "source", "plan", "freeze"
  ], [], "input");
  const plan = verifyPassportRunBinding(input.plan);
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  const tenantId = requireId(input.tenant_id, "input.tenant_id");
  if (plan.state !== "planned") fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "Only a planned run can be imported for preflight");
  if (plan.tenant_id !== tenantId || freeze.tenant_id !== tenantId) {
    fail(PASSPORT_FREEZE_ERROR_CODES.referenceMismatch, "The imported plan, freeze, and tenant must match");
  }
  assertPassportRunFreeze({ run: plan, freeze });
  const body = normalizeLocalImportBody({
    schema_version: PASSPORT_PREFLIGHT_VERSION,
    record_type: "passport_local_run_import",
    import_id: input.import_id,
    version: input.version,
    tenant_id: tenantId,
    imported_by: input.imported_by,
    imported_at: input.imported_at,
    source: input.source,
    run_ref: runReference(plan),
    freeze_ref: freezeReference(freeze),
    boundary: {
      mode: "local-offline",
      network_accessed: false,
      raw_payload_retained: false,
      credentials_retained: false
    }
  });
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportLocalRunImport(record) {
  exactObject(record, [
    "schema_version", "record_type", "import_id", "version", "tenant_id", "imported_by", "imported_at",
    "source", "run_ref", "freeze_ref", "boundary", "content_fingerprint"
  ], [], "record");
  const { content_fingerprint: suppliedFingerprint, ...candidate } = record;
  const body = normalizeLocalImportBody(candidate);
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, "record.content_fingerprint") !== expectedFingerprint) {
    fail(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch, "record.content_fingerprint does not match the local import record");
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

function normalizeUnboundRunReference(value, label) {
  exactObject(value, ["run_id", "version", "tenant_id", "content_fingerprint"], [], label);
  return {
    run_id: requireId(value.run_id, `${label}.run_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
}

function normalizeUnboundFreezeReference(value, label) {
  exactObject(value, ["freeze_id", "version", "tenant_id", "content_fingerprint"], [], label);
  return {
    freeze_id: requireId(value.freeze_id, `${label}.freeze_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`)
  };
}

function normalizeExecutionAuthorization(value, label = "authorization") {
  exactObject(value, [
    "authorization_id", "version", "tenant_id", "principal_id", "action", "decision", "valid_from",
    "valid_until", "revoked_at", "run_ref", "freeze_ref", "source_fingerprint"
  ], [], label);
  return {
    authorization_id: requireId(value.authorization_id, `${label}.authorization_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    principal_id: requireId(value.principal_id, `${label}.principal_id`),
    action: requireString(value.action, `${label}.action`, { max: 64 }),
    decision: requireEnum(value.decision, AUTHORIZATION_DECISIONS, `${label}.decision`),
    valid_from: canonicalInstant(value.valid_from, `${label}.valid_from`),
    valid_until: canonicalInstant(value.valid_until, `${label}.valid_until`),
    revoked_at: value.revoked_at === null ? null : canonicalInstant(value.revoked_at, `${label}.revoked_at`),
    run_ref: normalizeUnboundRunReference(value.run_ref, `${label}.run_ref`),
    freeze_ref: normalizeUnboundFreezeReference(value.freeze_ref, `${label}.freeze_ref`),
    source_fingerprint: requireHash(value.source_fingerprint, `${label}.source_fingerprint`)
  };
}

function normalizeClockCheck(value, label = "clock") {
  exactObject(value, ["source", "checked_at", "maximum_age_ms", "maximum_skew_ms", "observed_skew_ms", "synchronized", "source_fingerprint"], [], label);
  return {
    source: requireEnum(value.source, CLOCK_SOURCES, `${label}.source`),
    checked_at: canonicalInstant(value.checked_at, `${label}.checked_at`),
    maximum_age_ms: requireInteger(value.maximum_age_ms, `${label}.maximum_age_ms`, 1),
    maximum_skew_ms: requireFiniteNumber(value.maximum_skew_ms, `${label}.maximum_skew_ms`, 0),
    observed_skew_ms: requireFiniteNumber(value.observed_skew_ms, `${label}.observed_skew_ms`, 0),
    synchronized: requireBoolean(value.synchronized, `${label}.synchronized`),
    source_fingerprint: requireHash(value.source_fingerprint, `${label}.source_fingerprint`)
  };
}

function normalizeBudgetCheck(value, label = "budget") {
  exactObject(value, [
    "budget_id", "version", "tenant_id", "run_ref", "currency", "limit_minor", "committed_minor", "estimated_run_minor", "valid_until", "source_fingerprint"
  ], [], label);
  return {
    budget_id: requireId(value.budget_id, `${label}.budget_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    run_ref: normalizeUnboundRunReference(value.run_ref, `${label}.run_ref`),
    currency: requireString(value.currency, `${label}.currency`, { min: 3, max: 3, pattern: /^[A-Z]{3}$/ }),
    limit_minor: requireInteger(value.limit_minor, `${label}.limit_minor`, 0),
    committed_minor: requireInteger(value.committed_minor, `${label}.committed_minor`, 0),
    estimated_run_minor: requireInteger(value.estimated_run_minor, `${label}.estimated_run_minor`, 0),
    valid_until: canonicalInstant(value.valid_until, `${label}.valid_until`),
    source_fingerprint: requireHash(value.source_fingerprint, `${label}.source_fingerprint`)
  };
}

function normalizeConcurrencyCheck(value, label = "concurrency") {
  exactObject(value, ["scope_id", "tenant_id", "run_ref", "checked_at", "maximum_age_ms", "maximum", "active", "requested", "source_fingerprint"], [], label);
  return {
    scope_id: requireId(value.scope_id, `${label}.scope_id`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`),
    run_ref: normalizeUnboundRunReference(value.run_ref, `${label}.run_ref`),
    checked_at: canonicalInstant(value.checked_at, `${label}.checked_at`),
    maximum_age_ms: requireInteger(value.maximum_age_ms, `${label}.maximum_age_ms`, 1),
    maximum: requireInteger(value.maximum, `${label}.maximum`, 1),
    active: requireInteger(value.active, `${label}.active`, 0),
    requested: requireInteger(value.requested, `${label}.requested`, 1),
    source_fingerprint: requireHash(value.source_fingerprint, `${label}.source_fingerprint`)
  };
}

function normalizeStopConditions(value, label = "stop_conditions") {
  const conditions = uniqueSorted(value, label, (condition, location) => {
    exactObject(condition, ["condition_id", "kind", "metric", "operator", "threshold", "unit", "action"], [], location);
    const action = requireString(condition.action, `${location}.action`, { max: 16 });
    if (action !== "stop" && action !== "warn") fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${location}.action is invalid`);
    return {
      condition_id: requireId(condition.condition_id, `${location}.condition_id`),
      kind: requireEnum(condition.kind, STOP_CONDITION_KINDS, `${location}.kind`),
      metric: requireString(condition.metric, `${location}.metric`, { max: 96 }),
      operator: requireEnum(condition.operator, STOP_CONDITION_OPERATORS, `${location}.operator`),
      threshold: requireFiniteNumber(condition.threshold, `${location}.threshold`, 0),
      unit: requireString(condition.unit, `${location}.unit`, { max: 48 }),
      action
    };
  });
  if (new Set(conditions.map(({ condition_id: conditionId }) => conditionId)).size !== conditions.length) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} contains duplicate condition_id values`);
  }
  const fixedKinds = conditions.filter(({ kind }) => kind !== "custom").map(({ kind }) => kind);
  if (new Set(fixedKinds).size !== fixedKinds.length) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} contains duplicate fixed condition kinds`);
  }
  return conditions;
}

function referenceMatches(left, right) {
  return canonicalizeEvidenceValue(left) === canonicalizeEvidenceValue(right);
}

function addBlocker(blockers, gate, code) {
  if (!blockers.some((blocker) => blocker.gate === gate && blocker.code === code)) blockers.push({ gate, code });
}

function expiryFromCheck(checkedAt, maximumAgeMs) {
  return new Date(Date.parse(checkedAt) + maximumAgeMs).toISOString();
}

function evaluatePreflightSemantics({
  evaluatedAt,
  executionPrincipalId,
  plannedWindow,
  runRef,
  freezeRef,
  authorization,
  clock,
  budget,
  concurrency,
  stopConditions
}) {
  const blockers = [];
  const evaluatedMs = Date.parse(evaluatedAt);
  const plannedStartMs = Date.parse(plannedWindow.starts_at);
  const plannedEndMs = Date.parse(plannedWindow.ends_at);
  const plannedDurationMs = Date.parse(plannedWindow.ends_at) - Date.parse(plannedWindow.starts_at);
  const availableMinor = budget.limit_minor - budget.committed_minor;

  if (authorization.decision !== "allow") addBlocker(blockers, "authorization", "authorization_denied");
  if (authorization.tenant_id !== runRef.tenant_id
      || authorization.principal_id !== executionPrincipalId
      || authorization.action !== "execute-passport-run"
      || !referenceMatches(authorization.run_ref, runRef)
      || !referenceMatches(authorization.freeze_ref, freezeRef)) {
    addBlocker(blockers, "authorization", "authorization_scope_mismatch");
  }
  if (Date.parse(authorization.valid_from) > evaluatedMs) addBlocker(blockers, "authorization", "authorization_not_yet_valid");
  if (Date.parse(authorization.valid_until) < plannedEndMs) addBlocker(blockers, "authorization", "authorization_expired");
  if (authorization.revoked_at !== null && Date.parse(authorization.revoked_at) <= plannedEndMs) {
    addBlocker(blockers, "authorization", "authorization_revoked");
  }

  if (!clock.synchronized) addBlocker(blockers, "clock", "clock_unsynchronized");
  if (plannedEndMs < evaluatedMs) addBlocker(blockers, "clock", "run_window_elapsed");
  if (Date.parse(clock.checked_at) > evaluatedMs
      || Math.max(evaluatedMs, plannedStartMs) > Date.parse(expiryFromCheck(clock.checked_at, clock.maximum_age_ms))) {
    addBlocker(blockers, "clock", "clock_stale");
  }
  if (clock.observed_skew_ms > clock.maximum_skew_ms) addBlocker(blockers, "clock", "clock_skew_exceeded");

  if (budget.tenant_id !== runRef.tenant_id || !referenceMatches(budget.run_ref, runRef)) {
    addBlocker(blockers, "budget", "budget_scope_mismatch");
  }
  if (Date.parse(budget.valid_until) < Date.parse(plannedWindow.ends_at)) addBlocker(blockers, "budget", "budget_expired");
  if (availableMinor < 0 || budget.estimated_run_minor > availableMinor) addBlocker(blockers, "budget", "budget_exceeded");

  if (concurrency.tenant_id !== runRef.tenant_id || !referenceMatches(concurrency.run_ref, runRef)) {
    addBlocker(blockers, "concurrency", "concurrency_scope_mismatch");
  }
  if (Date.parse(concurrency.checked_at) > evaluatedMs
      || Math.max(evaluatedMs, plannedStartMs) > Date.parse(expiryFromCheck(concurrency.checked_at, concurrency.maximum_age_ms))) {
    addBlocker(blockers, "concurrency", "concurrency_stale");
  }
  if (concurrency.active + concurrency.requested > concurrency.maximum) {
    addBlocker(blockers, "concurrency", "concurrency_exceeded");
  }

  const conditionByKind = new Map(stopConditions.map((condition) => [condition.kind, condition]));
  for (const requiredKind of REQUIRED_STOP_CONDITIONS) {
    if (!conditionByKind.has(requiredKind)) addBlocker(blockers, "stop_conditions", "stop_conditions_incomplete");
  }
  if (stopConditions.some(({ action }) => action !== "stop")) {
    addBlocker(blockers, "stop_conditions", "stop_condition_unsafe");
  }
  const maxDuration = conditionByKind.get("max-duration");
  if (maxDuration && (maxDuration.metric !== "elapsed_ms" || maxDuration.operator !== "gte" || maxDuration.unit !== "ms"
      || maxDuration.threshold <= 0 || maxDuration.threshold > plannedDurationMs)) {
    addBlocker(blockers, "stop_conditions", "stop_condition_unsafe");
  }
  const maxFailures = conditionByKind.get("max-failures");
  if (maxFailures && (maxFailures.metric !== "failure_count" || maxFailures.operator !== "gte" || maxFailures.unit !== "count"
      || !Number.isInteger(maxFailures.threshold) || maxFailures.threshold < 1)) {
    addBlocker(blockers, "stop_conditions", "stop_condition_unsafe");
  }
  const budgetExhausted = conditionByKind.get("budget-exhausted");
  if (budgetExhausted && (budgetExhausted.metric !== "spent_minor" || budgetExhausted.operator !== "gte"
      || budgetExhausted.unit !== `${budget.currency}:minor` || budgetExhausted.threshold > Math.max(availableMinor, 0))) {
    addBlocker(blockers, "stop_conditions", "stop_condition_unsafe");
  }

  blockers.sort((left, right) => canonicalizeEvidenceValue(left).localeCompare(canonicalizeEvidenceValue(right)));
  const gateResults = Object.fromEntries(PREFLIGHT_GATES.map((gate) => {
    const codes = blockers.filter((blocker) => blocker.gate === gate).map(({ code }) => code);
    return [gate, { status: codes.length === 0 ? "passed" : "failed", codes }];
  }));
  const validUntil = [
    plannedWindow.ends_at,
    authorization.valid_until,
    ...(authorization.revoked_at === null ? [] : [authorization.revoked_at]),
    budget.valid_until,
    expiryFromCheck(clock.checked_at, clock.maximum_age_ms),
    expiryFromCheck(concurrency.checked_at, concurrency.maximum_age_ms)
  ].sort((left, right) => Date.parse(left) - Date.parse(right))[0];

  return {
    valid_until: validUntil,
    gate_results: gateResults,
    decision: blockers.length === 0 ? "passed" : "failed",
    blockers
  };
}

function normalizeGateResults(value, label) {
  exactObject(value, PREFLIGHT_GATES, [], label);
  return Object.fromEntries(PREFLIGHT_GATES.map((gate) => {
    const result = value[gate];
    exactObject(result, ["status", "codes"], [], `${label}.${gate}`);
    const status = requireEnum(result.status, new Set(["passed", "failed"]), `${label}.${gate}.status`);
    const codes = uniqueSorted(result.codes, `${label}.${gate}.codes`, (code, location) => requireString(code, location, { max: 96 }));
    if ((status === "passed") !== (codes.length === 0)) {
      fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.${gate} status and codes are inconsistent`);
    }
    return [gate, { status, codes }];
  }));
}

function normalizeBlockers(value, label) {
  return uniqueSorted(value, label, (blocker, location) => {
    exactObject(blocker, ["gate", "code"], [], location);
    return {
      gate: requireEnum(blocker.gate, new Set(PREFLIGHT_GATES), `${location}.gate`),
      code: requireString(blocker.code, `${location}.code`, { max: 96 })
    };
  });
}

function normalizePreflightBody(value, label = "record") {
  exactObject(value, [
    "schema_version", "record_type", "preflight_id", "version", "tenant_id", "evaluated_by", "execution_principal_id",
    "evaluated_at", "valid_until", "policy", "import_ref", "run_ref", "freeze_ref", "planned_window", "authorization",
    "clock", "budget", "concurrency", "stop_conditions", "gate_results", "decision", "blockers", "boundary"
  ], [], label);
  if (value.schema_version !== PASSPORT_PREFLIGHT_VERSION || value.record_type !== "passport_run_preflight") {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label} has an unsupported contract version or record type`);
  }
  if (value.policy !== PASSPORT_PREFLIGHT_POLICY) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.policy is unsupported`);
  const tenantId = requireId(value.tenant_id, `${label}.tenant_id`);
  const runRef = normalizeRunReference(value.run_ref, tenantId, `${label}.run_ref`);
  if (runRef === null) fail(PASSPORT_FREEZE_ERROR_CODES.fieldMissing, `${label}.run_ref is required`);
  const freezeRef = normalizeFreezeReference(value.freeze_ref, tenantId, `${label}.freeze_ref`);
  const evaluatedAt = canonicalInstant(value.evaluated_at, `${label}.evaluated_at`);
  const plannedWindow = normalizeTimeWindow(value.planned_window, `${label}.planned_window`);
  const executionPrincipalId = requireId(value.execution_principal_id, `${label}.execution_principal_id`);
  const authorization = normalizeExecutionAuthorization(value.authorization, `${label}.authorization`);
  const clock = normalizeClockCheck(value.clock, `${label}.clock`);
  const budget = normalizeBudgetCheck(value.budget, `${label}.budget`);
  const concurrency = normalizeConcurrencyCheck(value.concurrency, `${label}.concurrency`);
  const stopConditions = normalizeStopConditions(value.stop_conditions, `${label}.stop_conditions`);
  const expected = evaluatePreflightSemantics({
    evaluatedAt,
    executionPrincipalId,
    plannedWindow,
    runRef,
    freezeRef,
    authorization,
    clock,
    budget,
    concurrency,
    stopConditions
  });
  const gateResults = normalizeGateResults(value.gate_results, `${label}.gate_results`);
  const blockers = normalizeBlockers(value.blockers, `${label}.blockers`);
  const decision = requireEnum(value.decision, new Set(["passed", "failed"]), `${label}.decision`);
  const validUntil = canonicalInstant(value.valid_until, `${label}.valid_until`);
  if (canonicalizeEvidenceValue(gateResults) !== canonicalizeEvidenceValue(expected.gate_results)
      || canonicalizeEvidenceValue(blockers) !== canonicalizeEvidenceValue(expected.blockers)
      || decision !== expected.decision
      || validUntil !== expected.valid_until) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, `${label} decision does not match its gate evidence`);
  }
  exactObject(value.boundary, ["preflight_only", "execution_performed", "performance_claim_allowed"], [], `${label}.boundary`);
  if (value.boundary.preflight_only !== true
      || value.boundary.execution_performed !== false
      || value.boundary.performance_claim_allowed !== false) {
    fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, `${label}.boundary must remain preflight-only`);
  }
  return {
    schema_version: PASSPORT_PREFLIGHT_VERSION,
    record_type: "passport_run_preflight",
    preflight_id: requireId(value.preflight_id, `${label}.preflight_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: tenantId,
    evaluated_by: requireId(value.evaluated_by, `${label}.evaluated_by`),
    execution_principal_id: executionPrincipalId,
    evaluated_at: evaluatedAt,
    valid_until: validUntil,
    policy: PASSPORT_PREFLIGHT_POLICY,
    import_ref: normalizeImportReference(value.import_ref, tenantId, `${label}.import_ref`),
    run_ref: runRef,
    freeze_ref: freezeRef,
    planned_window: plannedWindow,
    authorization,
    clock,
    budget,
    concurrency,
    stop_conditions: stopConditions,
    gate_results: gateResults,
    decision,
    blockers,
    boundary: {
      preflight_only: true,
      execution_performed: false,
      performance_claim_allowed: false
    }
  };
}

export function createPassportRunPreflight(input) {
  exactObject(input, [
    "preflight_id", "version", "tenant_id", "evaluated_by", "execution_principal_id", "evaluated_at", "local_import",
    "plan", "freeze", "authorization", "clock", "budget", "concurrency", "stop_conditions"
  ], [], "input");
  const localImport = verifyPassportLocalRunImport(input.local_import);
  const plan = verifyPassportRunBinding(input.plan);
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  const tenantId = requireId(input.tenant_id, "input.tenant_id");
  if (plan.state !== "planned") fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "Only a planned run can pass preflight");
  if (plan.tenant_id !== tenantId || freeze.tenant_id !== tenantId || localImport.tenant_id !== tenantId) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, "The import, plan, freeze, and preflight tenant must match");
  }
  assertPassportRunFreeze({ run: plan, freeze });
  if (!referenceMatches(localImport.run_ref, runReference(plan))
      || !referenceMatches(localImport.freeze_ref, freezeReference(freeze))) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, "The local import does not bind this exact plan and freeze");
  }
  const evaluatedAt = canonicalInstant(input.evaluated_at, "input.evaluated_at");
  const executionPrincipalId = requireId(input.execution_principal_id, "input.execution_principal_id");
  const authorization = normalizeExecutionAuthorization(input.authorization, "input.authorization");
  const clock = normalizeClockCheck(input.clock, "input.clock");
  const budget = normalizeBudgetCheck(input.budget, "input.budget");
  const concurrency = normalizeConcurrencyCheck(input.concurrency, "input.concurrency");
  const stopConditions = normalizeStopConditions(input.stop_conditions, "input.stop_conditions");
  const runRef = runReference(plan);
  const freezeRef = freezeReference(freeze);
  const evaluated = evaluatePreflightSemantics({
    evaluatedAt,
    executionPrincipalId,
    plannedWindow: plan.planned_window,
    runRef,
    freezeRef,
    authorization,
    clock,
    budget,
    concurrency,
    stopConditions
  });
  const body = normalizePreflightBody({
    schema_version: PASSPORT_PREFLIGHT_VERSION,
    record_type: "passport_run_preflight",
    preflight_id: input.preflight_id,
    version: input.version,
    tenant_id: tenantId,
    evaluated_by: input.evaluated_by,
    execution_principal_id: executionPrincipalId,
    evaluated_at: evaluatedAt,
    valid_until: evaluated.valid_until,
    policy: PASSPORT_PREFLIGHT_POLICY,
    import_ref: importReference(localImport),
    run_ref: runRef,
    freeze_ref: freezeRef,
    planned_window: plan.planned_window,
    authorization,
    clock,
    budget,
    concurrency,
    stop_conditions: stopConditions,
    gate_results: evaluated.gate_results,
    decision: evaluated.decision,
    blockers: evaluated.blockers,
    boundary: {
      preflight_only: true,
      execution_performed: false,
      performance_claim_allowed: false
    }
  });
  return deepFreeze({ ...body, content_fingerprint: fingerprintBody(body) });
}

export function verifyPassportRunPreflight(record) {
  exactObject(record, [
    "schema_version", "record_type", "preflight_id", "version", "tenant_id", "evaluated_by", "execution_principal_id",
    "evaluated_at", "valid_until", "policy", "import_ref", "run_ref", "freeze_ref", "planned_window", "authorization",
    "clock", "budget", "concurrency", "stop_conditions", "gate_results", "decision", "blockers", "boundary", "content_fingerprint"
  ], [], "record");
  const { content_fingerprint: suppliedFingerprint, ...candidate } = record;
  const body = normalizePreflightBody(candidate);
  const expectedFingerprint = fingerprintBody(body);
  if (requireHash(suppliedFingerprint, "record.content_fingerprint") !== expectedFingerprint) {
    fail(PASSPORT_FREEZE_ERROR_CODES.fingerprintMismatch, "record.content_fingerprint does not match the preflight evidence");
  }
  return deepFreeze({ ...body, content_fingerprint: expectedFingerprint });
}

export function startPassportRun(input) {
  if (!isObject(input)) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, "input must be a plain object");
  if (!Object.hasOwn(input, "local_import")) {
    fail(PASSPORT_FREEZE_ERROR_CODES.localImportRequired, "A verified local import is required before a run can start");
  }
  if (!Object.hasOwn(input, "preflight")) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightRequired, "A passed preflight is required before a run can start");
  }
  exactObject(input, ["plan", "freeze", "local_import", "preflight", "execution_principal_id", "version", "started_at"], [], "input");
  const verifiedPlan = verifyPassportRunBinding(input.plan);
  const verifiedFreeze = verifyPassportScenarioMethodFreeze(input.freeze);
  const verifiedImport = verifyPassportLocalRunImport(input.local_import);
  const verifiedPreflight = verifyPassportRunPreflight(input.preflight);
  if (verifiedPlan.state !== "planned") fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "Only a planned run can be started");
  assertPassportRunFreeze({ run: verifiedPlan, freeze: verifiedFreeze });
  if (!referenceMatches(verifiedImport.run_ref, runReference(verifiedPlan))
      || !referenceMatches(verifiedImport.freeze_ref, freezeReference(verifiedFreeze))
      || !referenceMatches(verifiedPreflight.import_ref, importReference(verifiedImport))
      || !referenceMatches(verifiedPreflight.run_ref, runReference(verifiedPlan))
      || !referenceMatches(verifiedPreflight.freeze_ref, freezeReference(verifiedFreeze))
      || !referenceMatches(verifiedPreflight.planned_window, verifiedPlan.planned_window)) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, "The preflight does not bind this exact import, plan, and freeze");
  }
  if (verifiedPreflight.decision !== "passed") {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightFailed, "A failed preflight cannot enter the started state");
  }
  if (requireId(input.execution_principal_id, "input.execution_principal_id") !== verifiedPreflight.execution_principal_id) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightMismatch, "The start principal does not match the authorized execution principal");
  }
  const startedAt = canonicalInstant(input.started_at, "input.started_at");
  if (Date.parse(startedAt) < Date.parse(verifiedPreflight.evaluated_at)
      || Date.parse(startedAt) > Date.parse(verifiedPreflight.valid_until)) {
    fail(PASSPORT_FREEZE_ERROR_CODES.preflightExpired, "The preflight is not valid at the requested start time");
  }
  const nextVersion = requireSemver(input.version, "input.version");
  if (nextVersion === verifiedPlan.version) fail(PASSPORT_FREEZE_ERROR_CODES.inputInvalid, "Starting a run must create a new binding version");
  const { content_fingerprint: _planFingerprint, ...planBody } = verifiedPlan;
  return buildRunRecord({
    ...planBody,
    version: nextVersion,
    created_at: startedAt,
    state: "started",
    started_at: startedAt
  });
}

export function assertPassportRunFreeze({ run, freeze }) {
  const verifiedRun = verifyPassportRunBinding(run);
  const verifiedFreeze = verifyPassportScenarioMethodFreeze(freeze);
  const expected = freezeReference(verifiedFreeze);
  const matches = canonicalizeEvidenceValue(verifiedRun.freeze_ref) === canonicalizeEvidenceValue(expected);
  if (!matches) {
    const code = verifiedRun.state === "started"
      ? PASSPORT_FREEZE_ERROR_CODES.newRunRequired
      : PASSPORT_FREEZE_ERROR_CODES.freezeMismatch;
    fail(code, verifiedRun.state === "started"
      ? "The run has started; changed scenario or method parameters require a new run_id"
      : "The planned run is bound to another scenario-method freeze");
  }
  return deepFreeze({
    matched: true,
    run_id: verifiedRun.run_id,
    run_version: verifiedRun.version,
    freeze_id: verifiedFreeze.freeze_id,
    freeze_version: verifiedFreeze.version,
    freeze_fingerprint: verifiedFreeze.content_fingerprint
  });
}

export function createPassportReplacementRun(input) {
  exactObject(input, [
    "previous_run", "freeze", "run_id", "version", "created_by", "created_at", "authorization_scope", "planned_window"
  ], [], "input");
  const previousRun = verifyPassportRunBinding(input.previous_run);
  if (previousRun.state !== "started") fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "A replacement run requires a started predecessor");
  if (requireId(input.run_id, "input.run_id") === previousRun.run_id) {
    fail(PASSPORT_FREEZE_ERROR_CODES.newRunIdRequired, "Changed parameters after start require a different run_id");
  }
  return createPassportRunPlan({
    run_id: input.run_id,
    version: input.version,
    tenant_id: previousRun.tenant_id,
    created_by: input.created_by,
    created_at: input.created_at,
    authorization_scope: input.authorization_scope,
    freeze: input.freeze,
    planned_window: input.planned_window,
    supersedes_run_ref: runReference(previousRun)
  });
}
