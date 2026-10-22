import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const EVIDENCE_QUERY_VERSION = "1.0.0";

export const EVIDENCE_QUERY_OPERATIONS = Object.freeze([
  "list",
  "get",
  "status"
]);

export const EVIDENCE_QUERY_ERROR_CODES = Object.freeze({
  inputInvalid: "invalid_request",
  cursorInvalid: "invalid_cursor",
  versionRequired: "version_required",
  notFound: "not_found",
  rateLimited: "rate_limited",
  temporarilyUnavailable: "temporarily_unavailable",
  responseInvalid: "response_invalid",
  privateField: "private_field_forbidden",
  fieldUnknown: "field_unknown"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const ETAG = /^(?:W\/)?"[A-Za-z0-9._:-]{1,128}"$/;
const PRIVATE_FIELD = /(?:^|_)(?:tenant|created_by|storage_locator|credential|secret|token|password|authorization|recipient|customer|contact|email|endpoint|principal|organization)(?:_|$)/iu;
const SENSITIVE_QUERY_KEY = /(?:^|[_-])(?:access|api|auth|bearer|contact|credential|customer|email|endpoint|key|organization|password|principal|secret|signature|tenant|token)(?:$|[_-])/iu;
const LIFECYCLE_STATES = new Set(["published", "expired", "superseded", "revoked"]);
const DATA_ORIGINS = new Set(["synthetic", "hybrid", "measured"]);
const WORKLOAD_CLASSES = new Set(["network-transfer", "inference", "training", "other"]);
const DIRECTIONS = new Set(["unidirectional", "bidirectional"]);
const MEASUREMENT_VALIDITY = new Set(["sufficient", "partial", "invalid", "unknown"]);
const CONTENT_INTEGRITY = new Set(["passed", "failed", "unverifiable"]);
const INDEPENDENT_REVIEW = new Set(["not-reviewed", "in-progress", "consistent", "deviation", "uncertain"]);
const FRESHNESS = new Set(["valid", "expiring", "expired", "unknown"]);
const POLICY_DECISION = new Set(["accepted", "rejected", "manual-review"]);
const METRIC_ORIGINS = new Set(["measured", "synthetic", "inferred", "declared"]);
const METRIC_QUALITY = new Set(["valid", "partial", "invalid", "unknown"]);
const AGGREGATIONS = new Set(["raw", "count", "mean", "min", "max", "p50", "p95", "p99"]);
const API_ERROR_VALUES = new Set(Object.values(EVIDENCE_QUERY_ERROR_CODES));
const QUERY_FIELDS = Object.freeze([
  "cursor",
  "limit",
  "data_origin",
  "lifecycle_state",
  "measurement_validity",
  "content_integrity",
  "independent_review",
  "freshness",
  "policy_decision",
  "workload_class",
  "protocol",
  "site"
]);

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

function exactObject(value, required, optional, label, invalidCode = EVIDENCE_QUERY_ERROR_CODES.inputInvalid) {
  if (!isObject(value)) fail(invalidCode, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    fail(PRIVATE_FIELD.test(key) ? EVIDENCE_QUERY_ERROR_CODES.privateField : EVIDENCE_QUERY_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(invalidCode, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 500, pattern, code = EVIDENCE_QUERY_ERROR_CODES.inputInvalid } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(code, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(code, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireSemver(value, label) {
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function requireHash(value, label) {
  return requireString(value, label, { max: 71, pattern: HASH });
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireEnum(value, values, label) {
  if (!values.has(value)) fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function normalizeStringList(value, label, { min = 0, max = 64, itemMin = 1, itemMax = 500, pattern } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must contain ${min}-${max} items`);
  }
  const result = value.map((item, index) => requireString(item, `${label}[${index}]`, {
    min: itemMin,
    max: itemMax,
    pattern
  })).sort();
  if (new Set(result).size !== result.length) fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} contains duplicates`);
  return result;
}

function normalizeStatus(value, label = "record.status") {
  const fields = ["measurement_validity", "content_integrity", "independent_review", "freshness", "policy_decision"];
  exactObject(value, fields, [], label);
  return {
    measurement_validity: requireEnum(value.measurement_validity, MEASUREMENT_VALIDITY, `${label}.measurement_validity`),
    content_integrity: requireEnum(value.content_integrity, CONTENT_INTEGRITY, `${label}.content_integrity`),
    independent_review: requireEnum(value.independent_review, INDEPENDENT_REVIEW, `${label}.independent_review`),
    freshness: requireEnum(value.freshness, FRESHNESS, `${label}.freshness`),
    policy_decision: requireEnum(value.policy_decision, POLICY_DECISION, `${label}.policy_decision`)
  };
}

function normalizeBoundary(value, label = "record.boundary") {
  exactObject(value, ["statement", "data_origin", "limitations", "performance_claim_allowed"], [], label);
  const dataOrigin = requireEnum(value.data_origin, DATA_ORIGINS, `${label}.data_origin`);
  if (typeof value.performance_claim_allowed !== "boolean") {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label}.performance_claim_allowed must be boolean`);
  }
  if (dataOrigin !== "measured" && value.performance_claim_allowed) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label}.performance_claim_allowed must be false unless data_origin is measured`);
  }
  return {
    statement: requireString(value.statement, `${label}.statement`, { min: 10, max: 1000 }),
    data_origin: dataOrigin,
    limitations: normalizeStringList(value.limitations, `${label}.limitations`, { min: 1, max: 64, itemMin: 3 }),
    performance_claim_allowed: value.performance_claim_allowed
  };
}

function normalizeScope(value, label = "record.scope") {
  exactObject(value, ["site_labels", "direction", "workload_class", "protocol"], [], label);
  exactObject(value.protocol, ["name", "version"], [], `${label}.protocol`);
  return {
    site_labels: normalizeStringList(value.site_labels, `${label}.site_labels`, {
      min: 2,
      max: 32,
      itemMin: 2,
      itemMax: 64,
      pattern: /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,63}$/
    }),
    direction: requireEnum(value.direction, DIRECTIONS, `${label}.direction`),
    workload_class: requireEnum(value.workload_class, WORKLOAD_CLASSES, `${label}.workload_class`),
    protocol: {
      name: requireString(value.protocol.name, `${label}.protocol.name`, { max: 96 }),
      version: requireString(value.protocol.version, `${label}.protocol.version`, { max: 96 })
    }
  };
}

function normalizeMethod(value, label = "record.method") {
  exactObject(value, ["method_id", "version", "content_fingerprint", "tool"], [], label);
  exactObject(value.tool, ["name", "version"], [], `${label}.tool`);
  return {
    method_id: requireId(value.method_id, `${label}.method_id`),
    version: requireSemver(value.version, `${label}.version`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`),
    tool: {
      name: requireString(value.tool.name, `${label}.tool.name`, { max: 120 }),
      version: requireString(value.tool.version, `${label}.tool.version`, { max: 120 })
    }
  };
}

function normalizeMetrics(value, boundary, label = "record.metrics") {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must contain 1-64 summaries`);
  }
  const metrics = value.map((metric, index) => {
    const itemLabel = `${label}[${index}]`;
    exactObject(metric, ["metric", "aggregation", "unit", "value", "sample_count", "origin", "quality"], [], itemLabel);
    if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${itemLabel}.value must be finite`);
    }
    if (!Number.isInteger(metric.sample_count) || metric.sample_count < 1) {
      fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${itemLabel}.sample_count must be a positive integer`);
    }
    return {
      metric: requireString(metric.metric, `${itemLabel}.metric`, { max: 96 }),
      aggregation: requireEnum(metric.aggregation, AGGREGATIONS, `${itemLabel}.aggregation`),
      unit: requireString(metric.unit, `${itemLabel}.unit`, { max: 48 }),
      value: metric.value,
      sample_count: metric.sample_count,
      origin: requireEnum(metric.origin, METRIC_ORIGINS, `${itemLabel}.origin`),
      quality: requireEnum(metric.quality, METRIC_QUALITY, `${itemLabel}.quality`)
    };
  });
  const identities = metrics.map((metric) => `${metric.metric}\u0000${metric.aggregation}\u0000${metric.unit}`);
  if (new Set(identities).size !== identities.length) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} contains duplicate metric summaries`);
  }
  if (boundary.data_origin === "synthetic" && metrics.some((metric) => metric.origin !== "synthetic")) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must remain synthetic when the record boundary is synthetic`);
  }
  if (boundary.data_origin === "measured" && metrics.some((metric) => metric.origin !== "measured")) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must remain measured when the record boundary is measured`);
  }
  return metrics;
}

function normalizeHttpsUrl(value, label) {
  requireString(value, label, { max: 1000 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${label} must be an HTTPS URL without credentials or a fragment`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) fail(EVIDENCE_QUERY_ERROR_CODES.privateField, `${label} must not carry sensitive query parameters`);
  }
  return parsed.href;
}

