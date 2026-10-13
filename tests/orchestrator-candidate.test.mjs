import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidate, buildCandidateSet } from "../packages/orchestrator/candidate.mjs";

const now = new Date("2026-10-13T06:00:30Z");
const instance = Object.freeze({
  id: "vllm-a",
  endpoint: "http://vllm-a.test:8000",
  metrics_endpoint: "http://vllm-a.test:8000/metrics",
  region: "east",
  zone: "east-a",
  models: Object.freeze(["model-a"]),
  ready: true
});
const metrics = Object.freeze({
  instance: "vllm-a",
  collected_at: "2026-10-13T06:00:00Z",
  health: "ready",
  missing_required_metrics: Object.freeze([]),
  queue: Object.freeze({ waiting_requests: 2, running_requests: 4 }),
  cache: Object.freeze({ kv_usage_ratio: 0.5 })
});
const network = Object.freeze({
  target_instance: "vllm-a",
  collected_at: "2026-10-13T06:00:00Z",
  rtt_ms: 12,
  packet_loss_ratio: 0.001,
  available_bandwidth_mbps: 900,
  source: "active_probe"
});

test("builds an eligible candidate with all decision evidence", () => {
  const candidate = buildCandidate({ instance, metrics, network, requestedModel: "model-a", sourceRegion: "west", now });
  assert.equal(candidate.eligibility.eligible, true);
  assert.equal(candidate.load.waiting_requests, 2);
  assert.equal(candidate.network.rtt_ms, 12);
  assert.equal(candidate.geography.target_region, "east");
  assert.equal(candidate.evidence.metrics_age_ms, 30_000);
});

test("marks stale and degraded evidence ineligible without fabricating values", () => {
  const candidate = buildCandidate({
    instance,
    metrics: { ...metrics, health: "degraded", queue: { waiting_requests: null, running_requests: 4 }, collected_at: "2026-10-13T05:00:00Z", missing_required_metrics: ["vllm:num_requests_waiting"] },
    network,
    requestedModel: "model-a",
    sourceRegion: "west",
    now
  });
  assert.equal(candidate.eligibility.eligible, false);
  assert.ok(candidate.eligibility.reasons.includes("metrics_degraded"));
  assert.ok(candidate.eligibility.reasons.includes("metrics_stale"));
  assert.ok(candidate.eligibility.reasons.includes("load_evidence_incomplete"));
  assert.equal(candidate.load.waiting_requests, null);
});

test("rejects mismatched evidence and duplicate candidate identities", () => {
  assert.throws(() => buildCandidate({ instance, metrics: { ...metrics, instance: "other" }, network, requestedModel: "model-a", sourceRegion: "west", now }), /does not match/);
  const input = { instance, metrics, network, requestedModel: "model-a", sourceRegion: "west", now };
  assert.throws(() => buildCandidateSet([input, input]), /duplicate candidate/);
});
