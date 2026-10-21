import { fingerprint } from "../agent-control/protocol.mjs";

export const DATA_PATH_DECLARATION_VERSION = "1.0.0";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const JURISDICTION = /^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{1,200}$/;
const CLASSIFICATIONS = new Set(["public", "internal", "confidential", "restricted"]);
const REGION_ROLES = new Set(["origin", "transit", "processing", "storage", "destination"]);
const BOUNDARY_TYPES = new Set(["network_zone", "tenant", "provider", "jurisdiction"]);
const TRANSIT_PROTOCOLS = new Set(["tls-1.2", "tls-1.3", "mtls-1.2", "mtls-1.3", "ipsec", "wireguard", "macsec", "application-layer"]);
const TRANSIT_TERMINATIONS = new Set(["end-to-end", "boundary", "hop-by-hop", "not-applicable"]);
const AT_REST_ALGORITHMS = new Set(["aes-128-gcm", "aes-256-gcm", "aes-256-xts", "provider-managed"]);
const KEY_CONTROLS = new Set(["tenant", "processor", "shared", "not-applicable"]);
const PROCESSOR_ROLES = new Set(["controller", "processor", "subprocessor"]);

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

function inputObject(value, required, optional, code) {
  if (!isObject(value)) fail(`${code}_object_invalid`, `${code} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${code}_field_unknown`, `${code}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${code}_field_missing`, `${code}.${key} is required`);
}

function requireText(value, field, pattern = ID) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${field}_invalid`, `${field} is invalid`);
  return value;
}

function requireNullableText(value, field) {
  if (value === null) return null;
  return requireText(value, field);
}

function requireInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${field}_invalid`, `${field} must be a positive safe integer`);
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") fail(`${field}_invalid`, `${field} must be boolean`);
  return value;
}

function requireInstant(value, field) {
  if (typeof value !== "string") fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  return value;
}

function requireStringList(value, field, { allowed, minimum = 0 } = {}) {
  if (!Array.isArray(value) || value.length < minimum) fail(`${field}_invalid`, `${field} must contain at least ${minimum} item(s)`);
  const normalized = value.map((item, index) => {
    const text = requireText(item, `${field}_${index}`);
    if (allowed && !allowed.has(text)) fail(`${field}_value_invalid`, `${field} contains unsupported value ${text}`);
    return text;
  });
  if (new Set(normalized).size !== normalized.length) fail(`${field}_duplicate`, `${field} must not contain duplicates`);
  return normalized.sort();
}

function requireObjectList(value, field, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) fail(`${field}_invalid`, `${field} must contain at least ${minimum} item(s)`);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function normalizeDataCategories(value) {
  const ids = new Set();
  const normalized = requireObjectList(value, "data_categories").map((category, index) => {
    exactObject(category, ["category_id", "classification"], `data_category_${index}`);
    const categoryId = requireText(category.category_id, `data_category_${index}_category_id`);
    if (ids.has(categoryId)) fail("data_category_duplicate", `duplicate category_id ${categoryId}`);
    ids.add(categoryId);
    const classification = requireText(category.classification, `data_category_${index}_classification`);
    if (!CLASSIFICATIONS.has(classification)) fail("data_category_classification_invalid", `unsupported classification ${classification}`);
    return { category_id: categoryId, classification };
  });
  normalized.sort((left, right) => left.category_id < right.category_id ? -1 : left.category_id > right.category_id ? 1 : 0);
  return { normalized, ids };
}

function normalizeRegions(value) {
  const byId = new Map();
  const normalized = requireObjectList(value, "regions", 2).map((region, index) => {
    exactObject(region, ["region_id", "jurisdiction_code", "provider", "provider_region", "roles"], `region_${index}`);
    const regionId = requireText(region.region_id, `region_${index}_region_id`);
    if (byId.has(regionId)) fail("region_duplicate", `duplicate region_id ${regionId}`);
    const normalizedRegion = {
      region_id: regionId,
      jurisdiction_code: requireText(region.jurisdiction_code, `region_${index}_jurisdiction_code`, JURISDICTION),
      provider: requireText(region.provider, `region_${index}_provider`, SAFE_TEXT),
      provider_region: requireText(region.provider_region, `region_${index}_provider_region`),
      roles: requireStringList(region.roles, `region_${index}_roles`, { allowed: REGION_ROLES, minimum: 1 })
    };
    byId.set(regionId, normalizedRegion);
    return normalizedRegion;
  });
  normalized.sort((left, right) => left.region_id < right.region_id ? -1 : left.region_id > right.region_id ? 1 : 0);
  return { normalized, byId };
}

