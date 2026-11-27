# Dify MCP tool evidence bridge

[中文](README.zh-CN.md)

Status: **bridge adapter; deployment-side correlation is required**.

Dify's tool engine emits tool name, inputs, outputs, error, elapsed time, and start/end times through its trace event path. MCP provider configuration supplies the server/protocol context separately. The current public event model does not make every field required by CT-AIComm available as one stable, documented envelope, particularly an MCP call ID joined to the tool invocation. This adapter therefore consumes a deployment-owned normalized event rather than claiming a native Dify plugin.

## Required mapping

The caller provides a Dify `ToolInvoked`-style event (`tool_name`, `tool_inputs`, and successful `tool_outputs`) plus capture metadata. Set `capture.protocol_name` to `mcp` explicitly. `capture.call_id` must be the actual MCP `tool_call_id` joined from the agent strategy path; a conversation `message_id` alone is not a unique tool-call identifier. MCP version and transport must come from the deployed MCP client/provider configuration, not be guessed. Timing and outcome must be observed. The shared mapper hashes payloads in memory and excludes raw values from evidence.

```js
import { adaptDifyToolInvoked } from "./index.mjs";

const evidence = adaptDifyToolInvoked({ event, capture, identity });
```

This adapter does not connect to Dify, authorize a workspace user, execute a tool, or prove that a Dify trace is complete. Review Dify's [tool engine event emission](https://github.com/langgenius/dify/blob/main/api/core/tools/tool_engine.py) and [MCP provider implementation](https://github.com/langgenius/dify/blob/main/api/core/tools/mcp_tool/provider.py) against the deployed release before enabling an exporter.