function normalizeLinks(value, label = "record.links") {
  exactObject(value, ["self", "status", "manifest"], [], label);
  return {
    self: normalizeHttpsUrl(value.self, `${label}.self`),
    status: normalizeHttpsUrl(value.status, `${label}.status`),
    manifest: value.manifest === null ? null : normalizeHttpsUrl(value.manifest, `${label}.manifest`)
  };
}

export function validateEvidenceQueryRecord(record) {
  const fields = [
    "schema_version",
    "record_type",
    "visibility",
    "evidence_id",
    "version",
    "content_fingerprint",
    "published_at",
    "lifecycle_state",
    "status",
    "boundary",
    "scope",
    "method",
    "metrics",
    "links",
    "certification_issued"
  ];
  exactObject(record, fields, [], "record", EVIDENCE_QUERY_ERROR_CODES.responseInvalid);
  if (record.schema_version !== EVIDENCE_QUERY_VERSION || record.record_type !== "evidence_query_record") {
    fail(EVIDENCE_QUERY_ERROR_CODES.responseInvalid, "record must be an Evidence Query record v1");
  }
  if (record.visibility !== "public") fail(EVIDENCE_QUERY_ERROR_CODES.privateField, "record.visibility must equal public");
  if (record.certification_issued !== false) {
    fail(EVIDENCE_QUERY_ERROR_CODES.responseInvalid, "record.certification_issued must remain false");
  }
  const boundary = normalizeBoundary(record.boundary);
  const normalized = {
    schema_version: EVIDENCE_QUERY_VERSION,
    record_type: "evidence_query_record",
    visibility: "public",
    evidence_id: requireId(record.evidence_id, "record.evidence_id"),
    version: requireSemver(record.version, "record.version"),
    content_fingerprint: requireHash(record.content_fingerprint, "record.content_fingerprint"),
    published_at: canonicalInstant(record.published_at, "record.published_at"),
    lifecycle_state: requireEnum(record.lifecycle_state, LIFECYCLE_STATES, "record.lifecycle_state"),
    status: normalizeStatus(record.status),
    boundary,
    scope: normalizeScope(record.scope),
    method: normalizeMethod(record.method),
    metrics: normalizeMetrics(record.metrics, boundary),
    links: normalizeLinks(record.links),
    certification_issued: false
  };
  if (normalized.lifecycle_state === "expired" && normalized.status.freshness !== "expired") {
    fail(EVIDENCE_QUERY_ERROR_CODES.responseInvalid, "expired records must expose expired freshness");
  }
  return deepFreeze(normalized);
}