function normalizeBoundaries(value, orderedRegionIds, regionsById) {
  if (!Array.isArray(value) || value.length !== orderedRegionIds.length - 1) {
    fail("boundaries_length_invalid", "boundaries must contain exactly one directed boundary for each path transition");
  }
  const byEdge = new Map();
  const boundaryIds = new Set();
  for (const [index, boundary] of value.entries()) {
    exactObject(boundary, ["boundary_id", "from_region_id", "to_region_id", "boundary_types", "cross_jurisdiction", "transfer_basis_ref"], `boundary_${index}`);
    const boundaryId = requireText(boundary.boundary_id, `boundary_${index}_boundary_id`);
    if (boundaryIds.has(boundaryId)) fail("boundary_id_duplicate", `duplicate boundary_id ${boundaryId}`);
    boundaryIds.add(boundaryId);
    const fromRegionId = requireText(boundary.from_region_id, `boundary_${index}_from_region_id`);
    const toRegionId = requireText(boundary.to_region_id, `boundary_${index}_to_region_id`);
    if (fromRegionId === toRegionId) fail("boundary_loop_invalid", `${boundaryId} must cross between two different regions`);
    if (!regionsById.has(fromRegionId) || !regionsById.has(toRegionId)) fail("boundary_region_unknown", `${boundaryId} references an unknown region`);
    const edge = `${fromRegionId}\u0000${toRegionId}`;
    if (byEdge.has(edge)) fail("boundary_duplicate", `duplicate boundary ${fromRegionId} -> ${toRegionId}`);
    const boundaryTypes = requireStringList(boundary.boundary_types, `boundary_${index}_types`, { allowed: BOUNDARY_TYPES, minimum: 1 });
    const crossJurisdiction = requireBoolean(boundary.cross_jurisdiction, `boundary_${index}_cross_jurisdiction`);
    const transferBasisRef = requireNullableText(boundary.transfer_basis_ref, `boundary_${index}_transfer_basis_ref`);
    const jurisdictionsDiffer = regionsById.get(fromRegionId).jurisdiction_code !== regionsById.get(toRegionId).jurisdiction_code;
    if (crossJurisdiction !== jurisdictionsDiffer) fail("boundary_jurisdiction_mismatch", `${boundaryId} cross_jurisdiction must match the declared jurisdiction codes`);
    if (crossJurisdiction && !boundaryTypes.includes("jurisdiction")) fail("boundary_jurisdiction_type_missing", `${boundaryId} must include the jurisdiction boundary type`);
    if (!crossJurisdiction && boundaryTypes.includes("jurisdiction")) fail("boundary_jurisdiction_type_invalid", `${boundaryId} must not claim a jurisdiction boundary`);
    if (crossJurisdiction && transferBasisRef === null) fail("boundary_transfer_basis_required", `${boundaryId} requires an operator-supplied transfer basis reference`);
    if (!crossJurisdiction && transferBasisRef !== null) fail("boundary_transfer_basis_unexpected", `${boundaryId} must use null when no jurisdiction boundary is declared`);
    byEdge.set(edge, {
      boundary_id: boundaryId,
      from_region_id: fromRegionId,
      to_region_id: toRegionId,
      boundary_types: boundaryTypes,
      cross_jurisdiction: crossJurisdiction,
      transfer_basis_ref: transferBasisRef
    });
  }

  return orderedRegionIds.slice(0, -1).map((fromRegionId, index) => {
    const toRegionId = orderedRegionIds[index + 1];
    const boundary = byEdge.get(`${fromRegionId}\u0000${toRegionId}`);
    if (!boundary) fail("boundary_path_gap", `missing directed boundary ${fromRegionId} -> ${toRegionId}`);
    return boundary;
  });
}

