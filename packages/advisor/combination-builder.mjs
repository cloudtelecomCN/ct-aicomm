import { createHash } from "node:crypto";

export const COMBINATION_SCHEMA_VERSION = "1.0.0";
export const COMBINATION_BUILDER_VERSION = "1.0.0";
export const COMBINATION_IMPORT_FORMATS = Object.freeze(["json", "csv"]);
export const COMBINATION_SOURCE_MODES = Object.freeze(["manual", "json_import", "csv_import", "rule_generated"]);
export const COMBINATION_TOPOLOGIES = Object.freeze(["single_gpu", "single_node", "multi_node", "cross_region", "hybrid"]);

const IMPORT_FORMATS = new Set(COMBINATION_IMPORT_FORMATS);
const SOURCE_MODES = new Set(COMBINATION_SOURCE_MODES);
const TOPOLOGIES = new Set(COMBINATION_TOPOLOGIES);
const INPUT_KEYS = new Set(["schema_version", "combination_key", "display_name", "resource_refs", "configuration"]);
const RESOURCE_REF_KEYS = new Set(["gpu", "cloud_instance", "region", "network_path", "software_stacks", "pricing_offers"]);
const CONFIGURATION_KEYS = new Set(["precision", "topology", "gpu_count", "instance_count", "replica_count"]);
const IMPORT_KEYS = new Set(["schema_version", "format", "payload"]);
const JSON_BUNDLE_KEYS = new Set(["schema_version", "combinations"]);
const RESOURCE_TYPES = new Set(["gpu", "cloud_instance", "region", "network_path", "software_stack", "pricing_offer"]);
const CSV_COLUMNS = Object.freeze([
  "combination_key",
  "display_name",
  "gpu_resource_ref",
  "cloud_instance_resource_ref",
  "region_resource_ref",
  "network_path_resource_ref",
  "software_stack_resource_refs",
  "pricing_offer_resource_refs",
  "precision",
  "topology",
  "gpu_count",
  "instance_count",
  "replica_count",
]);
const DIMENSION_ORDER = Object.freeze([
  "gpu_vendor",
  "gpu_model",
  "gpu_memory_gib",
  "cloud_provider",
  "instance_type",
  "region_code",
  "jurisdiction",
  "network_latency_ms",
  "network_bandwidth_gbps",
  "network_packet_loss_percent",
  "software_components",
  "precision",
  "topology",
  "gpu_count",
  "instance_count",
  "replica_count",
  "pricing_currencies",
  "pricing_billing_units",
  "pricing_commitments",
]);

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
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function cleanString(value, maxLength, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength) fail("combination_string_invalid", `${label} must contain 1-${maxLength} characters`);
  return normalized;
}

function resourceReference(value, label) {
  const normalized = cleanString(value, 80, label);
  if (!/^advisor_resource_[0-9a-f-]{36}$/.test(normalized)) fail("combination_resource_ref_invalid", `${label} must be an Advisor resource identifier`);
  return normalized;
}

function resourceReferenceList(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail("combination_resource_ref_list_invalid", `${label} must contain 1-20 resource identifiers`);
  return value.map((entry) => resourceReference(entry, label)).sort(compareText);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) fail("combination_integer_invalid", `${label} must be an integer from 1 to 100000`);
  return value;
}

function inputProjection(input) {
  return {
    schema_version: input.schema_version,
    combination_key: input.combination_key,
    display_name: input.display_name,
    resource_refs: input.resource_refs,
    configuration: input.configuration,
  };
}

function signatureProjection(input) {
  return {
    resource_refs: input.resource_refs,
    configuration: input.configuration,
  };
}

function documentProjection(document) {
  const { content_sha256: ignored, ...projection } = document;
  return projection;
}

