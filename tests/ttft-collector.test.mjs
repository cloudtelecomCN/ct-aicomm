import assert from "node:assert/strict";
import test from "node:test";
import { collectTtft } from "../packages/ttft-collector/collector.mjs";

const fingerprint = `sha256:${"a".repeat(64)}`;

test("collects a measured first-token observation without inventing server segments", async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url.pathname, "/v1/chat/completions");
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  };
  const sample = await collectTtft({ endpoint: "http://vllm.test", model: "demo", prompt: "hello", environmentFingerprint: fingerprint, fetchImpl });
  assert.equal(sample.outcome.success, true, JSON.stringify(sample.outcome));
  assert.equal(sample.data_origin, "measured");
  assert.ok(sample.segments.ttft_ms >= 0);
  assert.equal(sample.segments.inference_queue_ms, null);
  assert.equal(sample.segments.segment_sources.inference_queue_ms, "unavailable");
  assert.match(sample.evidence.raw_record_sha256, /^[a-f0-9]{64}$/);
});

test("retains a failed streaming sample", async () => {
  const fetchImpl = async () => new Response('{"error":"unavailable"}', {
    status: 503,
    headers: { "content-type": "application/json" }
  });
  const sample = await collectTtft({ endpoint: "http://vllm.test", model: "demo", prompt: "hello", environmentFingerprint: fingerprint, fetchImpl });
  assert.equal(sample.outcome.success, false);
  assert.equal(sample.outcome.http_status, 503, JSON.stringify(sample.outcome));
  assert.equal(sample.outcome.failure_code, "http_503");
  assert.ok(!Object.hasOwn(sample.segments, "ttft_ms"));
});
