import { createHash } from "node:crypto";

export const REQUIREMENT_PASSPORT_SCHEMA_VERSION = "2.0.0";
export const REQUIREMENT_FIELD_SET_VERSION = "2.0.0";

const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "passport_id",
  "project_id",
  "task_template",
  "field_set_version",
  "state",
  "revision",
  "fields",
  "recorded_by",
  "recorded_at",
  "frozen_at",
  "content_sha256",
  "boundaries",
]);
const FIELD_KEYS = new Set(["field_id", "status", "value", "unit", "constraint", "source"]);
const SOURCE_KEYS = new Set(["kind", "confidence", "observed_at", "reference"]);
const TEMPLATE_KEYS = new Set(["id", "version"]);
const ACTOR_KEYS = new Set(["actor_type", "role"]);
const BOUNDARY_KEYS = new Set(["decision_support_only", "execution_authorized", "performance_claim_allowed"]);
const CONSTRAINTS = new Set(["hard", "soft", "context"]);
const STATUSES = new Set(["provided", "unknown", "not_applicable"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_invalid`, `${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${label}_field_unknown`, `${label} contains unknown field ${unknown}`);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestProjection(passport) {
  return {
    schema_version: passport.schema_version,
    passport_id: passport.passport_id,
    project_id: passport.project_id,
    task_template: passport.task_template,
    field_set_version: passport.field_set_version,
    state: passport.state,
    revision: passport.revision,
    fields: [...passport.fields].sort((left, right) => compareText(left.field_id, right.field_id)),
    recorded_by: passport.recorded_by,
    recorded_at: passport.recorded_at,
    frozen_at: passport.frozen_at,
    boundaries: passport.boundaries,
  };
}

export function computeRequirementPassportDigest(passport) {
  return `sha256:${createHash("sha256").update(canonicalize(digestProjection(passport))).digest("hex")}`;
}

function validTimestamp(value) {
  return typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function valueMatches(value, valueType) {
  if (valueType === "string") return typeof value === "string" && value.trim().length > 0;
  if (valueType === "number") return typeof value === "number" && Number.isFinite(value);
  if (valueType === "integer") return Number.isSafeInteger(value);
  if (valueType === "boolean") return typeof value === "boolean";
  if (valueType === "string_list") return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
  return false;
}

export function validateRequirementPassport(passport, registry) {
  exactKeys(passport, TOP_LEVEL_KEYS, "requirement_passport");
  exactKeys(passport.task_template, TEMPLATE_KEYS, "requirement_task_template");
  exactKeys(passport.recorded_by, ACTOR_KEYS, "requirement_recorded_by");
  exactKeys(passport.boundaries, BOUNDARY_KEYS, "requirement_boundaries");
  if (passport.schema_version !== REQUIREMENT_PASSPORT_SCHEMA_VERSION) fail("requirement_passport_schema_unsupported", "unsupported passport schema version");
  if (passport.field_set_version !== REQUIREMENT_FIELD_SET_VERSION) fail("requirement_field_set_unsupported", "unsupported field-set version");
  if (!/^advisor_passport_[0-9a-f-]{36}$/.test(passport.passport_id)) fail("requirement_passport_id_invalid", "passport ID is invalid");
  if (!/^advisor_project_[0-9a-f-]{36}$/.test(passport.project_id)) fail("requirement_project_id_invalid", "project ID is invalid");
  if (!Number.isSafeInteger(passport.revision) || passport.revision < 1) fail("requirement_revision_invalid", "revision must be a positive integer");
  if (!new Set(["draft", "frozen"]).has(passport.state)) fail("requirement_state_invalid", "state must be draft or frozen");
  if (!validTimestamp(passport.recorded_at)) fail("requirement_recorded_at_invalid", "recorded_at must be a UTC timestamp");
  if (!passport.recorded_by || !new Set(["customer", "advisor", "importer", "system"]).has(passport.recorded_by.actor_type)) fail("requirement_actor_invalid", "recorded_by actor type is invalid");
  if (passport.boundaries?.decision_support_only !== true || passport.boundaries?.execution_authorized !== false || passport.boundaries?.performance_claim_allowed !== false) {
    fail("requirement_boundary_invalid", "passport must remain non-executing and must not authorize performance claims");
  }

  const template = registry?.template_profiles?.find(({ template_id: id, field_set_version: version }) => id === passport.task_template?.id && version === passport.field_set_version);
  if (!template || template.template_version !== passport.task_template?.version) fail("requirement_template_unknown", "task template and field-set binding is unknown");
  const definitions = new Map((registry.fields ?? []).map((field) => [field.field_id, field]));
  const sourceKinds = new Set(registry.source_kinds ?? []);
  const confidenceLevels = new Set(registry.confidence_levels ?? []);
  const permitted = new Set([...template.required_fields, ...template.optional_fields]);
  if (!Array.isArray(passport.fields) || passport.fields.length === 0) fail("requirement_fields_empty", "passport must contain fields");

  const ids = new Set();
  for (const field of passport.fields) {
    exactKeys(field, FIELD_KEYS, "requirement_field");
    exactKeys(field.source, SOURCE_KEYS, "requirement_source");
    const definition = definitions.get(field.field_id);
    if (!definition || !permitted.has(field.field_id)) fail("requirement_field_not_permitted", `field ${field.field_id} is not permitted for this template`);
    if (ids.has(field.field_id)) fail("requirement_field_duplicate", `field ${field.field_id} is duplicated`);
    ids.add(field.field_id);
    if (!STATUSES.has(field.status)) fail("requirement_field_status_invalid", `field ${field.field_id} has an invalid status`);
    if (!CONSTRAINTS.has(field.constraint)) fail("requirement_constraint_invalid", `field ${field.field_id} has an invalid constraint`);
    if (!definition.allowed_units.includes(field.unit)) fail("requirement_unit_invalid", `field ${field.field_id} uses an invalid unit`);
    if (!sourceKinds.has(field.source.kind) || !confidenceLevels.has(field.source.confidence) || !validTimestamp(field.source.observed_at)) {
      fail("requirement_source_invalid", `field ${field.field_id} has invalid source metadata`);
    }
    if (field.source.reference !== undefined && (typeof field.source.reference !== "string" || field.source.reference.length > 500)) {
      fail("requirement_source_reference_invalid", `field ${field.field_id} has an invalid source reference`);
    }
    if (field.status === "provided" && !valueMatches(field.value, definition.value_type)) fail("requirement_value_invalid", `field ${field.field_id} does not match ${definition.value_type}`);
    if (field.status !== "provided" && field.value !== null) fail("requirement_unknown_value_present", `field ${field.field_id} must use null when it is not provided`);
  }

  const missing = template.required_fields.filter((fieldId) => !ids.has(fieldId) || passport.fields.find(({ field_id: id }) => id === fieldId)?.status !== "provided");
  if (passport.state === "frozen" && missing.length) fail("requirement_required_field_missing", `frozen passport is missing ${missing[0]}`);
  if (passport.state === "frozen") {
    if (!validTimestamp(passport.frozen_at)) fail("requirement_frozen_at_invalid", "frozen passport needs a UTC frozen_at timestamp");
    if (Date.parse(passport.frozen_at) < Date.parse(passport.recorded_at)) fail("requirement_frozen_before_recorded", "frozen_at cannot precede recorded_at");
    const expected = computeRequirementPassportDigest(passport);
    if (passport.content_sha256 !== expected) fail("requirement_digest_mismatch", "frozen passport digest does not match its content");
  } else if (passport.frozen_at !== null || passport.content_sha256 !== null) {
    fail("requirement_draft_digest_forbidden", "draft passport cannot carry frozen metadata");
  }

  return {
    schema_version: REQUIREMENT_PASSPORT_SCHEMA_VERSION,
    valid: true,
    state: passport.state,
    template_id: template.template_id,
    field_count: passport.fields.length,
    required_field_count: template.required_fields.length,
    required_fields_complete: missing.length === 0,
    digest_verified: passport.state === "frozen",
    decision_support_only: true,
    execution_authorized: false,
  };
}