export function normalizeInfrastructureCombinationInput(value) {
  exactKeys(value, INPUT_KEYS, "combination_input");
  if (value.schema_version !== COMBINATION_SCHEMA_VERSION) fail("combination_schema_unsupported", "unsupported combination schema version");
  const combinationKey = cleanString(value.combination_key, 120, "combination_key");
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(combinationKey)) fail("combination_key_invalid", "combination_key must use lowercase key syntax");
  const displayName = cleanString(value.display_name, 180, "display_name");
  exactKeys(value.resource_refs, RESOURCE_REF_KEYS, "combination_resource_refs");
  exactKeys(value.configuration, CONFIGURATION_KEYS, "combination_configuration");
  const precision = cleanString(value.configuration.precision, 40, "precision").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(precision)) fail("combination_precision_invalid", "precision must use a canonical identifier such as BF16 or FP8");
  if (!TOPOLOGIES.has(value.configuration.topology)) fail("combination_topology_invalid", "topology is not supported");
  return {
    schema_version: COMBINATION_SCHEMA_VERSION,
    combination_key: combinationKey,
    display_name: displayName,
    resource_refs: {
      gpu: resourceReference(value.resource_refs.gpu, "gpu"),
      cloud_instance: resourceReference(value.resource_refs.cloud_instance, "cloud_instance"),
      region: resourceReference(value.resource_refs.region, "region"),
      network_path: resourceReference(value.resource_refs.network_path, "network_path"),
      software_stacks: resourceReferenceList(value.resource_refs.software_stacks, "software_stacks"),
      pricing_offers: resourceReferenceList(value.resource_refs.pricing_offers, "pricing_offers"),
    },
    configuration: {
      precision,
      topology: value.configuration.topology,
      gpu_count: positiveInteger(value.configuration.gpu_count, "gpu_count"),
      instance_count: positiveInteger(value.configuration.instance_count, "instance_count"),
      replica_count: positiveInteger(value.configuration.replica_count, "replica_count"),
    },
  };
}

export function computeCombinationInputSha256(input) {
  return sha256(inputProjection(normalizeInfrastructureCombinationInput(input)));
}

export function computeCombinationSignatureSha256(input) {
  return sha256(signatureProjection(normalizeInfrastructureCombinationInput(input)));
}

export function computeCombinationContentSha256(document) {
  return sha256(documentProjection(document));
}

function parseCsvRows(text) {
  if (typeof text !== "string" || text.length < 1 || text.length > 2_000_000) fail("combination_csv_invalid", "CSV payload must contain 1-2000000 characters");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      if (row.some((entry) => entry.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) fail("combination_csv_invalid", "CSV payload contains an unterminated quoted field");
  row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
  if (row.some((entry) => entry.length > 0)) rows.push(row);
  if (!rows.length) fail("combination_csv_invalid", "CSV payload is empty");
  return rows;
}

function parseDelimitedRefs(value, label) {
  const values = value.split("|").map((entry) => entry.trim()).filter(Boolean);
  return resourceReferenceList(values, label);
}

function parseCsvInteger(value, label, rowNumber) {
  if (!/^[1-9][0-9]*$/.test(value.trim())) fail("combination_csv_integer_invalid", `CSV row ${rowNumber} ${label} must be a positive integer`);
  return positiveInteger(Number(value), label);
}

export function parseInfrastructureCombinationCsv(text) {
  const rows = parseCsvRows(text);
  const header = rows.shift().map((entry) => entry.trim());
  if (header.length !== CSV_COLUMNS.length || header.some((column, index) => column !== CSV_COLUMNS[index])) {
    fail("combination_csv_header_invalid", `CSV header must exactly match: ${CSV_COLUMNS.join(",")}`);
  }
  if (rows.length < 1 || rows.length > 200) fail("combination_batch_size_invalid", "CSV import must contain 1-200 combinations");
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== CSV_COLUMNS.length) fail("combination_csv_row_invalid", `CSV row ${rowNumber} must contain ${CSV_COLUMNS.length} columns`);
    const values = Object.fromEntries(CSV_COLUMNS.map((column, columnIndex) => [column, row[columnIndex].trim()]));
    return normalizeInfrastructureCombinationInput({
      schema_version: COMBINATION_SCHEMA_VERSION,
      combination_key: values.combination_key,
      display_name: values.display_name,
      resource_refs: {
        gpu: values.gpu_resource_ref,
        cloud_instance: values.cloud_instance_resource_ref,
        region: values.region_resource_ref,
        network_path: values.network_path_resource_ref,
        software_stacks: parseDelimitedRefs(values.software_stack_resource_refs, "software_stacks"),
        pricing_offers: parseDelimitedRefs(values.pricing_offer_resource_refs, "pricing_offers"),
      },
      configuration: {
        precision: values.precision,
        topology: values.topology,
        gpu_count: parseCsvInteger(values.gpu_count, "gpu_count", rowNumber),
        instance_count: parseCsvInteger(values.instance_count, "instance_count", rowNumber),
        replica_count: parseCsvInteger(values.replica_count, "replica_count", rowNumber),
      },
    });
  });
}

