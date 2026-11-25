# AgentScope 2.0 OTel/MCP evidence adapter

[中文](README.zh-CN.md)

Status: **OTel bridge adapter; requires an explicit MCP metadata bridge**.

AgentScope 2.0 documents `TracingMiddleware` for OTel spans and an `on_acting` middleware hook that can observe tool name, call ID, input arguments, and result. This makes AgentScope a stronger source than the archived standalone AgentScope Studio. The adapter reuses the shared [OTel GenAI/MCP mapper](../otel-genai/README.md); it does not depend on Studio.

## Use

```js
import { adaptAgentScopeToolSpan } from "./index.mjs";

const evidence = adaptAgentScopeToolSpan({ span, capture, identity });
```

The completed span must include the GenAI tool attributes `gen_ai.tool.name`, `gen_ai.tool.call.id`, and (when payload hashing is required) the opt-in `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result`. MCP version and transport must be supplied as `ct_aicomm.mcp.version` and `ct_aicomm.mcp.transport` bridge attributes. Request/result payload attributes are sensitive; enable them only in a controlled collector and do not export or persist raw values. The mapper hashes them in memory and omits the values from the resulting record.

AgentScope OTel support alone does not guarantee these exact span attributes, MCP transport metadata, or artifact fingerprints. Pin the AgentScope version and confirm the emitted span before claiming an integration is working. Identity is `not_observed` unless an explicit source assertion is supplied; no authentication or authorization is performed here.

References: [AgentScope middleware and tracing docs](https://github.com/agentscope-ai/docs/blob/main/en/versions/2.0.4/building-blocks/middleware.mdx) · [MCP tools](https://github.com/agentscope-ai/agentscope-java/blob/main/docs/v2/en/docs/building-blocks/tool.md).

