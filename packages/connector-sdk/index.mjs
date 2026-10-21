export const CONNECTOR_CONTRACT_VERSION = "1.0.0";

const ORIGINS = new Set(["synthetic", "hybrid", "measured"]);
const HEALTH = new Set(["ready", "degraded", "unavailable"]);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SECRET_QUERY_KEY = /(?:api[-_]?key|authorization|credential|secret|signature|token)/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function nonEmpty(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${name}_invalid`, `${name} must be a non-empty string`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const normalized = nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(normalized))) fail(`${name}_invalid`, `${name} must be an ISO-8601 timestamp`);
  return normalized;
}

function httpUrl(value, name) {
  const normalized = nonEmpty(value, name);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail(`${name}_invalid`, `${name} must be an absolute URL`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) fail(`${name}_protocol_invalid`, `${name} must use http or https`);
  if (parsed.username || parsed.password) fail(`${name}_credentials_forbidden`, `${name} must not contain credentials`);
  for (const key of parsed.searchParams.keys()) {
    if (SECRET_QUERY_KEY.test(key)) fail(`${name}_credentials_forbidden`, `${name} must not contain credential query parameters`);
  }
  if (SECRET_QUERY_KEY.test(parsed.hash)) fail(`${name}_credentials_forbidden`, `${name} must not contain credentials in its fragment`);
  return normalized;
}

function nullableFinite(value, name, { min = 0, max = Infinity, integer = false } = {}) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${name}_invalid`, `${name} must be null or a finite number between ${min} and ${max}`);
  }
  return value;
}

