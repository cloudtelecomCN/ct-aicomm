# AgentScope 2.0 OTel/MCP 证据适配器

[English](README.md)

状态：**OTel 桥接适配器；需要显式 MCP 元数据桥接。**

AgentScope 2.0 文档提供 OTel `TracingMiddleware` 和 `on_acting` 工具调用钩子，可观测工具名称、调用 ID、输入参数与结果。因此它比已归档的独立 AgentScope Studio 更适合作为接入源。本适配器复用[通用 OTel GenAI/MCP 映射器](../otel-genai/README.zh-CN.md)，不依赖 Studio。

## 使用

```js
import { adaptAgentScopeToolSpan } from "./index.mjs";

const evidence = adaptAgentScopeToolSpan({ span, capture, identity });
```

完成的 Span 必须包含 `gen_ai.tool.name`、`gen_ai.tool.call.id`；若需要计算载荷指纹，还需显式启用 `gen_ai.tool.call.arguments` 和 `gen_ai.tool.call.result`。MCP 版本与传输方式必须通过 `ct_aicomm.mcp.version`、`ct_aicomm.mcp.transport` 桥接属性提供。请求/结果载荷属性可能包含敏感信息，只能在受控采集器中按需启用，不能导出或持久化原文。映射器只在内存中计算指纹，并从输出记录中移除载荷。

AgentScope 支持 OTel 并不保证会输出这些确切属性、MCP 传输元数据或制品指纹。需固定 AgentScope 版本并核实实际 Span 后，才能宣称集成可用。除非来源显式提供身份声明，否则身份保持 `not_observed`；本适配器不验证身份或授权。

参考：[AgentScope Middleware 与追踪文档](https://github.com/agentscope-ai/docs/blob/main/en/versions/2.0.4/building-blocks/middleware.mdx) · [MCP 工具文档](https://github.com/agentscope-ai/agentscope-java/blob/main/docs/v2/en/docs/building-blocks/tool.md)。

