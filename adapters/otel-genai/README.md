# OTel GenAI + MCP bridge

[中文](README.zh-CN.md)

The mapper uses the OpenTelemetry OTLP span envelope. For MCP metadata and payload fingerprints it requires the explicit `ct_aicomm.*` bridge attributes defined in `index.mjs`; it does not claim those attributes are part of a stable upstream semantic convention. See the [shared evidence contract](../agent-call-evidence/README.md).
