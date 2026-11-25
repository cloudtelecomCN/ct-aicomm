# Agent-call evidence bridge contract

[中文](README.zh-CN.md)

This small public mapping library turns a captured external tool/Agent call into the CT-AIComm Agent-call Evidence 1.0.0 schema. It is a serialization and fingerprinting boundary; it is not a scheduler, verifier of identity, policy engine, or runtime executor.

## Required observed fields

- target and request payload (transiently hashed; never copied into the output);
- stable call ID, protocol version, transport, start/end timestamps, duration, and outcome;
- explicit `synthetic` or `measured` origin;
- source, runtime, and recorder identity/version/artifact fingerprints;
- identity and authorization claims only when explicitly supplied by the source.

Missing required data causes an error. In particular, a payload-free OTel span cannot produce request/response fingerprints unless the instrumentation provides a digest contract that can be independently bound to the payload. Do not hash an unrelated span or whole attribute map and label it as a request fingerprint.

## OTel GenAI + MCP bridge

`../otel-genai/index.mjs` accepts one completed span in OTLP JSON form. It reads standard `gen_ai.tool.name` and optional `gen_ai.tool.call.id`, plus the explicit `ct_aicomm.*` attributes listed in `OTEL_AGENT_CALL_BRIDGE_ATTRIBUTES`. The custom attributes are a CT-AIComm bridge contract; they are **not asserted to be emitted natively** by OpenTelemetry, Eino, WeKnora, or any other framework.

The current mapping requires arguments and successful results to be present transiently so it can calculate payload fingerprints. It rejects unset span status and missing MCP protocol/transport. Tool errors are reduced to a normalized error code; the raw error text is never copied.

## Example

```js
import { adaptAgentCallEvidence, verifyAgentCallEvidenceFingerprint } from "./index.mjs";

const record = adaptAgentCallEvidence({
  event: { target_name: "lookup", request: { query: "synthetic" }, response: { count: 0 } },
  capture: {
    evidence_id: "evidence-example-001", call_id: "call-example-001",
    protocol_version: "2025-11-25", transport: "stdio",
    started_at: "2026-11-25T10:00:00.000Z", completed_at: "2026-11-25T10:00:00.025Z",
    duration_ms: 25, status: "succeeded", data_origin: "synthetic", source_kind: "application_log",
    runtime: { name: "example-runtime", version: "0.0.0-synthetic", artifact_fingerprint: `sha256:${"a".repeat(64)}` },
    recorder: { name: "example-recorder", version: "0.1.0", artifact_fingerprint: `sha256:${"b".repeat(64)}` }
  }
});
if (!verifyAgentCallEvidenceFingerprint(record)) throw new Error("fingerprint mismatch");
```

All sample values are synthetic. A valid fingerprint proves only that the serialized record has not changed since it was fingerprinted; it does not prove that source data is truthful, a call was authorized, or an outcome was optimal.