function normalizeNullableFilter(value, values, label) {
  if (value === undefined || value === null || value === "") return null;
  return requireEnum(value, values, label);
}

function normalizeTextFilter(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, label, { max: 96 });
}

export function normalizeEvidenceQuery(query = {}) {
  exactObject(query, [], QUERY_FIELDS, "query");
  const cursor = query.cursor ?? null;
  if (cursor !== null && (typeof cursor !== "string" || !CURSOR.test(cursor))) {
    fail(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, "query.cursor is invalid");
  }
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "query.limit must be an integer from 1 to 100");
  }
  return deepFreeze({
    cursor,
    limit,
    data_origin: normalizeNullableFilter(query.data_origin, DATA_ORIGINS, "query.data_origin"),
    lifecycle_state: normalizeNullableFilter(query.lifecycle_state, LIFECYCLE_STATES, "query.lifecycle_state"),
    measurement_validity: normalizeNullableFilter(query.measurement_validity, MEASUREMENT_VALIDITY, "query.measurement_validity"),
    content_integrity: normalizeNullableFilter(query.content_integrity, CONTENT_INTEGRITY, "query.content_integrity"),
    independent_review: normalizeNullableFilter(query.independent_review, INDEPENDENT_REVIEW, "query.independent_review"),
    freshness: normalizeNullableFilter(query.freshness, FRESHNESS, "query.freshness"),
    policy_decision: normalizeNullableFilter(query.policy_decision, POLICY_DECISION, "query.policy_decision"),
    workload_class: normalizeNullableFilter(query.workload_class, WORKLOAD_CLASSES, "query.workload_class"),
    protocol: normalizeTextFilter(query.protocol, "query.protocol"),
    site: normalizeTextFilter(query.site, "query.site")
  });
}

