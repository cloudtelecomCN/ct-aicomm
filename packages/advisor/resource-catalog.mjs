import { createHash } from "node:crypto";

export const RESOURCE_CATALOG_SCHEMA_VERSION = "1.0.0";
export const RESOURCE_FIELD_REGISTRY_VERSION = "1.0.0";
export const RESOURCE_CATALOG_TYPES = Object.freeze([
  "gpu",
  "cloud_instance",
  "region",
  "network_path",
  "software_stack",
  "pricing_offer",
]);

const RESOURCE_TYPE_SET = new Set(RESOURCE_CATALOG_TYPES);
const SOURCE_KINDS = new Set(["measured", "vendor_published", "customer_quoted", "customer_declared", "modeled", "inferred", "synthetic", "unknown"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low", "unknown"]);
const AUTHORIZATION_BASES = new Set(["public_web", "open_license", "customer_authorized", "contract", "internal_synthetic", "unknown"]);
const AUTHORIZATION_DECISIONS = new Set(["allowed", "prohibited", "unknown"]);
const FACT_STATUSES = new Set(["provided", "unknown", "not_applicable"]);
const LIFECYCLE_STATUSES = new Set(["active", "deprecated", "unknown"]);
const VISIBILITIES = new Set(["public", "tenant_private"]);
const DATA_CLASSES = new Set(["public", "tenant_private", "synthetic"]);

const REGISTRY_KEYS = new Set(["schema_version", "registry_id", "registry_version", "published_at", "units", "source_kinds", "confidence_levels", "authorization_bases", "authorization_decisions", "resource_types", "fields", "resource_profiles"]);
const RESOURCE_KEYS = new Set(["schema_version", "resource_id", "resource_type", "canonical_key", "display_name", "lifecycle_status", "visibility", "data_class", "facts", "source_snapshot", "recorded_at", "content_sha256", "boundaries"]);
const SOURCE_KEYS = new Set(["schema_version", "snapshot_id", "data_class", "kind", "confidence", "publisher", "title", "reference_url", "observed_at", "effective_from", "expires_at", "authorization", "summary", "content_sha256"]);
const AUTHORIZATION_KEYS = new Set(["basis", "analysis_use", "redistribution", "reference"]);
const FACT_KEYS = new Set(["field_id", "status", "value", "unit"]);
const RESOURCE_BOUNDARY_KEYS = new Set(["decision_support_only", "execution_authorized", "performance_claim_allowed"]);
const BUNDLE_KEYS = new Set(["schema_version", "catalog_id", "catalog_version", "published_at", "resources", "boundaries"]);
const BUNDLE_BOUNDARY_KEYS = new Set(["tenant_private_excluded", "synthetic_data_labeled", "execution_authorized", "performance_claim_allowed"]);

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
  if (value && typeof value === "object") return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function validTimestamp(value) {
  return typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function validReference(value) {
  if (value === null) return true;
  if (typeof value !== "string" || value.length < 3 || value.length > 500) return false;
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

function valueMatches(value, valueType) {
  if (valueType === "string") return typeof value === "string" && value.trim().length > 0 && value.length <= 1000;
  if (valueType === "number") return typeof value === "number" && Number.isFinite(value);
  if (valueType === "integer") return Number.isSafeInteger(value);
  if (valueType === "boolean") return typeof value === "boolean";
  if (valueType === "string_list") return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200) && new Set(value).size === value.length;
  return false;
}

function sourceDigestProjection(source) {
  const { content_sha256: ignored, ...projection } = source;
  return projection;
}

function resourceDigestProjection(resource) {
  return {
    schema_version: resource.schema_version,
    resource_id: resource.resource_id,
    resource_type: resource.resource_type,
    canonical_key: resource.canonical_key,
    display_name: resource.display_name,
    lifecycle_status: resource.lifecycle_status,
    visibility: resource.visibility,
    data_class: resource.data_class,
    facts: [...resource.facts].sort((left, right) => compareText(left.field_id, right.field_id)),
    source_snapshot: resource.source_snapshot,
    recorded_at: resource.recorded_at,
    boundaries: resource.boundaries,
  };
}

export function computeCatalogSourceDigest(source) {
  return sha256(sourceDigestProjection(source));
}

export function computeCatalogResourceDigest(resource) {
  return sha256(resourceDigestProjection(resource));
}

export function validateResourceFieldRegistry(registry) {
  exactKeys(registry, REGISTRY_KEYS, "resource_field_registry");
  if (registry.schema_version !== RESOURCE_FIELD_REGISTRY_VERSION || registry.registry_version !== RESOURCE_FIELD_REGISTRY_VERSION || registry.registry_id !== "ct-advisor-resource-fields") fail("resource_registry_version_unsupported", "unsupported resource field registry");
  if (!validTimestamp(registry.published_at)) fail("resource_registry_timestamp_invalid", "registry published_at must be a UTC timestamp");
  const unitCodes = new Set((registry.units ?? []).map(({ code }) => code));
  if (!unitCodes.size) fail("resource_registry_units_empty", "resource registry must declare units");
  const fieldIds = new Set();
  for (const field of registry.fields ?? []) {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(field.field_id || "") || fieldIds.has(field.field_id)) fail("resource_registry_field_invalid", "resource registry field identifiers must be unique and canonical");
    fieldIds.add(field.field_id);
    if (!new Set(["string", "number", "integer", "boolean", "string_list"]).has(field.value_type) || !Array.isArray(field.allowed_units) || !field.allowed_units.length || !field.allowed_units.every((unit) => unitCodes.has(unit))) fail("resource_registry_field_invalid", `resource field ${field.field_id} is incomplete`);
  }
  const profileTypes = new Set();
  for (const profile of registry.resource_profiles ?? []) {
    if (!RESOURCE_TYPE_SET.has(profile.resource_type) || profileTypes.has(profile.resource_type)) fail("resource_registry_profile_invalid", "resource profiles must bind every resource type once");
    profileTypes.add(profile.resource_type);
    const all = [...(profile.required_fields ?? []), ...(profile.optional_fields ?? [])];
    if (!profile.required_fields?.length || new Set(all).size !== all.length || !all.every((fieldId) => fieldIds.has(fieldId))) fail("resource_registry_profile_invalid", `resource profile ${profile.resource_type} is incomplete`);
  }
  if (profileTypes.size !== RESOURCE_CATALOG_TYPES.length) fail("resource_registry_profile_missing", "resource registry must cover every supported resource type");
  for (const expected of RESOURCE_CATALOG_TYPES) if (!profileTypes.has(expected)) fail("resource_registry_profile_missing", `resource profile ${expected} is missing`);
  if (!Array.isArray(registry.source_kinds) || !registry.source_kinds.every((value) => SOURCE_KINDS.has(value))) fail("resource_registry_source_kind_invalid", "resource source kinds are invalid");
  if (!Array.isArray(registry.confidence_levels) || !registry.confidence_levels.every((value) => CONFIDENCE_LEVELS.has(value))) fail("resource_registry_confidence_invalid", "resource confidence levels are invalid");
  if (!Array.isArray(registry.authorization_bases) || !registry.authorization_bases.every((value) => AUTHORIZATION_BASES.has(value))) fail("resource_registry_authorization_invalid", "resource authorization bases are invalid");
  if (!Array.isArray(registry.authorization_decisions) || !registry.authorization_decisions.every((value) => AUTHORIZATION_DECISIONS.has(value))) fail("resource_registry_authorization_invalid", "resource authorization decisions are invalid");
  return { valid: true, field_count: fieldIds.size, profile_count: profileTypes.size };
}

export function validateCatalogSourceSnapshot(source, { visibility } = {}) {
  exactKeys(source, SOURCE_KEYS, "catalog_source_snapshot");
  exactKeys(source.authorization, AUTHORIZATION_KEYS, "catalog_source_authorization");
  if (source.schema_version !== RESOURCE_CATALOG_SCHEMA_VERSION) fail("catalog_source_schema_unsupported", "unsupported source snapshot schema");
  if (!/^advisor_source_[0-9a-f-]{36}$/.test(source.snapshot_id || "")) fail("catalog_source_id_invalid", "source snapshot ID is invalid");
  if (!DATA_CLASSES.has(source.data_class) || !SOURCE_KINDS.has(source.kind) || !CONFIDENCE_LEVELS.has(source.confidence)) fail("catalog_source_classification_invalid", "source classification is invalid");
  if (typeof source.publisher !== "string" || source.publisher.trim().length < 1 || source.publisher.length > 160 || typeof source.title !== "string" || source.title.trim().length < 1 || source.title.length > 240) fail("catalog_source_identity_invalid", "source publisher and title are required");
  if (!validReference(source.reference_url)) fail("catalog_source_reference_invalid", "source reference must be a URI or null");
  if (!validTimestamp(source.observed_at) || !validTimestamp(source.effective_from) || (source.expires_at !== null && !validTimestamp(source.expires_at))) fail("catalog_source_validity_invalid", "source validity timestamps must use UTC");
  if (source.expires_at !== null && Date.parse(source.expires_at) <= Date.parse(source.effective_from)) fail("catalog_source_validity_invalid", "source expiry must follow its effective time");
  if (!AUTHORIZATION_BASES.has(source.authorization.basis) || !AUTHORIZATION_DECISIONS.has(source.authorization.analysis_use) || !AUTHORIZATION_DECISIONS.has(source.authorization.redistribution)) fail("catalog_source_authorization_invalid", "source authorization is invalid");
  if (source.authorization.reference !== null && (typeof source.authorization.reference !== "string" || source.authorization.reference.length < 1 || source.authorization.reference.length > 500)) fail("catalog_source_authorization_invalid", "authorization reference is invalid");
  if (typeof source.summary !== "string" || source.summary.trim().length < 8 || source.summary.length > 1000) fail("catalog_source_summary_invalid", "source summary must contain 8-1000 characters");
  if (source.data_class === "synthetic" && (source.kind !== "synthetic" || source.authorization.basis !== "internal_synthetic")) fail("catalog_synthetic_label_invalid", "synthetic sources must use synthetic origin and authorization");
  if (visibility === "public") {
    if (!new Set(["public", "synthetic"]).has(source.data_class)) fail("catalog_private_source_public", "tenant-private sources cannot enter a public catalog");
    if (source.authorization.analysis_use !== "allowed" || source.authorization.redistribution !== "allowed") fail("catalog_public_authorization_invalid", "public catalog sources require analysis and redistribution authorization");
  }
  if (visibility === "tenant_private" && !new Set(["tenant_private", "synthetic"]).has(source.data_class)) fail("catalog_private_data_class_invalid", "tenant-private resources require tenant-private or explicitly synthetic source data");
  const expected = computeCatalogSourceDigest(source);
  if (source.content_sha256 !== expected) fail("catalog_source_digest_mismatch", "source snapshot digest does not match its content");
  return { valid: true, digest_verified: true };
}

export function classifyCatalogResource(resource, evaluatedAt = new Date().toISOString(), registry) {
  if (!validTimestamp(evaluatedAt)) fail("catalog_evaluation_time_invalid", "evaluation time must be a UTC timestamp");
  const profile = registry?.resource_profiles?.find(({ resource_type: type }) => type === resource.resource_type);
  const required = new Set(profile?.required_fields ?? []);
  const provided = new Set(resource.facts.filter(({ status }) => status === "provided").map(({ field_id }) => field_id));
  const missingRequiredFields = [...required].filter((fieldId) => !provided.has(fieldId)).sort(compareText);
  const now = Date.parse(evaluatedAt);
  const effective = Date.parse(resource.source_snapshot.effective_from);
  const expires = resource.source_snapshot.expires_at === null ? null : Date.parse(resource.source_snapshot.expires_at);
  const freshness = now < effective ? "not_yet_effective" : expires !== null && now >= expires ? "expired" : "current";
  const reasons = [];
  if (resource.lifecycle_status !== "active") reasons.push(`lifecycle_${resource.lifecycle_status}`);
  if (freshness !== "current") reasons.push(freshness);
  if (resource.source_snapshot.authorization.analysis_use !== "allowed") reasons.push("analysis_use_not_allowed");
  if (missingRequiredFields.length) reasons.push("required_facts_missing");
  return {
    evaluated_at: evaluatedAt,
    freshness,
    required_facts_complete: missingRequiredFields.length === 0,
    missing_required_fields: missingRequiredFields,
    usable_for_analysis: reasons.length === 0,
    reasons,
  };
}

export function validateCatalogResource(resource, registry, { evaluatedAt = "2026-10-23T00:00:00.000Z" } = {}) {
  validateResourceFieldRegistry(registry);
  exactKeys(resource, RESOURCE_KEYS, "catalog_resource");
  exactKeys(resource.boundaries, RESOURCE_BOUNDARY_KEYS, "catalog_resource_boundaries");
  if (resource.schema_version !== RESOURCE_CATALOG_SCHEMA_VERSION) fail("catalog_resource_schema_unsupported", "unsupported catalog resource schema");
  if (!/^advisor_resource_[0-9a-f-]{36}$/.test(resource.resource_id || "")) fail("catalog_resource_id_invalid", "resource ID is invalid");
  if (!RESOURCE_TYPE_SET.has(resource.resource_type) || !LIFECYCLE_STATUSES.has(resource.lifecycle_status) || !VISIBILITIES.has(resource.visibility) || !DATA_CLASSES.has(resource.data_class)) fail("catalog_resource_classification_invalid", "resource classification is invalid");
  if (!/^[a-z0-9][a-z0-9._:-]{2,159}$/.test(resource.canonical_key || "")) fail("catalog_resource_key_invalid", "resource canonical key is invalid");
  if (typeof resource.display_name !== "string" || resource.display_name.trim().length < 2 || resource.display_name.length > 160) fail("catalog_resource_name_invalid", "resource display name is invalid");
  if (!validTimestamp(resource.recorded_at)) fail("catalog_resource_recorded_at_invalid", "resource recorded_at must be a UTC timestamp");
  if (resource.visibility === "public" && !new Set(["public", "synthetic"]).has(resource.data_class)) fail("catalog_private_resource_public", "tenant-private resources cannot enter a public catalog");
  if (resource.visibility === "tenant_private" && !new Set(["tenant_private", "synthetic"]).has(resource.data_class)) fail("catalog_private_data_class_invalid", "tenant-private resources require tenant-private or explicitly synthetic data");
  if (resource.boundaries?.decision_support_only !== true || resource.boundaries?.execution_authorized !== false || resource.boundaries?.performance_claim_allowed !== false) fail("catalog_resource_boundary_invalid", "catalog resources must remain non-executing and non-claiming");
  validateCatalogSourceSnapshot(resource.source_snapshot, { visibility: resource.visibility });
  if (resource.source_snapshot.data_class !== resource.data_class) fail("catalog_source_resource_class_mismatch", "resource and source data classes must match");

  const profile = registry.resource_profiles.find(({ resource_type: type }) => type === resource.resource_type);
  const definitions = new Map(registry.fields.map((field) => [field.field_id, field]));
  const permitted = new Set([...profile.required_fields, ...profile.optional_fields]);
  if (!Array.isArray(resource.facts) || resource.facts.length < 1 || resource.facts.length > 100) fail("catalog_resource_facts_invalid", "resource must contain 1-100 facts");
  const ids = new Set();
  for (const fact of resource.facts) {
    exactKeys(fact, FACT_KEYS, "catalog_resource_fact");
    const definition = definitions.get(fact.field_id);
    if (!definition || !permitted.has(fact.field_id)) fail("catalog_resource_fact_not_permitted", `fact ${fact.field_id || "(missing)"} is not permitted for ${resource.resource_type}`);
    if (ids.has(fact.field_id)) fail("catalog_resource_fact_duplicate", `fact ${fact.field_id} is duplicated`);
    ids.add(fact.field_id);
    if (!FACT_STATUSES.has(fact.status) || !definition.allowed_units.includes(fact.unit)) fail("catalog_resource_fact_invalid", `fact ${fact.field_id} has an invalid status or unit`);
    if (fact.status === "provided" && !valueMatches(fact.value, definition.value_type)) fail("catalog_resource_value_invalid", `fact ${fact.field_id} does not match ${definition.value_type}`);
    if (fact.status !== "provided" && fact.value !== null) fail("catalog_resource_unknown_value_present", `fact ${fact.field_id} must use null when unavailable`);
  }
  const expected = computeCatalogResourceDigest(resource);
  if (resource.content_sha256 !== expected) fail("catalog_resource_digest_mismatch", "resource digest does not match its content");
  return { valid: true, digest_verified: true, ...classifyCatalogResource(resource, evaluatedAt, registry) };
}

export function validateResourceCatalogBundle(bundle, registry, options = {}) {
  exactKeys(bundle, BUNDLE_KEYS, "resource_catalog_bundle");
  exactKeys(bundle.boundaries, BUNDLE_BOUNDARY_KEYS, "resource_catalog_boundaries");
  if (bundle.schema_version !== RESOURCE_CATALOG_SCHEMA_VERSION || bundle.catalog_id !== "ct-advisor-public-resource-catalog" || bundle.catalog_version !== "1.0.0") fail("resource_catalog_version_unsupported", "unsupported resource catalog bundle");
  if (!validTimestamp(bundle.published_at)) fail("resource_catalog_timestamp_invalid", "catalog published_at must be a UTC timestamp");
  if (bundle.boundaries?.tenant_private_excluded !== true || bundle.boundaries?.synthetic_data_labeled !== true || bundle.boundaries?.execution_authorized !== false || bundle.boundaries?.performance_claim_allowed !== false) fail("resource_catalog_boundary_invalid", "public catalog boundaries are invalid");
  if (!Array.isArray(bundle.resources) || bundle.resources.length < 1) fail("resource_catalog_empty", "catalog must contain resources");
  const ids = new Set();
  const canonicalKeys = new Set();
  const evaluations = [];
  for (const resource of bundle.resources) {
    if (resource.visibility !== "public") fail("resource_catalog_private_entry", "public catalog cannot contain tenant-private resources");
    if (ids.has(resource.resource_id) || canonicalKeys.has(`${resource.resource_type}:${resource.canonical_key}`)) fail("resource_catalog_duplicate", "catalog resource IDs and canonical keys must be unique");
    ids.add(resource.resource_id);
    canonicalKeys.add(`${resource.resource_type}:${resource.canonical_key}`);
    evaluations.push(validateCatalogResource(resource, registry, options));
  }
  return {
    valid: true,
    resource_count: bundle.resources.length,
    current_count: evaluations.filter(({ freshness }) => freshness === "current").length,
    expired_count: evaluations.filter(({ freshness }) => freshness === "expired").length,
    usable_for_analysis_count: evaluations.filter(({ usable_for_analysis }) => usable_for_analysis).length,
    tenant_private_excluded: true,
    execution_authorized: false,
  };
}