function normalizeEncryption(value) {
  exactObject(value, ["in_transit", "at_rest"], "encryption");
  exactObject(value.in_transit, ["required", "protocols", "termination", "plaintext_exception_refs"], "encryption_in_transit");
  const transitRequired = requireBoolean(value.in_transit.required, "encryption_in_transit_required");
  const protocols = requireStringList(value.in_transit.protocols, "encryption_in_transit_protocols", {
    allowed: TRANSIT_PROTOCOLS,
    minimum: transitRequired ? 1 : 0
  });
  const termination = requireText(value.in_transit.termination, "encryption_in_transit_termination");
  if (!TRANSIT_TERMINATIONS.has(termination)) fail("encryption_in_transit_termination_invalid", `unsupported termination ${termination}`);
  if (transitRequired && termination === "not-applicable") fail("encryption_in_transit_termination_required", "required transit encryption needs a termination model");
  if (!transitRequired && (protocols.length > 0 || termination !== "not-applicable")) fail("encryption_in_transit_disabled_invalid", "disabled transit encryption must use no protocols and not-applicable termination");
  const plaintextExceptionRefs = requireStringList(value.in_transit.plaintext_exception_refs, "encryption_in_transit_plaintext_exception_refs");

  exactObject(value.at_rest, ["required", "algorithms", "key_control", "key_reference"], "encryption_at_rest");
  const atRestRequired = requireBoolean(value.at_rest.required, "encryption_at_rest_required");
  const algorithms = requireStringList(value.at_rest.algorithms, "encryption_at_rest_algorithms", {
    allowed: AT_REST_ALGORITHMS,
    minimum: atRestRequired ? 1 : 0
  });
  const keyControl = requireText(value.at_rest.key_control, "encryption_at_rest_key_control");
  if (!KEY_CONTROLS.has(keyControl)) fail("encryption_at_rest_key_control_invalid", `unsupported key_control ${keyControl}`);
  const keyReference = requireNullableText(value.at_rest.key_reference, "encryption_at_rest_key_reference");
  if (atRestRequired && (keyControl === "not-applicable" || keyReference === null)) fail("encryption_at_rest_key_required", "required at-rest encryption needs key control and an opaque key reference");
  if (!atRestRequired && (algorithms.length > 0 || keyControl !== "not-applicable" || keyReference !== null)) fail("encryption_at_rest_disabled_invalid", "disabled at-rest encryption must not claim an algorithm or key");

  return {
    in_transit: {
      required: transitRequired,
      protocols,
      termination,
      plaintext_exception_refs: plaintextExceptionRefs
    },
    at_rest: {
      required: atRestRequired,
      algorithms,
      key_control: keyControl,
      key_reference: keyReference
    }
  };
}