function queryFingerprint(query) {
  const { cursor: _cursor, ...boundQuery } = query;
  return digestEvidenceBytes(canonicalizeEvidenceValue(boundQuery));
}

function encodeCursor(queryFingerprintValue, offset) {
  const payload = {
    version: EVIDENCE_QUERY_VERSION,
    query_fingerprint: queryFingerprintValue,
    offset
  };
  return Buffer.from(canonicalizeEvidenceValue(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor, expectedFingerprint) {
  let text;
  let value;
  try {
    text = Buffer.from(cursor, "base64url").toString("utf8");
    value = JSON.parse(text);
  } catch {
    fail(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, "query.cursor is not a valid Evidence Query cursor");
  }
  exactObject(value, ["version", "query_fingerprint", "offset"], [], "cursor", EVIDENCE_QUERY_ERROR_CODES.cursorInvalid);
  if (canonicalizeEvidenceValue(value) !== text
    || value.version !== EVIDENCE_QUERY_VERSION
    || value.query_fingerprint !== expectedFingerprint
    || !Number.isInteger(value.offset)
    || value.offset < 0) {
    fail(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, "query.cursor does not match the current query");
  }
  return value.offset;
}

function comparePrerelease(a, b) {
  const left = a.split("-")[1]?.split(".") ?? [];
  const right = b.split("-")[1]?.split(".") ?? [];
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 0 : (left.length === 0 ? 1 : -1);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumeric = /^\d+$/u.test(left[index]);
    const rightNumeric = /^\d+$/u.test(right[index]);
    if (leftNumeric && rightNumeric) return Number(left[index]) - Number(right[index]);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function compareSemver(a, b) {
  const left = a.split(/[+-]/u, 1)[0].split(".").map(Number);
  const right = b.split(/[+-]/u, 1)[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return comparePrerelease(a.split("+")[0], b.split("+")[0]);
}

function compareRecords(a, b) {
  if (a.published_at !== b.published_at) return a.published_at > b.published_at ? -1 : 1;
  if (a.evidence_id !== b.evidence_id) return a.evidence_id < b.evidence_id ? -1 : 1;
  return -compareSemver(a.version, b.version);
}

function matchesQuery(record, query) {
  if (query.data_origin && record.boundary.data_origin !== query.data_origin) return false;
  if (query.lifecycle_state && record.lifecycle_state !== query.lifecycle_state) return false;
  if (query.measurement_validity && record.status.measurement_validity !== query.measurement_validity) return false;
  if (query.content_integrity && record.status.content_integrity !== query.content_integrity) return false;
  if (query.independent_review && record.status.independent_review !== query.independent_review) return false;
  if (query.freshness && record.status.freshness !== query.freshness) return false;
  if (query.policy_decision && record.status.policy_decision !== query.policy_decision) return false;
  if (query.workload_class && record.scope.workload_class !== query.workload_class) return false;
  if (query.protocol && record.scope.protocol.name.toLowerCase() !== query.protocol.toLowerCase()) return false;
  if (query.site && !record.scope.site_labels.some((site) => site.toLowerCase() === query.site.toLowerCase())) return false;
  return true;
}

function normalizeCatalog(records) {
  if (!Array.isArray(records) || records.length > 10_000) {
    fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "records must be an array with at most 10000 public projections");
  }
  const normalized = records.map(validateEvidenceQueryRecord);
  const identities = normalized.map((record) => `${record.evidence_id}\u0000${record.version}`);
  if (new Set(identities).size !== identities.length) {
    fail(EVIDENCE_QUERY_ERROR_CODES.responseInvalid, "records contain duplicate evidence versions");
  }
  return normalized;
}

export function queryEvidenceRecords(records, query = {}) {
  const normalizedQuery = normalizeEvidenceQuery(query);
  const fingerprint = queryFingerprint(normalizedQuery);
  const matches = normalizeCatalog(records).filter((record) => matchesQuery(record, normalizedQuery)).sort(compareRecords);
  const offset = normalizedQuery.cursor ? decodeCursor(normalizedQuery.cursor, fingerprint) : 0;
  if (offset > matches.length) fail(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, "query.cursor is outside the result set");
  const items = matches.slice(offset, offset + normalizedQuery.limit);
  const nextOffset = offset + items.length;
  return deepFreeze({
    schema_version: EVIDENCE_QUERY_VERSION,
    response_type: "evidence_query_list",
    query_fingerprint: fingerprint,
    items,
    page: {
      limit: normalizedQuery.limit,
      returned: items.length,
      next_cursor: nextOffset < matches.length ? encodeCursor(fingerprint, nextOffset) : null
    },
    boundary: {
      public_projection_only: true,
      private_data_returned: false,
      certification_issued: false
    }
  });
}

export function getEvidenceQueryRecord(records, reference) {
  exactObject(reference, ["evidence_id"], ["version"], "reference");
  const evidenceId = requireId(reference.evidence_id, "reference.evidence_id");
  if (!Object.hasOwn(reference, "version") || reference.version === null || reference.version === "") {
    fail(EVIDENCE_QUERY_ERROR_CODES.versionRequired, "reference.version is required; latest aliases are not supported");
  }
  const version = requireSemver(reference.version, "reference.version");
  const record = normalizeCatalog(records).find((candidate) => candidate.evidence_id === evidenceId && candidate.version === version);
  if (!record) fail(EVIDENCE_QUERY_ERROR_CODES.notFound, `Evidence version ${evidenceId}@${version} was not found`);
  return record;
}

export function createEvidenceQueryStatus(record, { checkedAt, eventCursor = null } = {}) {
  const normalized = validateEvidenceQueryRecord(record);
  if (eventCursor !== null) requireString(eventCursor, "eventCursor", { max: 2048, pattern: CURSOR });
  return deepFreeze({
    schema_version: EVIDENCE_QUERY_VERSION,
    response_type: "evidence_query_status",
    evidence_id: normalized.evidence_id,
    version: normalized.version,
    content_fingerprint: normalized.content_fingerprint,
    lifecycle_state: normalized.lifecycle_state,
    status: normalized.status,
    boundary: normalized.boundary,
    checked_at: canonicalInstant(checkedAt, "checkedAt"),
    event_cursor: eventCursor,
    cache_freshness_only: true,
    certification_issued: false
  });
}

export function createEvidenceQueryError({ code, message, requestId, retryable = false, field = null }) {
  if (!API_ERROR_VALUES.has(code)) fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "code is not a public Evidence Query error code");
  if (typeof retryable !== "boolean") fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "retryable must be boolean");
  if (field !== null) requireString(field, "field", { max: 160, pattern: /^\/(?:[^~/]|~0|~1)+(?:\/(?:[^~/]|~0|~1)+)*$/ });
  return deepFreeze({
    schema_version: EVIDENCE_QUERY_VERSION,
    response_type: "evidence_query_error",
    error: {
      code,
      message: requireString(message, "message", { min: 3, max: 300 }),
      request_id: requireString(requestId, "requestId", { max: 128, pattern: REQUEST_ID }),
      retryable,
      field
    }
  });
}

export function validateEvidenceQueryError(value) {
  exactObject(value, ["schema_version", "response_type", "error"], [], "response", EVIDENCE_QUERY_ERROR_CODES.responseInvalid);
  if (value.schema_version !== EVIDENCE_QUERY_VERSION || value.response_type !== "evidence_query_error") {
    fail(EVIDENCE_QUERY_ERROR_CODES.responseInvalid, "response must be an Evidence Query error v1");
  }
  exactObject(value.error, ["code", "message", "request_id", "retryable", "field"], [], "response.error", EVIDENCE_QUERY_ERROR_CODES.responseInvalid);
  return createEvidenceQueryError({
    code: value.error.code,
    message: value.error.message,
    requestId: value.error.request_id,
    retryable: value.error.retryable,
    field: value.error.field
  });
}

function normalizeBaseUrl(value) {
  const href = normalizeHttpsUrl(value, "baseUrl");
  const parsed = new URL(href);
  if (parsed.search) fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "baseUrl must not include a query string");
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed;
}

