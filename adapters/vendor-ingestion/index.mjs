import { createHash } from "node:crypto";
import { getVendorIngestionProfile, VENDOR_INGESTION_PROFILES } from "./profiles.mjs";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const METRIC = /^[a-z][a-z0-9_.]{1,127}$/u;
const ORIGINS = new Set(["measured", "declared", "synthetic", "hybrid"]);
const AGGREGATIONS = new Set(["raw", "count", "mean", "min", "max", "p50", "p95", "p99", "last"]);
const SNAPSHOT_PROTOCOLS = new Set(["gnmi-json-ietf", "prometheus", "otlp-json", "cloud-resource-normalized-json", "vendor-normalized-json"]);
const RESOURCE_KINDS = new Set(["gpu_instance", "accelerator", "network_device", "cluster_node", "site", "service", "other"]);
const AVAILABILITY = new Set(["reported_available", "reported_unavailable", "unknown"]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("evidence must use plain JSON objects");
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError("evidence must not contain undefined values");
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("numeric values must be finite");
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function requiredString(value, name, pattern = null) {
  if (typeof value !== "string" || !value.trim() || (pattern && !pattern.test(value))) throw new TypeError(`${name} is invalid`);
  return value.trim();
}

function timestamp(value, name) {
  const result = requiredString(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(result) || Number.isNaN(Date.parse(result))) {
    throw new TypeError(`${name} must be an ISO-8601 timestamp with timezone`);
  }
  return result;
}

function finiteValue(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Normalize a customer-owned read-only export into a vendor-neutral snapshot.
 * This mapper does not call vendor APIs, infer missing values, or verify source truth.
 * Raw vendor payloads and credentials are never copied into the returned object.
 */
export function adaptVendorSnapshot({ profile_id, source, observed_at, data_origin, limitations = [], records = [], resources = [] } = {}) {
  const profile = getVendorIngestionProfile(profile_id);
  if (profile.read_only !== true) throw new TypeError("vendor ingestion profile must be read-only");
  if (profile.kind !== "infrastructure") throw new TypeError(`profile ${profile.id} is an Agent/MCP runtime; use its dedicated Agent-call adapter`);
  if (!source || typeof source !== "object") throw new TypeError("source metadata is required");
  const protocol = requiredString(source.protocol, "source.protocol");
  if (!SNAPSHOT_PROTOCOLS.has(protocol)) throw new TypeError(`${protocol} is not an infrastructure snapshot protocol`);
  if (!profile.accepted_inputs.includes(protocol)) throw new TypeError(`${protocol} is not an accepted input contract for ${profile.id}`);
  const sourceName = requiredString(source.name, "source.name", ID);
  const sourceVersion = requiredString(source.version, "source.version");
  const sourceRef = requiredString(source.source_ref, "source.source_ref", ID);
  const sourceFingerprint = requiredString(source.export_fingerprint, "source.export_fingerprint", SHA256);
  if (!ORIGINS.has(data_origin)) throw new TypeError("data_origin must be measured, synthetic, or hybrid");
  if (!Array.isArray(records) || records.length > 100_000) throw new TypeError("records must contain at most 100000 observations");
  if (!Array.isArray(resources) || resources.length > 50_000) throw new TypeError("resources must contain at most 50000 inventory records");
  if (records.length === 0 && resources.length === 0) throw new TypeError("at least one observation or resource record is required");
  if (!Array.isArray(limitations) || limitations.some((item) => typeof item !== "string" || item.trim().length < 3) || limitations.length > 64) {
    throw new TypeError("limitations must be an array of up to 64 descriptive strings");
  }
  if (data_origin !== "measured" && limitations.length === 0) throw new TypeError("synthetic or hybrid data requires explicit limitations");

  const seen = new Set();
  const observations = records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError(`records[${index}] must be an object`);
    const resource_ref = requiredString(record.resource_ref, `records[${index}].resource_ref`, ID);
    const metric = requiredString(record.metric, `records[${index}].metric`, METRIC);
    const unit = requiredString(record.unit, `records[${index}].unit`);
    const recorded_at = timestamp(record.recorded_at, `records[${index}].recorded_at`);
    const aggregation = requiredString(record.aggregation, `records[${index}].aggregation`);
    if (!AGGREGATIONS.has(aggregation)) throw new TypeError(`records[${index}].aggregation is unsupported`);
    if (!Number.isSafeInteger(record.sample_count) || record.sample_count < 1) throw new TypeError(`records[${index}].sample_count must be a positive integer`);
    const key = `${resource_ref}\u0000${metric}\u0000${recorded_at}\u0000${aggregation}`;
    if (seen.has(key)) throw new TypeError(`duplicate observation at records[${index}]`);
    seen.add(key);
    const value = typeof record.value === "number" ? finiteValue(record.value, `records[${index}].value`) : record.value;
    if (typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number") throw new TypeError(`records[${index}].value must be a scalar`);
    if (typeof value === "string" && (value.length === 0 || value.length > 256)) throw new TypeError(`records[${index}].value string length is invalid`);
    return { resource_ref, metric, value, unit, recorded_at, aggregation, sample_count: record.sample_count };
  });
  const resourceIds = new Set();
  const inventory = resources.map((resource, index) => {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) throw new TypeError(`resources[${index}] must be an object`);
    const resource_ref = requiredString(resource.resource_ref, `resources[${index}].resource_ref`, ID);
    if (resourceIds.has(resource_ref)) throw new TypeError(`duplicate resource_ref at resources[${index}]`);
    resourceIds.add(resource_ref);
    const resource_kind = requiredString(resource.resource_kind, `resources[${index}].resource_kind`);
    if (!RESOURCE_KINDS.has(resource_kind)) throw new TypeError(`resources[${index}].resource_kind is unsupported`);
    const provider_sku = resource.provider_sku == null ? null : requiredString(resource.provider_sku, `resources[${index}].provider_sku`);
    const region = resource.region == null ? null : requiredString(resource.region, `resources[${index}].region`);
    const zone = resource.zone == null ? null : requiredString(resource.zone, `resources[${index}].zone`);
    const availability = resource.availability ?? "unknown";
    if (!AVAILABILITY.has(availability)) throw new TypeError(`resources[${index}].availability must be an explicitly reported state or unknown`);
    let accelerator = null;
    if (resource.accelerator != null) {
      const item = resource.accelerator;
      if (!item || typeof item !== "object") throw new TypeError(`resources[${index}].accelerator must be an object`);
      accelerator = {
        vendor: requiredString(item.vendor, `resources[${index}].accelerator.vendor`),
        model: requiredString(item.model, `resources[${index}].accelerator.model`),
        count: item.count == null ? null : finiteValue(item.count, `resources[${index}].accelerator.count`),
        memory_bytes: item.memory_bytes == null ? null : finiteValue(item.memory_bytes, `resources[${index}].accelerator.memory_bytes`),
      };
      if ((accelerator.count !== null && (!Number.isSafeInteger(accelerator.count) || accelerator.count < 1)) || (accelerator.memory_bytes !== null && accelerator.memory_bytes < 0)) {
        throw new TypeError(`resources[${index}].accelerator capacity is invalid`);
      }
    }
    let price = null;
    if (resource.price != null) {
      const item = resource.price;
      if (!item || typeof item !== "object") throw new TypeError(`resources[${index}].price must be an object`);
      const priceOrigin = requiredString(item.origin, `resources[${index}].price.origin`);
      if (!new Set(["declared", "synthetic"]).has(priceOrigin)) throw new TypeError(`resources[${index}].price.origin must be declared or synthetic`);
      price = {
        amount: finiteValue(item.amount, `resources[${index}].price.amount`),
        currency: requiredString(item.currency, `resources[${index}].price.currency`, /^[A-Z]{3}$/u),
        billing_unit: requiredString(item.billing_unit, `resources[${index}].price.billing_unit`),
        observed_at: timestamp(item.observed_at, `resources[${index}].price.observed_at`),
        origin: priceOrigin,
      };
      if (price.amount < 0) throw new TypeError(`resources[${index}].price.amount must not be negative`);
    }
    return { resource_ref, resource_kind, provider_sku, region, zone, availability, accelerator, price };
  });

  const snapshot = {
    schema_version: "1.0.0",
    object_type: "vendor_observation_batch",
    profile_id: profile.id,
    profile_readiness: profile.readiness,
    track: profile.track,
    captured_at: timestamp(observed_at, "observed_at"),
    data_origin,
    source: { protocol, name: sourceName, version: sourceVersion, source_ref: sourceRef, export_fingerprint: sourceFingerprint },
    resources: inventory,
    observations,
    limitations: [...limitations],
    boundary: { read_only: true, source_truth_verified: false, raw_payload_retained: false, credentials_retained: false, execution_performed: false },
  };
  snapshot.content_fingerprint = fingerprint(snapshot);
  return deepFreeze(snapshot);
}

