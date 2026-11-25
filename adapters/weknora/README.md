# Tencent WeKnora MCP evidence bridge

[中文](README.zh-CN.md)

Status: **bridge contract and field map; no native WeKnora drop-in package is claimed**.

WeKnora documents [MCP client/server support](https://github.com/Tencent/WeKnora/blob/main/website-docs/03-features/08-mcp.md), workspace-scoped credentials and tools, approval controls, audit capabilities, and tracing integrations. Those capabilities make it a good pilot candidate, but the public documentation reviewed for this adapter does not define a stable exported MCP call event with every CT-AIComm-required field. Therefore this adapter boundary requires a small WeKnora-side exporter or an OTLP bridge configured by the deployment owner.

## Required bridge event

The exporter must emit one JSON object per completed MCP tool call using the common [Agent-call bridge contract](../agent-call-evidence/README.md). Minimum observed data: target tool, request/response values or approved fingerprints, call ID, MCP version and transport, start/end times, normalized status, and exact runtime/recorder provenance. Workspace or user identity must be mapped only when the source explicitly supplies it; otherwise identity and authorization remain `not_observed`.

The bridge event has this outer shape; all values below are illustrative and synthetic:

```json
{
  "source": "tencent/weknora",
  "target_name": "search_knowledge_base",
  "request": { "query": "synthetic example" },
  "response": { "count": 0 },
  "capture": {
    "evidence_id": "evidence-weknora-001",
    "call_id": "call-weknora-001",
    "protocol_version": "2025-11-25",
    "transport": "http",
    "started_at": "2026-11-25T10:00:00.000Z",
    "completed_at": "2026-11-25T10:00:00.040Z",
    "duration_ms": 40,
    "status": "succeeded",
    "data_origin": "synthetic",
    "source_kind": "application_log",
    "runtime": { "name": "weknora", "version": "0.0.0-synthetic", "artifact_fingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    "recorder": { "name": "ct-aicomm-weknora-bridge", "version": "0.1.0", "artifact_fingerprint": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
  }
}
```

Map it in a Node.js evidence collector with `adaptWeKnoraBridgeEvent({ bridgeEvent })` from `index.mjs`. The example is a proposed CT-AIComm bridge contract; it is not a claim that WeKnora currently emits this JSON format.

Do not export API keys, bearer tokens, raw credentials, or unrestricted prompt/result content. The bridge fingerprints payloads in memory and never retains them in the resulting evidence. A digest copied from a source log is only a source assertion unless the corresponding artifact can be independently verified.

## Integration boundary

This is not a WeKnora plugin and does not connect to a WeKnora instance. It does not authenticate users, decide workspace permissions, approve tool calls, execute MCP, or certify compliance. A native integration should wait for a versioned upstream event/export contract or a tested deployment-specific exporter sample.