function appendQuery(url, query) {
  for (const key of QUERY_FIELDS) {
    const value = query[key];
    if (value !== null) url.searchParams.set(key, String(value));
  }
}

export function buildEvidenceQueryRequest(options) {
  exactObject(options, ["baseUrl", "operation"], ["query", "evidenceId", "version", "etag"], "options");
  const operation = requireEnum(options.operation, new Set(EVIDENCE_QUERY_OPERATIONS), "options.operation");
  const base = normalizeBaseUrl(options.baseUrl);
  let url;
  if (operation === "list") {
    if (options.evidenceId !== undefined || options.version !== undefined) {
      fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, "list requests do not accept an evidence ID or version");
    }
    url = new URL("evidence-versions", base);
    appendQuery(url, normalizeEvidenceQuery(options.query ?? {}));
  } else {
    if (options.query !== undefined) fail(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, `${operation} requests do not accept query filters`);
    const evidenceId = requireId(options.evidenceId, "options.evidenceId");
    if (options.version === undefined || options.version === null || options.version === "") {
      fail(EVIDENCE_QUERY_ERROR_CODES.versionRequired, "options.version is required; latest aliases are not supported");
    }
    const version = requireSemver(options.version, "options.version");
    const suffix = operation === "status" ? "/status" : "";
    url = new URL(`evidence-versions/${encodeURIComponent(evidenceId)}/versions/${encodeURIComponent(version)}${suffix}`, base);
  }
  const headers = { Accept: "application/json" };
  if (options.etag !== undefined) {
    headers["If-None-Match"] = requireString(options.etag, "options.etag", { max: 133, pattern: ETAG });
  }
  return deepFreeze({ method: "GET", url: url.href, headers, body: null });
}
