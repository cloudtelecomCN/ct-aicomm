import { createHash } from "node:crypto";
import { evaluateVllmCompatibility } from "../packages/vllm-connector/compatibility.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const endpoint = args.get("--endpoint");
const model = args.get("--model");
if (!endpoint || !model) throw new Error("usage: node scripts/probe-vllm-compatibility.mjs --endpoint URL --model MODEL");
const base = endpoint.replace(/\/$/, "");
const headers = { "content-type": "application/json" };
if (process.env.VLLM_API_KEY) headers.authorization = `Bearer ${process.env.VLLM_API_KEY}`;

async function get(path) {
  const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

const versionResponse = await get("/version");
const version = (await versionResponse.json()).version;
const metricsText = await (await get("/metrics")).text();
const modelsResponse = await get("/v1/models");
const models = await modelsResponse.json();
const modelAvailable = Array.isArray(models.data) && models.data.some(({ id }) => id === model);

let streamingEndpointHealthy = false;
let validStreamFraming = false;
let firstNonEmptyDelta = false;
try {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly OK." }], stream: true, max_tokens: 4, temperature: 0 }),
    signal: AbortSignal.timeout(60_000)
  });
  streamingEndpointHealthy = response.ok;
  if (response.ok) {
    const body = await response.text();
    const frames = body.split(/\r?\n/).filter((line) => line.startsWith("data: "));
    validStreamFraming = frames.length > 0 && frames.some((line) => line === "data: [DONE]");
    for (const frame of frames) {
      if (frame === "data: [DONE]") continue;
      try {
        const event = JSON.parse(frame.slice(6));
        if (event.choices?.some(({ delta }) => typeof delta?.content === "string" && delta.content.length > 0)) firstNonEmptyDelta = true;
      } catch {
        validStreamFraming = false;
      }
    }
  }
} catch {
  streamingEndpointHealthy = false;
}

const result = evaluateVllmCompatibility({
  version,
  metricsText,
  interfaces: {
    streaming_endpoint_healthy: streamingEndpointHealthy,
    valid_stream_framing: validStreamFraming,
    first_non_empty_delta: firstNonEmptyDelta,
    models_endpoint_healthy: modelAvailable
  }
});
process.stdout.write(`${JSON.stringify({
  ...result,
  endpoint_sha256: createHash("sha256").update(base).digest("hex"),
  requested_model_available: modelAvailable
}, null, 2)}\n`);
if (result.readiness !== "ready") process.exitCode = 1;
