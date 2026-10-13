import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

const encoder = new TextEncoder();

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contentFromChunk(chunk) {
  return chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.text ?? "";
}

async function firstContentDelta(response) {
  if (!response.body) throw new Error("response_body_missing");
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const content = contentFromChunk(JSON.parse(data));
      if (content.length > 0) return content;
    }
  }
  throw new Error("first_token_missing");
}

export async function collectTtft(options) {
  const {
    endpoint,
    model,
    prompt,
    environmentFingerprint,
    apiKey,
    fetchImpl = fetch,
    now = () => performance.now(),
    startedAt = new Date().toISOString(),
    sampleId = `ttft-${Date.now()}`,
    requestId = randomBytes(12).toString("hex"),
    traceId = randomBytes(16).toString("hex")
  } = options;

  if (!endpoint || !model || !prompt || !environmentFingerprint) {
    throw new Error("endpoint, model, prompt, and environmentFingerprint are required");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(environmentFingerprint)) throw new Error("invalid_environment_fingerprint");

  const prepareStarted = now();
  const body = JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: true, temperature: 0, max_tokens: 64 });
  encoder.encode(body);
  const prepareFinished = now();
  const requestStarted = now();

  let response;
  let firstTokenAt;
  let failureCode;
  try {
    response = await fetchImpl(new URL("/v1/chat/completions", endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body
    });
    const headersAt = now();
    if (!response.ok) throw new Error(`http_${response.status}`);
    await firstContentDelta(response);
    firstTokenAt = now();

    const sample = {
      schema_version: "1.0.0",
      sample_id: sampleId,
      request_id: requestId,
      trace_id: traceId,
      data_origin: "measured",
      started_at: startedAt,
      clock: { duration_source: "monotonic", resolution_ns: 1_000 },
      outcome: { success: true, http_status: response.status },
      route: {
        connector: "vllm-openai-baseline",
        protocol: "http",
        source_region: "collector-local",
        target_region: "declared-by-operator",
        inference_instance: new URL(endpoint).host
      },
      segments: {
        client_request_preparation_ms: prepareFinished - prepareStarted,
        time_to_response_headers_ms: headersAt - requestStarted,
        request_ingress_ms: null,
        connector_ms: null,
        routing_decision_ms: null,
        network_ms: null,
        inference_queue_ms: null,
        model_execution_to_first_token_ms: null,
        ttft_ms: firstTokenAt - requestStarted,
        segment_sources: {
          client_request_preparation_ms: "measured",
          time_to_response_headers_ms: "measured",
          request_ingress_ms: "unavailable",
          connector_ms: "unavailable",
          routing_decision_ms: "unavailable",
          network_ms: "unavailable",
          inference_queue_ms: "unavailable",
          model_execution_to_first_token_ms: "unavailable"
        }
      },
      evidence: {
        environment_fingerprint: environmentFingerprint,
        methodology_version: "1.0.0",
        collector_version: "0.1.0",
        measurement_scope: "Client-observed streaming request against the declared endpoint.",
        limitations: ["Server-side queue, network, routing, and model segments unavailable without server instrumentation"]
      }
    };
    sample.evidence.raw_record_sha256 = hashJson(sample);
    return sample;
  } catch (error) {
    failureCode = String(error?.message || "collector_error").toLowerCase().replace(/[^a-z0-9._-]+/g, "_").slice(0, 80);
    const failedAt = now();
    const sample = {
      schema_version: "1.0.0",
      sample_id: sampleId,
      request_id: requestId,
      trace_id: traceId,
      data_origin: "measured",
      started_at: startedAt,
      clock: { duration_source: "monotonic", resolution_ns: 1_000 },
      outcome: { success: false, http_status: response?.status ?? 599, failure_stage: "stream", failure_code: failureCode },
      route: {
        connector: "vllm-openai-baseline",
        protocol: "http",
        source_region: "collector-local",
        target_region: "declared-by-operator",
        inference_instance: new URL(endpoint).host
      },
      segments: {
        client_request_preparation_ms: prepareFinished - prepareStarted,
        time_to_response_headers_ms: response ? failedAt - requestStarted : null,
        request_ingress_ms: null,
        connector_ms: null,
        routing_decision_ms: null,
        network_ms: null,
        inference_queue_ms: null,
        model_execution_to_first_token_ms: null,
        segment_sources: {
          client_request_preparation_ms: "measured",
          time_to_response_headers_ms: response ? "measured" : "unavailable",
          request_ingress_ms: "unavailable",
          connector_ms: "unavailable",
          routing_decision_ms: "unavailable",
          network_ms: "unavailable",
          inference_queue_ms: "unavailable",
          model_execution_to_first_token_ms: "unavailable"
        }
      },
      evidence: {
        environment_fingerprint: environmentFingerprint,
        methodology_version: "1.0.0",
        collector_version: "0.1.0",
        measurement_scope: "Client-observed failed streaming request against the declared endpoint.",
        limitations: ["Server-side queue, network, routing, and model segments unavailable without server instrumentation"]
      }
    };
    sample.evidence.raw_record_sha256 = hashJson(sample);
    return sample;
  }
}