export function parseInfrastructureCombinationImport(request) {
  exactKeys(request, IMPORT_KEYS, "combination_import");
  if (request.schema_version !== COMBINATION_SCHEMA_VERSION || !IMPORT_FORMATS.has(request.format)) fail("combination_import_format_invalid", "combination import schema or format is unsupported");
  let combinations;
  if (request.format === "csv") {
    combinations = parseInfrastructureCombinationCsv(request.payload);
  } else {
    let payload = request.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        fail("combination_json_invalid", "JSON import payload is invalid");
      }
    }
    if (!Array.isArray(payload)) {
      exactKeys(payload, JSON_BUNDLE_KEYS, "combination_json_bundle");
      if (payload.schema_version !== COMBINATION_SCHEMA_VERSION) fail("combination_schema_unsupported", "unsupported JSON bundle schema version");
      payload = payload.combinations;
    }
    if (!Array.isArray(payload) || payload.length < 1 || payload.length > 200) fail("combination_batch_size_invalid", "JSON import must contain 1-200 combinations");
    combinations = payload.map(normalizeInfrastructureCombinationInput);
  }
  return {
    schema_version: COMBINATION_SCHEMA_VERSION,
    format: request.format,
    combinations,
    import_sha256: sha256({ schema_version: COMBINATION_SCHEMA_VERSION, format: request.format, combinations }),
  };
}

function resourceFact(resource, fieldId) {
  const fact = resource?.facts?.find((entry) => entry.field_id === fieldId);
  return fact?.status === "provided" ? fact.value : null;
}

function resourceIndex(resources) {
  if (!Array.isArray(resources) || resources.length < 1 || resources.length > 10000) fail("combination_catalog_invalid", "resources must contain 1-10000 catalog resources");
  const index = new Map();
  for (const resource of resources) {
    if (!resource || typeof resource !== "object" || !RESOURCE_TYPES.has(resource.resource_type) || !/^advisor_resource_[0-9a-f-]{36}$/.test(resource.resource_id || "") || !/^sha256:[0-9a-f]{64}$/.test(resource.content_sha256 || "")) {
      fail("combination_catalog_resource_invalid", "catalog contains an invalid resource envelope");
    }
    if (index.has(resource.resource_id)) fail("combination_catalog_duplicate_resource", `catalog resource ${resource.resource_id} is duplicated`);
    index.set(resource.resource_id, resource);
  }
  return index;
}

function conflict(code, severity, field, resourceRefs, message) {
  return { code, severity, field, resource_refs: [...new Set(resourceRefs)].sort(compareText), message };
}

function addReferenceConflicts(refs, expectedType, field, index, conflicts, selected) {
  for (const resourceId of refs) {
    const resource = index.get(resourceId);
    if (!resource) {
      conflicts.push(conflict("resource_not_found", "error", field, [resourceId], "Referenced catalog resource was not found."));
      continue;
    }
    if (resource.resource_type !== expectedType) {
      conflicts.push(conflict("resource_type_mismatch", "error", field, [resourceId], `Expected ${expectedType}, received ${resource.resource_type}.`));
      continue;
    }
    selected.push(resource);
  }
}

function addResourceStateConflicts(resource, evaluatedAt, conflicts) {
  if (resource.lifecycle_status !== "active") conflicts.push(conflict("resource_lifecycle_unusable", resource.lifecycle_status === "deprecated" ? "error" : "warning", "lifecycle_status", [resource.resource_id], `Resource lifecycle is ${resource.lifecycle_status}.`));
  const effective = Date.parse(resource.source_snapshot?.effective_from);
  const expires = resource.source_snapshot?.expires_at === null ? null : Date.parse(resource.source_snapshot?.expires_at);
  const evaluation = Date.parse(evaluatedAt);
  if (Number.isFinite(effective) && evaluation < effective) conflicts.push(conflict("resource_not_yet_effective", "error", "source_snapshot.effective_from", [resource.resource_id], "Resource source is not yet effective."));
  if (expires !== null && Number.isFinite(expires) && evaluation >= expires) conflicts.push(conflict("resource_expired", "error", "source_snapshot.expires_at", [resource.resource_id], "Resource source has expired."));
  if (resource.source_snapshot?.authorization?.analysis_use !== "allowed") conflicts.push(conflict("resource_analysis_not_authorized", "error", "source_snapshot.authorization.analysis_use", [resource.resource_id], "Resource source is not authorized for analysis."));
}

