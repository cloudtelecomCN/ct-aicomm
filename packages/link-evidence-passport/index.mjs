import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const PASSPORT_FREEZE_VERSION = "1.0.0";
export const PASSPORT_CHANGE_POLICY = "new-run-required-after-start";

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
  runStateInvalid: "passport_run_state_invalid"
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

export function startPassportRun({ plan, version, started_at: startedAt }) {
  const verifiedPlan = verifyPassportRunBinding(plan);
  if (verifiedPlan.state !== "planned") fail(PASSPORT_FREEZE_ERROR_CODES.runStateInvalid, "Only a planned run can be started");
  const nextVersion = requireSemver(version, "version");
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
