import assert from "node:assert/strict";
import test from "node:test";
import { RequestCorrelationLedger } from "../packages/vllm-connector/correlation.mjs";
import { collectTtft } from "../packages/ttft-collector/collector.mjs";

const fingerprint = `sha256:${"a".repeat(64)}`;

test("correlates request, instance, first token, and completion", async () => {
  const ledger = new RequestCorrelationLedger();
  const fetchImpl = async () => new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
  const sample = await collectTtft({
    endpoint: "http://vllm-a.test",
    model: "demo",
    prompt: "hello",
    environmentFingerprint: fingerprint,
    requestId: "request-001",
    traceId: "a".repeat(32),
    fetchImpl,
    onEvent: (event) => ledger.append(event)
  });
  const record = ledger.finalize("request-001");
  assert.equal(record.success, true);
  assert.equal(record.trace_id, sample.trace_id);
  assert.equal(record.inference_instance, sample.route.inference_instance);
  assert.ok(record.first_token_monotonic_ms !== null);
  assert.deepEqual(record.events.map(({ type }) => type), ["request_started", "response_headers", "first_token", "completed"]);
});

test("correlates HTTP failure without a first-token event", async () => {
  const ledger = new RequestCorrelationLedger();
  const fetchImpl = async () => new Response("unavailable", { status: 503 });
  await collectTtft({
    endpoint: "http://vllm-b.test",
    model: "demo",
    prompt: "hello",
    environmentFingerprint: fingerprint,
    requestId: "request-002",
    traceId: "b".repeat(32),
    fetchImpl,
    onEvent: (event) => ledger.append(event)
  });
  const record = ledger.finalize("request-002");
  assert.equal(record.success, false);
  assert.equal(record.failure_code, "http_503");
  assert.equal(record.first_token_monotonic_ms, null);
});

test("rejects identity changes and events after terminal state", () => {
  const ledger = new RequestCorrelationLedger();
  ledger.append({ type: "request_started", request_id: "r", trace_id: "a".repeat(32), inference_instance: "vllm-a", monotonic_ms: 1 });
  assert.throws(
    () => ledger.append({ type: "first_token", request_id: "r", trace_id: "b".repeat(32), inference_instance: "vllm-a", monotonic_ms: 2 }),
    (error) => error.code === "correlation_mismatch"
  );
  ledger.append({ type: "failed", request_id: "r", trace_id: "a".repeat(32), inference_instance: "vllm-a", monotonic_ms: 3, failure_code: "timeout" });
  assert.throws(
    () => ledger.append({ type: "completed", request_id: "r", trace_id: "a".repeat(32), inference_instance: "vllm-a", monotonic_ms: 4 }),
    (error) => error.code === "event_after_terminal"
  );
});