function addDuplicateReferenceConflicts(input, conflicts) {
  for (const field of ["software_stacks", "pricing_offers"]) {
    const values = input.resource_refs[field];
    if (new Set(values).size !== values.length) conflicts.push(conflict("duplicate_resource_ref", "error", `resource_refs.${field}`, values, "Resource references must be unique within a combination."));
  }
}

function addCrossResourceConflicts(input, resources, conflicts) {
  const byType = (type) => resources.filter((resource) => resource.resource_type === type);
  const gpu = byType("gpu")[0];
  const cloud = byType("cloud_instance")[0];
  const region = byType("region")[0];
  const network = byType("network_path")[0];
  const software = byType("software_stack");
  const pricing = byType("pricing_offer");
  const cloudGpuRef = resourceFact(cloud, "cloud.gpu_resource_ref");
  if (cloudGpuRef && gpu && cloudGpuRef !== gpu.resource_id) conflicts.push(conflict("cloud_gpu_reference_conflict", "error", "resource_refs.gpu", [cloud.resource_id, gpu.resource_id], "Cloud instance references a different GPU resource."));
  const cloudProvider = resourceFact(cloud, "cloud.provider");
  const regionProvider = resourceFact(region, "region.provider");
  if (cloudProvider && regionProvider && cloudProvider.trim().toLowerCase() !== regionProvider.trim().toLowerCase()) conflicts.push(conflict("provider_region_conflict", "error", "resource_refs.region", [cloud.resource_id, region.resource_id], "Cloud instance and region declare different providers."));
  const supportedPrecisions = resourceFact(gpu, "gpu.supported_precisions");
  if (Array.isArray(supportedPrecisions) && !supportedPrecisions.map((value) => String(value).toUpperCase()).includes(input.configuration.precision)) conflicts.push(conflict("precision_not_supported", "error", "configuration.precision", [gpu.resource_id], "Selected precision is not declared by the GPU resource."));
  const cloudGpuCount = resourceFact(cloud, "cloud.gpu_count");
  if (Number.isSafeInteger(cloudGpuCount) && cloudGpuCount * input.configuration.instance_count < input.configuration.gpu_count) conflicts.push(conflict("gpu_capacity_conflict", "error", "configuration.gpu_count", [cloud.resource_id], "Selected instance count does not provide the requested GPU count."));
  if (network && region) {
    const endpoints = [resourceFact(network, "network.endpoint_a"), resourceFact(network, "network.endpoint_b")].filter(Boolean);
    if (endpoints.length && !endpoints.includes(region.resource_id) && !endpoints.includes(region.canonical_key)) conflicts.push(conflict("network_region_conflict", "error", "resource_refs.network_path", [network.resource_id, region.resource_id], "Network path does not reference the selected region."));
  }
  for (const stack of software) {
    const compatible = resourceFact(stack, "software.compatible_resource_refs");
    if (Array.isArray(compatible) && compatible.length && !compatible.includes(gpu?.resource_id) && !compatible.includes(cloud?.resource_id)) conflicts.push(conflict("software_compatibility_conflict", "error", "resource_refs.software_stacks", [stack.resource_id, gpu?.resource_id, cloud?.resource_id].filter(Boolean), "Software stack does not declare compatibility with the selected GPU or instance."));
  }
  const selectedIds = new Set(resources.map((resource) => resource.resource_id));
  for (const offer of pricing) {
    const target = resourceFact(offer, "pricing.target_resource_ref");
    if (target && !selectedIds.has(target)) conflicts.push(conflict("pricing_target_conflict", "error", "resource_refs.pricing_offers", [offer.resource_id, target], "Pricing offer targets a resource outside the combination."));
  }
  const currencies = [...new Set(pricing.map((offer) => resourceFact(offer, "pricing.currency")).filter(Boolean))];
  if (currencies.length > 1) conflicts.push(conflict("pricing_currency_conflict", "error", "resource_refs.pricing_offers", pricing.map(({ resource_id: id }) => id), "Combination pricing offers use multiple currencies."));
  const priceGroups = new Map();
  for (const offer of pricing) {
    const target = resourceFact(offer, "pricing.target_resource_ref");
    const currency = resourceFact(offer, "pricing.currency");
    const unit = resourceFact(offer, "pricing.billing_unit");
    const amount = resourceFact(offer, "pricing.amount");
    if (!target || !currency || !unit || amount === null) continue;
    const key = `${target}|${currency}|${unit}`;
    const group = priceGroups.get(key) ?? [];
    group.push({ id: offer.resource_id, amount });
    priceGroups.set(key, group);
  }
  for (const group of priceGroups.values()) {
    if (group.length > 1 && new Set(group.map(({ amount }) => amount)).size > 1) conflicts.push(conflict("pricing_source_conflict", "error", "resource_refs.pricing_offers", group.map(({ id }) => id), "Pricing sources disagree for the same resource, currency, and billing unit."));
  }
}