function parsePrometheusLabels(text) {
  const labels = {};
  let index = 0;
  while (index < text.length) {
    const match = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)="/u.exec(text.slice(index));
    if (!match) throw new TypeError("invalid Prometheus label set");
    const key = match[1];
    index += match[0].length;
    let value = "";
    let closed = false;
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') { closed = true; break; }
      if (char === "\\") {
        if (index >= text.length) throw new TypeError("unterminated Prometheus label escape");
        const escaped = text[index++];
        if (escaped === "n") value += "\n";
        else if (escaped === '"' || escaped === "\\") value += escaped;
        else throw new TypeError("unsupported Prometheus label escape");
      } else value += char;
    }
    if (!closed || Object.hasOwn(labels, key)) throw new TypeError("invalid or duplicate Prometheus label");
    labels[key] = value;
    if (index === text.length) break;
    if (text[index] !== ",") throw new TypeError("invalid Prometheus label separator");
    index += 1;
  }
  return labels;
}

/**
 * Convert explicitly selected samples from Prometheus text exposition into the
 * shared observation batch. Unmapped series are reported by name and omitted.
 * This parses supplied text only; it does not scrape a Prometheus endpoint.
 */
export function adaptPrometheusText({ profile_id, source, observed_at, data_origin, limitations = [], text, mappings } = {}) {
  if (typeof text !== "string") throw new TypeError("Prometheus exposition text is required");
  if (!Array.isArray(mappings) || mappings.length === 0) throw new TypeError("explicit metric mappings are required");
  const mappingIndex = new Map();
  for (const [index, mapping] of mappings.entries()) {
    const source_metric = requiredString(mapping?.source_metric, `mappings[${index}].source_metric`, /^[a-zA-Z_:][a-zA-Z0-9_:]*$/u);
    if (mappingIndex.has(source_metric)) throw new TypeError(`duplicate mapping for ${source_metric}`);
    const metric = requiredString(mapping.metric, `mappings[${index}].metric`, METRIC);
    const unit = requiredString(mapping.unit, `mappings[${index}].unit`);
    const resource_label = mapping.resource_label === undefined ? null : requiredString(mapping.resource_label, `mappings[${index}].resource_label`, /^[a-zA-Z_][a-zA-Z0-9_]*$/u);
    const resource_ref = mapping.resource_ref === undefined ? null : requiredString(mapping.resource_ref, `mappings[${index}].resource_ref`, ID);
    if (resource_label === null && resource_ref === null) throw new TypeError(`mappings[${index}] requires resource_label or resource_ref`);
    const aggregation = mapping.aggregation ?? "last";
    if (!AGGREGATIONS.has(aggregation)) throw new TypeError(`mappings[${index}].aggregation is unsupported`);
    mappingIndex.set(source_metric, { metric, unit, resource_label, resource_ref, aggregation });
  }

  const records = [];
  const unmapped = new Set();
  for (const [lineIndex, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sampleMatch = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)(?:\s+([0-9]+))?$/u.exec(line);
    if (!sampleMatch) throw new TypeError(`invalid Prometheus sample at line ${lineIndex + 1}`);
    const [, sourceMetric, rawLabels = "", rawValue, rawTimestamp] = sampleMatch;
    const mapping = mappingIndex.get(sourceMetric);
    if (!mapping) { unmapped.add(sourceMetric); continue; }
    const labels = rawLabels ? parsePrometheusLabels(rawLabels) : {};
    const resourceRef = mapping.resource_ref ?? labels[mapping.resource_label];
    if (typeof resourceRef !== "string" || !ID.test(resourceRef)) throw new TypeError(`Prometheus sample ${sourceMetric} is missing a valid resource label`);
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new TypeError(`Prometheus sample ${sourceMetric} must be finite`);
    const parsedTimestamp = rawTimestamp === undefined ? null : Number(rawTimestamp);
    if (parsedTimestamp !== null && (!Number.isFinite(parsedTimestamp) || !Number.isSafeInteger(parsedTimestamp))) throw new TypeError(`Prometheus sample ${sourceMetric} has an invalid timestamp`);
    const recordedAt = parsedTimestamp === null ? observed_at : new Date(parsedTimestamp).toISOString();
    records.push({ resource_ref: resourceRef, metric: mapping.metric, value, unit: mapping.unit, recorded_at: recordedAt, aggregation: mapping.aggregation, sample_count: 1 });
  }
  if (records.length === 0) throw new TypeError("no Prometheus samples matched the explicit mappings");
  const batch = adaptVendorSnapshot({ profile_id, source: { ...source, protocol: "prometheus" }, observed_at, data_origin, limitations, records });
  const { content_fingerprint: _oldFingerprint, ...content } = batch;
  const enriched = { ...content, unmapped_series: [...unmapped].sort() };
  enriched.content_fingerprint = fingerprint(enriched);
  return deepFreeze(enriched);
}

export function verifyVendorSnapshotFingerprint(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.content_fingerprint !== "string" || !SHA256.test(snapshot.content_fingerprint)) return false;
  const { content_fingerprint, ...content } = snapshot;
  return fingerprint(content) === content_fingerprint;
}

export { VENDOR_INGESTION_PROFILES };

