# CloudWeGo Eino MCP evidence bridge

[中文](README.zh-CN.md)

Status: **bridge contract and field map; no native Eino drop-in package is claimed**.

Eino's public [`eino-ext` MCP component](https://github.com/cloudwego/eino-ext/blob/main/components/tool/mcp/officialmcp/mcp.go) exposes a `ToolCallResultHandlerV2` with stable raw/exposed tool identity and the completed MCP result. The shown handler signature alone does not establish call start time, request arguments, MCP transport/version, a stable call ID, or an authenticated principal. Eino's [callback system](https://github.com/cloudwego/eino/blob/main/callbacks/interface.go) provides start/end/error hooks, but component-specific callback payloads must be inspected and joined by the integration before emitting evidence.

## Required bridge event

The Eino-side wrapper/exporter must emit one JSON object per completed call using the common [Agent-call bridge contract](../agent-call-evidence/README.md):

```json
{
  "source": "cloudwego/eino",
  "target_name": "search_docs",
  "request": { "query": "synthetic example" },
  "response": { "count": 0 },
  "capture": {
    "evidence_id": "evidence-eino-001",
    "call_id": "call-eino-001",
    "protocol_version": "2025-11-25",
    "transport": "stdio",
    "started_at": "2026-11-25T10:00:00.000Z",
    "completed_at": "2026-11-25T10:00:00.025Z",
    "duration_ms": 25,
    "status": "succeeded",
    "data_origin": "synthetic",
    "source_kind": "application_log",
    "runtime": { "name": "eino", "version": "0.0.0-synthetic", "artifact_fingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    "recorder": { "name": "ct-aicomm-eino-bridge", "version": "0.1.0", "artifact_fingerprint": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
  }
}
```

Values above are synthetic fixtures. The adapter hashes request/response values in memory and excludes them from the output. Never put secrets or raw user data in bridge logs. If Eino does not provide an observed field, do not infer it; the mapper must reject a record when a schema-required field is unavailable.

The exported event can be mapped in a Node.js evidence collector:

```js
import { adaptEinoBridgeEvent } from "./index.mjs";

const evidence = adaptEinoBridgeEvent({ bridgeEvent: receivedBridgeEvent });
```

`receivedBridgeEvent` must follow the JSON shape above. This adapter does not install an Eino callback or exporter; the Go-side bridge remains deployment-owned until the upstream lifecycle and supported versions are confirmed.

## Integration boundary

This bridge records evidence about an externally executed call. It does not call Eino, invoke an MCP server, verify identity, approve authorization, or certify performance. A native package should only be published after an Eino-specific implementation is built against a pinned supported release and an upstream or customer integration confirms the hook lifecycle and field semantics.