function resolvedResource(resource, evaluatedAt) {
  const effective = Date.parse(resource.source_snapshot?.effective_from);
  const expires = resource.source_snapshot?.expires_at === null ? null : Date.parse(resource.source_snapshot?.expires_at);
  const evaluated = Date.parse(evaluatedAt);
  const freshness = Number.isFinite(effective) && evaluated < effective ? "not_yet_effective" : expires !== null && Number.isFinite(expires) && evaluated >= expires ? "expired" : "current";
  return {
    resource_id: resource.resource_id,
    resource_type: resource.resource_type,
    canonical_key: resource.canonical_key,
    display_name: resource.display_name,
    data_class: resource.data_class,
    lifecycle_status: resource.lifecycle_status,
    freshness,
    source_kind: resource.source_snapshot?.kind ?? "unknown",
    source_snapshot_sha256: resource.source_snapshot?.content_sha256 ?? null,
    resource_sha256: resource.content_sha256,
  };
}

function dimension(value, unit = "none") {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return { status: "unknown", value: null, unit };
  return { status: "provided", value, unit };
}

function comparisonDimensions(input, resources) {
  const one = (type) => resources.find((resource) => resource.resource_type === type);
  const all = (type) => resources.filter((resource) => resource.resource_type === type);
  const gpu = one("gpu");
  const cloud = one("cloud_instance");
  const region = one("region");
  const network = one("network_path");
  const software = all("software_stack");
  const pricing = all("pricing_offer");
  const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))].sort(compareText);
  return {
    gpu_vendor: dimension(resourceFact(gpu, "gpu.vendor")),
    gpu_model: dimension(resourceFact(gpu, "gpu.model")),
    gpu_memory_gib: dimension(resourceFact(gpu, "gpu.memory_capacity"), "gibibytes"),
    cloud_provider: dimension(resourceFact(cloud, "cloud.provider")),
    instance_type: dimension(resourceFact(cloud, "cloud.instance_type")),
    region_code: dimension(resourceFact(region, "region.code")),
    jurisdiction: dimension(resourceFact(region, "region.jurisdiction")),
    network_latency_ms: dimension(resourceFact(network, "network.round_trip_latency"), "milliseconds"),
    network_bandwidth_gbps: dimension(resourceFact(network, "network.bandwidth"), "gigabits_per_second"),
    network_packet_loss_percent: dimension(resourceFact(network, "network.packet_loss"), "percent"),
    software_components: dimension(unique(software.map((resource) => resourceFact(resource, "software.component")))),
    precision: dimension(input.configuration.precision),
    topology: dimension(input.configuration.topology),
    gpu_count: dimension(input.configuration.gpu_count, "gpu_count"),
    instance_count: dimension(input.configuration.instance_count, "count"),
    replica_count: dimension(input.configuration.replica_count, "count"),
    pricing_currencies: dimension(unique(pricing.map((resource) => resourceFact(resource, "pricing.currency")))),
    pricing_billing_units: dimension(unique(pricing.map((resource) => resourceFact(resource, "pricing.billing_unit")))),
    pricing_commitments: dimension(unique(pricing.map((resource) => resourceFact(resource, "pricing.commitment")))),
  };
}