function normalizeProcessors(value, categoryIds, regionsById) {
  const byId = new Map();
  const normalized = requireObjectList(value, "processors").map((processor, index) => {
    exactObject(processor, ["processor_id", "legal_name", "role", "purposes", "data_category_ids", "region_ids", "parent_processor_id", "agreement_ref"], `processor_${index}`);
    const processorId = requireText(processor.processor_id, `processor_${index}_processor_id`);
    if (byId.has(processorId)) fail("processor_duplicate", `duplicate processor_id ${processorId}`);
    const role = requireText(processor.role, `processor_${index}_role`);
    if (!PROCESSOR_ROLES.has(role)) fail("processor_role_invalid", `unsupported processor role ${role}`);
    const normalizedProcessor = {
      processor_id: processorId,
      legal_name: requireText(processor.legal_name, `processor_${index}_legal_name`, SAFE_TEXT),
      role,
      purposes: requireStringList(processor.purposes, `processor_${index}_purposes`, { minimum: 1 }),
      data_category_ids: requireStringList(processor.data_category_ids, `processor_${index}_data_category_ids`, { minimum: 1 }),
      region_ids: requireStringList(processor.region_ids, `processor_${index}_region_ids`, { minimum: 1 }),
      parent_processor_id: requireNullableText(processor.parent_processor_id, `processor_${index}_parent_processor_id`),
      agreement_ref: requireNullableText(processor.agreement_ref, `processor_${index}_agreement_ref`)
    };
    for (const categoryId of normalizedProcessor.data_category_ids) if (!categoryIds.has(categoryId)) fail("processor_data_category_unknown", `${processorId} references unknown category ${categoryId}`);
    for (const regionId of normalizedProcessor.region_ids) if (!regionsById.has(regionId)) fail("processor_region_unknown", `${processorId} references unknown region ${regionId}`);
    if (role === "subprocessor" && normalizedProcessor.parent_processor_id === null) fail("subprocessor_parent_required", `${processorId} requires parent_processor_id`);
    if (role !== "subprocessor" && normalizedProcessor.parent_processor_id !== null) fail("processor_parent_unexpected", `${processorId} must use null parent_processor_id`);
    byId.set(processorId, normalizedProcessor);
    return normalizedProcessor;
  });

  if (![...byId.values()].some((processor) => processor.role === "controller")) fail("processor_controller_missing", "at least one controller is required");
  for (const processor of byId.values()) {
    if (processor.parent_processor_id !== null) {
      if (processor.parent_processor_id === processor.processor_id) fail("processor_parent_self", `${processor.processor_id} cannot be its own parent`);
      if (!byId.has(processor.parent_processor_id)) fail("processor_parent_unknown", `${processor.processor_id} references an unknown parent`);
    }
    const seen = new Set([processor.processor_id]);
    let current = processor;
    while (current.parent_processor_id !== null) {
      if (seen.has(current.parent_processor_id)) fail("processor_parent_cycle", `processor parent cycle contains ${current.parent_processor_id}`);
      seen.add(current.parent_processor_id);
      current = byId.get(current.parent_processor_id);
    }
  }

  const coveredCategories = new Set([...byId.values()].flatMap((processor) => processor.data_category_ids));
  for (const categoryId of categoryIds) if (!coveredCategories.has(categoryId)) fail("processor_data_category_uncovered", `no processor covers category ${categoryId}`);
  const processingRegions = [...regionsById.values()].filter((region) => region.roles.includes("processing") || region.roles.includes("storage"));
  const coveredRegions = new Set([...byId.values()].flatMap((processor) => processor.region_ids));
  for (const region of processingRegions) if (!coveredRegions.has(region.region_id)) fail("processor_region_uncovered", `no processor covers ${region.region_id}`);

  normalized.sort((left, right) => left.processor_id < right.processor_id ? -1 : left.processor_id > right.processor_id ? 1 : 0);
  return normalized;
}

function normalizeDeclarationBody(body) {
  exactObject(body, ["schema_version", "declaration_id", "tenant_id", "workload_id", "revision", "data_origin", "declared_at", "data_categories", "ordered_region_ids", "regions", "boundaries", "encryption", "processors"], "declaration");
  if (body.schema_version !== DATA_PATH_DECLARATION_VERSION) fail("declaration_schema_version_invalid", `schema_version must equal ${DATA_PATH_DECLARATION_VERSION}`);
  const declarationId = requireText(body.declaration_id, "declaration_id");
  const tenantId = requireText(body.tenant_id, "tenant_id");
  const workloadId = requireText(body.workload_id, "workload_id");
  const revision = requireInteger(body.revision, "revision");
  if (!new Set(["declared", "synthetic"]).has(body.data_origin)) fail("data_origin_invalid", "data_origin must be declared or synthetic");
  const declaredAt = requireInstant(body.declared_at, "declared_at");
  const { normalized: dataCategories, ids: categoryIds } = normalizeDataCategories(body.data_categories);
  const { normalized: regions, byId: regionsById } = normalizeRegions(body.regions);
  const orderedRegionIds = requireStringList(body.ordered_region_ids, "ordered_region_ids", { minimum: 2 });
  if (orderedRegionIds.length !== regionsById.size || orderedRegionIds.some((id) => !regionsById.has(id))) {
    fail("ordered_regions_mismatch", "ordered_region_ids must contain every declared region exactly once");
  }
  const boundaries = normalizeBoundaries(body.boundaries, body.ordered_region_ids, regionsById);
  const encryption = normalizeEncryption(body.encryption);
  const processors = normalizeProcessors(body.processors, categoryIds, regionsById);

  return {
    schema_version: DATA_PATH_DECLARATION_VERSION,
    declaration_id: declarationId,
    tenant_id: tenantId,
    workload_id: workloadId,
    revision,
    data_origin: body.data_origin,
    declared_at: declaredAt,
    data_categories: dataCategories,
    ordered_region_ids: body.ordered_region_ids.slice(),
    regions,
    boundaries,
    encryption,
    processors
  };
}