function stringList(value, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(`${name}_invalid`, `${name} must be an array${allowEmpty ? "" : " with at least one item"}`);
  const normalized = value.map((item) => nonEmpty(item, name));
  if (new Set(normalized).size !== normalized.length) fail(`${name}_duplicate`, `${name} must not contain duplicates`);
  return Object.freeze(normalized.sort());
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function normalizeConnectorCandidate(raw, { connectorId } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("candidate_invalid", "candidate must be an object");
  if (raw.schema_version !== undefined && raw.schema_version !== CONNECTOR_CONTRACT_VERSION) {
    fail("candidate_schema_unsupported", `candidate schema must be ${CONNECTOR_CONTRACT_VERSION}`);
  }
  const connector = nonEmpty(connectorId ?? raw.connector, "connector_id");
  if (raw.connector !== undefined && raw.connector !== connector) fail("candidate_connector_mismatch", "candidate connector does not match its adapter");
  if (typeof raw.ready !== "boolean") fail("candidate_ready_invalid", "candidate ready must be a boolean");

  return deepFreeze({
    schema_version: CONNECTOR_CONTRACT_VERSION,
    connector,
    id: nonEmpty(raw.id, "candidate_id"),
    source: nonEmpty(raw.source, "candidate_source"),
    endpoint: httpUrl(raw.endpoint, "candidate_endpoint"),
    metrics_endpoint: httpUrl(raw.metrics_endpoint, "candidate_metrics_endpoint"),
    region: nonEmpty(raw.region, "candidate_region"),
    zone: raw.zone === null || raw.zone === undefined ? null : nonEmpty(raw.zone, "candidate_zone"),
    models: stringList(raw.models, "candidate_models"),
    ready: raw.ready,
    discovered_at: isoTimestamp(raw.discovered_at, "candidate_discovered_at"),
    source_revision: raw.source_revision === null || raw.source_revision === undefined ? null : nonEmpty(raw.source_revision, "candidate_source_revision")
  });
}

export function normalizeConnectorMetrics(raw, { connectorId, instanceId } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("metrics_invalid", "metrics must be an object");
  if (raw.schema_version !== undefined && raw.schema_version !== CONNECTOR_CONTRACT_VERSION) {
    fail("metrics_schema_unsupported", `metrics schema must be ${CONNECTOR_CONTRACT_VERSION}`);
  }
  const connector = nonEmpty(connectorId ?? raw.connector, "connector_id");
  const instance = nonEmpty(instanceId ?? raw.instance, "instance_id");
  if (raw.connector !== undefined && raw.connector !== connector) fail("metrics_connector_mismatch", "metrics connector does not match its adapter");
  if (raw.instance !== undefined && raw.instance !== instance) fail("metrics_instance_mismatch", "metrics instance does not match its candidate");
  if (!ORIGINS.has(raw.data_origin)) fail("metrics_origin_invalid", "data_origin must be synthetic, hybrid, or measured");
  if (!HEALTH.has(raw.health)) fail("metrics_health_invalid", "health must be ready, degraded, or unavailable");

  const missing = stringList(raw.missing_required_metrics ?? [], "missing_required_metrics", { allowEmpty: true });
  const queue = {
    waiting_requests: nullableFinite(raw.queue?.waiting_requests, "waiting_requests", { integer: true }),
    running_requests: nullableFinite(raw.queue?.running_requests, "running_requests", { integer: true })
  };
  const cache = { kv_usage_ratio: nullableFinite(raw.cache?.kv_usage_ratio, "kv_usage_ratio", { max: 1 }) };
  const latency = {
    ttft_mean: nullableFinite(raw.latency_aggregate_seconds?.ttft_mean, "ttft_mean"),
    queue_mean: nullableFinite(raw.latency_aggregate_seconds?.queue_mean, "queue_mean"),
    inference_mean: nullableFinite(raw.latency_aggregate_seconds?.inference_mean, "inference_mean")
  };
  const requiredValues = [...Object.values(queue), cache.kv_usage_ratio];
  if (raw.health === "ready" && (missing.length > 0 || requiredValues.some((value) => value === null))) {
    fail("metrics_ready_evidence_incomplete", "ready metrics require complete queue and cache evidence with no missing metrics");
  }
  if (raw.health !== "ready" && missing.length === 0) fail("metrics_degradation_reason_missing", "degraded or unavailable metrics require a missing metric or failure reason");

  const limitations = stringList(raw.evidence?.limitations ?? [], "metrics_limitations", { allowEmpty: true });
  if (raw.data_origin !== "measured" && limitations.length === 0) {
    fail("metrics_limitations_required", "synthetic and hybrid metrics must declare at least one limitation");
  }
  if (typeof raw.evidence?.aggregate_only !== "boolean" || typeof raw.evidence?.per_request_correlation_allowed !== "boolean") {
    fail("metrics_evidence_flags_invalid", "aggregate and per-request evidence flags must be explicit booleans");
  }

  return deepFreeze({
    schema_version: CONNECTOR_CONTRACT_VERSION,
    connector,
    instance,
    collected_at: isoTimestamp(raw.collected_at, "metrics_collected_at"),
    data_origin: raw.data_origin,
    health: raw.health,
    missing_required_metrics: missing,
    queue,
    cache,
    latency_aggregate_seconds: latency,
    evidence: {
      source: nonEmpty(raw.evidence?.source, "metrics_evidence_source"),
      raw_sample_count: nullableFinite(raw.evidence?.raw_sample_count, "raw_sample_count", { integer: true }),
      aggregate_only: raw.evidence.aggregate_only,
      per_request_correlation_allowed: raw.evidence.per_request_correlation_allowed,
      limitations
    }
  });
}

export function createConnectorAdapter(definition) {
  if (!definition || typeof definition !== "object") fail("adapter_definition_invalid", "adapter definition is required");
  const id = nonEmpty(definition.id, "adapter_id");
  const version = nonEmpty(definition.version, "adapter_version");
  if (!/^[a-z][a-z0-9.-]{1,63}$/.test(id)) fail("adapter_id_invalid", "adapter id must be a lowercase stable identifier");
  if (!SEMVER.test(version)) fail("adapter_version_invalid", "adapter version must use SemVer");
  if (definition.contract_version !== undefined && definition.contract_version !== CONNECTOR_CONTRACT_VERSION) {
    fail("adapter_contract_unsupported", `only Connector contract ${CONNECTOR_CONTRACT_VERSION} is supported`);
  }
  if (typeof definition.discover !== "function" || typeof definition.collectMetrics !== "function") {
    fail("adapter_methods_invalid", "discover and collectMetrics functions are required");
  }

  const adapter = {
    id,
    version,
    contract_version: CONNECTOR_CONTRACT_VERSION,
    async discover(context = {}) {
      const rawCandidates = await definition.discover(context);
      if (!Array.isArray(rawCandidates)) fail("adapter_discovery_invalid", "discover must return an array");
      const candidates = rawCandidates.map((candidate) => normalizeConnectorCandidate(candidate, { connectorId: id }));
      const ids = new Set();
      for (const candidate of candidates) {
        if (ids.has(candidate.id)) fail("adapter_candidate_duplicate", `duplicate candidate id: ${candidate.id}`);
        ids.add(candidate.id);
      }
      return Object.freeze(candidates.sort((left, right) => left.id.localeCompare(right.id)));
    },
    async collectMetrics(candidate, context = {}) {
      const normalizedCandidate = normalizeConnectorCandidate(candidate, { connectorId: id });
      const rawMetrics = await definition.collectMetrics(normalizedCandidate, context);
      return normalizeConnectorMetrics(rawMetrics, { connectorId: id, instanceId: normalizedCandidate.id });
    }
  };
  return Object.freeze(adapter);
}

export async function runConnectorContract(adapter, { discoveryContext = {}, metricsContext = {} } = {}) {
  if (!adapter || adapter.contract_version !== CONNECTOR_CONTRACT_VERSION || typeof adapter.discover !== "function" || typeof adapter.collectMetrics !== "function") {
    fail("adapter_contract_invalid", `adapter must implement Connector contract ${CONNECTOR_CONTRACT_VERSION}`);
  }
  if (!SEMVER.test(adapter.version ?? "")) fail("adapter_version_invalid", "adapter version must use SemVer");
  const candidates = await adapter.discover(discoveryContext);
  if (candidates.length === 0) fail("contract_fixture_empty", "contract verification requires at least one candidate fixture");

  const snapshots = [];
  for (const candidate of candidates) snapshots.push(await adapter.collectMetrics(candidate, metricsContext));
  const origins = [...new Set(snapshots.map(({ data_origin }) => data_origin))].sort();
  return deepFreeze({
    schema_version: CONNECTOR_CONTRACT_VERSION,
    passed: true,
    adapter: { id: adapter.id, version: adapter.version, contract_version: adapter.contract_version },
    checks: [
      "adapter_metadata",
      "candidate_identity_and_urls",
      "candidate_uniqueness",
      "metric_identity",
      "metric_null_and_health_semantics",
      "evidence_origin_and_limitations"
    ],
    candidate_count: candidates.length,
    metric_snapshot_count: snapshots.length,
    data_origins: origins
  });
}