export function buildInfrastructureCombination(inputValue, { combinationId, createdAt, sourceMode = "manual", importRowRef = null, resources, evaluatedAt = createdAt } = {}) {
  const input = normalizeInfrastructureCombinationInput(inputValue);
  if (!/^advisor_combination_[0-9a-f-]{36}$/.test(combinationId || "")) fail("combination_id_invalid", "combinationId must be a server-owned Advisor combination identifier");
  if (!validTimestamp(createdAt) || !validTimestamp(evaluatedAt)) fail("combination_timestamp_invalid", "createdAt and evaluatedAt must be UTC timestamps");
  if (!SOURCE_MODES.has(sourceMode)) fail("combination_source_mode_invalid", "sourceMode is unsupported");
  if (importRowRef !== null && (typeof importRowRef !== "string" || importRowRef.length < 1 || importRowRef.length > 160)) fail("combination_import_row_ref_invalid", "importRowRef must be null or a short string");
  const index = resourceIndex(resources);
  const conflicts = [];
  const selected = [];
  addDuplicateReferenceConflicts(input, conflicts);
  addReferenceConflicts([input.resource_refs.gpu], "gpu", "resource_refs.gpu", index, conflicts, selected);
  addReferenceConflicts([input.resource_refs.cloud_instance], "cloud_instance", "resource_refs.cloud_instance", index, conflicts, selected);
  addReferenceConflicts([input.resource_refs.region], "region", "resource_refs.region", index, conflicts, selected);
  addReferenceConflicts([input.resource_refs.network_path], "network_path", "resource_refs.network_path", index, conflicts, selected);
  addReferenceConflicts(input.resource_refs.software_stacks, "software_stack", "resource_refs.software_stacks", index, conflicts, selected);
  addReferenceConflicts(input.resource_refs.pricing_offers, "pricing_offer", "resource_refs.pricing_offers", index, conflicts, selected);
  const uniqueResources = [...new Map(selected.map((resource) => [resource.resource_id, resource])).values()];
  for (const resource of uniqueResources) addResourceStateConflicts(resource, evaluatedAt, conflicts);
  addCrossResourceConflicts(input, uniqueResources, conflicts);
  conflicts.sort((left, right) => compareText(left.severity, right.severity) || compareText(left.code, right.code) || compareText(left.field, right.field));
  const status = conflicts.some(({ severity }) => severity === "error") ? "blocked" : conflicts.length ? "needs_review" : "comparable";
  const document = {
    schema_version: COMBINATION_SCHEMA_VERSION,
    builder_version: COMBINATION_BUILDER_VERSION,
    combination_id: combinationId,
    combination_key: input.combination_key,
    display_name: input.display_name,
    source_mode: sourceMode,
    import_row_ref: importRowRef,
    resource_refs: input.resource_refs,
    configuration: input.configuration,
    resolved_resources: uniqueResources.map((resource) => resolvedResource(resource, evaluatedAt)).sort((left, right) => compareText(left.resource_type, right.resource_type) || compareText(left.resource_id, right.resource_id)),
    status,
    conflicts,
    comparison_dimensions: comparisonDimensions(input, uniqueResources),
    input_sha256: sha256(inputProjection(input)),
    combination_signature_sha256: sha256(signatureProjection(input)),
    evaluated_at: evaluatedAt,
    created_at: createdAt,
    boundaries: {
      decision_support_only: true,
      execution_authorized: false,
      constraint_evaluation_performed: false,
      ranking_performed: false,
      performance_claim_allowed: false,
    },
    content_sha256: null,
  };
  document.content_sha256 = computeCombinationContentSha256(document);
  return document;
}

export function validateInfrastructureCombinationDocument(document) {
  if (!document || typeof document !== "object" || document.schema_version !== COMBINATION_SCHEMA_VERSION || document.builder_version !== COMBINATION_BUILDER_VERSION) fail("combination_document_version_invalid", "combination document version is unsupported");
  if (!/^advisor_combination_[0-9a-f-]{36}$/.test(document.combination_id || "") || !/^sha256:[0-9a-f]{64}$/.test(document.content_sha256 || "")) fail("combination_document_identity_invalid", "combination document identity or digest is invalid");
  if (document.boundaries?.decision_support_only !== true || document.boundaries?.execution_authorized !== false || document.boundaries?.constraint_evaluation_performed !== false || document.boundaries?.ranking_performed !== false || document.boundaries?.performance_claim_allowed !== false) fail("combination_document_boundary_invalid", "combination document boundaries are invalid");
  const expected = computeCombinationContentSha256(document);
  if (document.content_sha256 !== expected) fail("combination_document_digest_mismatch", "combination document digest does not match its content");
  return { valid: true, digest_verified: true, status: document.status };
}

