import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONNECTOR_CONTRACT_VERSION,
  createConnectorAdapter,
  normalizeConnectorCandidate,
  normalizeConnectorMetrics,
  runConnectorContract
} from "../packages/connector-sdk/index.mjs";
import { createSyntheticStaticConnector } from "../examples/connectors/synthetic-static-connector.mjs";

function candidate(overrides = {}) {
  return {
    id: "example-a",
    source: "test-fixture",
    endpoint: "https://example.test/v1",
    metrics_endpoint: "https://example.test/metrics",
    region: "test-east",
    zone: "test-east-a",
    models: ["example/model"],
    ready: true,
    discovered_at: "2026-10-21T08:00:00.000Z",
    source_revision: "fixture-v1",
    ...overrides
  };
}

function metrics(overrides = {}) {
  return {
    collected_at: "2026-10-21T08:00:05.000Z",
    data_origin: "synthetic",
    health: "ready",
    missing_required_metrics: [],
    queue: { waiting_requests: 1, running_requests: 2 },
    cache: { kv_usage_ratio: 0.25 },
    latency_aggregate_seconds: { ttft_mean: 0.1, queue_mean: 0.01, inference_mean: 0.08 },
    evidence: {
      source: "test-fixture",
      raw_sample_count: 3,
      aggregate_only: true,
      per_request_correlation_allowed: false,
      limitations: ["Synthetic contract data only."]
    },
    ...overrides
  };
}

test("the public synthetic connector passes the reusable contract suite", async () => {
  const report = await runConnectorContract(createSyntheticStaticConnector());
  assert.equal(report.schema_version, CONNECTOR_CONTRACT_VERSION);
  assert.equal(report.passed, true);
  assert.equal(report.adapter.id, "synthetic-static");
  assert.equal(report.candidate_count, 1);
  assert.equal(report.metric_snapshot_count, 1);
  assert.deepEqual(report.data_origins, ["synthetic"]);
  assert.ok(Object.isFrozen(report));
});

test("normalizes deterministic candidates and rejects credentials", () => {
  const normalized = normalizeConnectorCandidate(candidate({ models: ["z/model", "a/model"] }), { connectorId: "example" });
  assert.deepEqual(normalized.models, ["a/model", "z/model"]);
  assert.equal(normalized.connector, "example");
  assert.throws(
    () => normalizeConnectorCandidate(candidate({ endpoint: "https://user:secret@example.test/v1" }), { connectorId: "example" }),
    { code: "candidate_endpoint_credentials_forbidden" }
  );
  assert.throws(
    () => normalizeConnectorCandidate(candidate({ metrics_endpoint: "https://example.test/metrics?api_key=secret" }), { connectorId: "example" }),
    { code: "candidate_metrics_endpoint_credentials_forbidden" }
  );
});

test("preserves missing metrics as null and requires an explicit degraded reason", () => {
  const normalized = normalizeConnectorMetrics(metrics({
    health: "degraded",
    missing_required_metrics: ["waiting_requests"],
    queue: { waiting_requests: null, running_requests: 2 }
  }), { connectorId: "example", instanceId: "example-a" });
  assert.equal(normalized.queue.waiting_requests, null);
  assert.equal(normalized.health, "degraded");
  assert.throws(
    () => normalizeConnectorMetrics(metrics({ queue: { waiting_requests: null, running_requests: 2 } }), { connectorId: "example", instanceId: "example-a" }),
    { code: "metrics_ready_evidence_incomplete" }
  );
  assert.throws(
    () => normalizeConnectorMetrics(metrics({ health: "unavailable", missing_required_metrics: [] }), { connectorId: "example", instanceId: "example-a" }),
    { code: "metrics_degradation_reason_missing" }
  );
});

test("requires limitations for non-measured evidence and rejects identity changes", () => {
  assert.throws(
    () => normalizeConnectorMetrics(metrics({ evidence: { ...metrics().evidence, limitations: [] } }), { connectorId: "example", instanceId: "example-a" }),
    { code: "metrics_limitations_required" }
  );
  assert.throws(
    () => normalizeConnectorMetrics({ ...metrics(), instance: "other" }, { connectorId: "example", instanceId: "example-a" }),
    { code: "metrics_instance_mismatch" }
  );
  assert.throws(
    () => normalizeConnectorMetrics({ ...metrics(), schema_version: "2.0.0" }, { connectorId: "example", instanceId: "example-a" }),
    { code: "metrics_schema_unsupported" }
  );
});

test("rejects duplicate candidate identities before metrics collection", async () => {
  const adapter = createConnectorAdapter({
    id: "duplicate-example",
    version: "1.0.0",
    async discover() { return [candidate(), candidate()]; },
    async collectMetrics() { return metrics(); }
  });
  await assert.rejects(() => runConnectorContract(adapter), { code: "adapter_candidate_duplicate" });
});

test("machine-readable schema keeps records closed and evidence origin explicit", async () => {
  const schema = JSON.parse(await readFile(new URL("../specs/connectors/connector-sdk-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$defs.candidate.additionalProperties, false);
  assert.equal(schema.$defs.metrics.additionalProperties, false);
  assert.deepEqual(schema.$defs.metrics.properties.data_origin.enum, ["synthetic", "hybrid", "measured"]);
  assert.equal(schema.$defs.metrics.properties.evidence.additionalProperties, false);
});