function validatedBody(declaration) {
  exactObject(declaration, ["schema_version", "declaration_id", "tenant_id", "workload_id", "revision", "data_origin", "declared_at", "data_categories", "ordered_region_ids", "regions", "boundaries", "encryption", "processors", "declaration_fingerprint"], "declaration");
  requireText(declaration.declaration_fingerprint, "declaration_fingerprint", HASH);
  const { declaration_fingerprint: claimed, ...body } = declaration;
  const normalized = normalizeDeclarationBody(body);
  if (fingerprint(body) !== fingerprint(normalized)) fail("declaration_noncanonical", "declaration arrays must use canonical ordering");
  if (fingerprint(normalized) !== claimed) fail("declaration_tampered", "declaration fingerprint does not match");
  return normalized;
}

export function createDataPathDeclaration(input) {
  const required = ["declarationId", "tenantId", "workloadId", "revision", "dataOrigin", "dataCategories", "orderedRegionIds", "regions", "boundaries", "encryption", "processors"];
  inputObject(input, required, ["declaredAt"], "input");
  const declaredAt = input.declaredAt ?? new Date();
  if (!(declaredAt instanceof Date) || Number.isNaN(declaredAt.valueOf())) fail("declared_at_invalid", "declaredAt must be a valid Date");
  const normalized = normalizeDeclarationBody({
    schema_version: DATA_PATH_DECLARATION_VERSION,
    declaration_id: input.declarationId,
    tenant_id: input.tenantId,
    workload_id: input.workloadId,
    revision: input.revision,
    data_origin: input.dataOrigin,
    declared_at: declaredAt.toISOString(),
    data_categories: structuredClone(input.dataCategories),
    ordered_region_ids: structuredClone(input.orderedRegionIds),
    regions: structuredClone(input.regions),
    boundaries: structuredClone(input.boundaries),
    encryption: structuredClone(input.encryption),
    processors: structuredClone(input.processors)
  });
  return deepFreeze({ ...normalized, declaration_fingerprint: fingerprint(normalized) });
}

export function validateDataPathDeclaration(declaration) {
  const body = validatedBody(declaration);
  return Object.freeze({
    valid: true,
    context_verified: false,
    declaration_id: body.declaration_id,
    tenant_id: body.tenant_id,
    workload_id: body.workload_id,
    revision: body.revision,
    data_origin: body.data_origin,
    region_count: body.regions.length,
    boundary_count: body.boundaries.length,
    processor_count: body.processors.length,
    cross_jurisdiction_boundary_count: body.boundaries.filter((boundary) => boundary.cross_jurisdiction).length,
    declaration_fingerprint: declaration.declaration_fingerprint
  });
}

export function verifyDataPathDeclaration(declaration, expectedContext) {
  const result = validateDataPathDeclaration(declaration);
  exactObject(expectedContext, ["tenant_id", "workload_id", "revision"], "expected_context");
  const tenantId = requireText(expectedContext.tenant_id, "expected_tenant_id");
  const workloadId = requireText(expectedContext.workload_id, "expected_workload_id");
  const revision = requireInteger(expectedContext.revision, "expected_revision");
  if (result.tenant_id !== tenantId) fail("declaration_tenant_mismatch", "declaration belongs to another tenant");
  if (result.workload_id !== workloadId) fail("declaration_workload_mismatch", "declaration belongs to another workload");
  if (result.revision !== revision) fail("declaration_revision_mismatch", "declaration is not the expected revision");
  return Object.freeze({ ...result, context_verified: true });
}