export function findCombinationDuplicates(documents, existingDocuments = []) {
  if (!Array.isArray(documents) || !Array.isArray(existingDocuments)) fail("combination_duplicate_input_invalid", "documents and existingDocuments must be arrays");
  const seenKeys = new Map(existingDocuments.map((document) => [document.combination_key, document.combination_id]));
  const seenSignatures = new Map(existingDocuments.map((document) => [document.combination_signature_sha256, document.combination_id]));
  const duplicates = [];
  for (const document of documents) {
    const keyMatch = seenKeys.get(document.combination_key);
    if (keyMatch) duplicates.push({ code: "duplicate_combination_key", combination_id: document.combination_id, conflicts_with: keyMatch, combination_key: document.combination_key });
    else seenKeys.set(document.combination_key, document.combination_id);
    const signatureMatch = seenSignatures.get(document.combination_signature_sha256);
    if (signatureMatch) duplicates.push({ code: "duplicate_combination_signature", combination_id: document.combination_id, conflicts_with: signatureMatch, combination_key: document.combination_key });
    else seenSignatures.set(document.combination_signature_sha256, document.combination_id);
  }
  return duplicates.sort((left, right) => compareText(left.code, right.code) || compareText(left.combination_id, right.combination_id));
}

export function buildCombinationComparison(documents, { generatedAt } = {}) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > 500) fail("combination_comparison_size_invalid", "comparison requires 1-500 combination documents");
  if (!validTimestamp(generatedAt)) fail("combination_comparison_timestamp_invalid", "generatedAt must be a UTC timestamp");
  for (const document of documents) validateInfrastructureCombinationDocument(document);
  const duplicates = findCombinationDuplicates(documents);
  const rows = [...documents].sort((left, right) => compareText(left.combination_key, right.combination_key)).map((document) => ({
    combination_id: document.combination_id,
    combination_key: document.combination_key,
    display_name: document.display_name,
    status: document.status,
    dimensions: document.comparison_dimensions,
    combination_signature_sha256: document.combination_signature_sha256,
    content_sha256: document.content_sha256,
  }));
  const blockedIds = rows.filter(({ status }) => status === "blocked").map(({ combination_id: id }) => id);
  const unknownDimensions = [];
  for (const dimensionId of DIMENSION_ORDER) if (rows.some((row) => row.dimensions[dimensionId]?.status !== "provided")) unknownDimensions.push(dimensionId);
  const currencySets = new Set(rows.map((row) => canonicalize(row.dimensions.pricing_currencies?.value ?? null)));
  const reasonCodes = [];
  if (blockedIds.length) reasonCodes.push("blocked_combination_present");
  if (duplicates.length) reasonCodes.push("duplicate_combination_present");
  if (unknownDimensions.length) reasonCodes.push("unknown_dimension_present");
  if (currencySets.size > 1) reasonCodes.push("mixed_currency_comparison");
  if (rows.some(({ status }) => status === "needs_review")) reasonCodes.push("review_required");
  const status = blockedIds.length || duplicates.length ? "blocked" : reasonCodes.length ? "partial" : "comparable";
  const comparison = {
    schema_version: COMBINATION_SCHEMA_VERSION,
    builder_version: COMBINATION_BUILDER_VERSION,
    generated_at: generatedAt,
    dimension_order: [...DIMENSION_ORDER],
    rows,
    comparability: {
      status,
      combination_count: rows.length,
      comparable_combination_count: rows.filter((row) => row.status !== "blocked").length,
      blocked_combination_ids: blockedIds,
      unknown_dimensions: unknownDimensions,
      reason_codes: reasonCodes,
    },
    duplicates,
    boundaries: {
      side_by_side_only: true,
      constraints_applied: false,
      scoring_applied: false,
      ranking_applied: false,
      recommendation_issued: false,
      execution_authorized: false,
    },
    comparison_sha256: null,
  };
  comparison.comparison_sha256 = sha256({ ...comparison, comparison_sha256: null });
  return comparison;
}

export const combinationCsvColumns = Object.freeze([...CSV_COLUMNS]);
export const combinationComparisonDimensions = Object.freeze([...DIMENSION_ORDER]);
