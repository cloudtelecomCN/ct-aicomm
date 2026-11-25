# Dify MCP 工具调用证据桥接

[English](README.md)

状态：**桥接适配器；需要部署侧关联调用事件。**

Dify 工具引擎的追踪事件包含工具名称、输入、输出、错误、耗时和起止时间；MCP 服务端/协议上下文则来自另一处 MCP 提供方配置。当前核对的公开事件模型没有把 CT-AIComm 所需全部字段放在一份稳定、完整定义的事件里，尤其是 MCP 调用 ID 与工具执行事件的关联。因此，本适配器接收部署侧生成的规范化事件，不宣称是 Dify 原生插件。

## 所需映射

调用方提供 Dify `ToolInvoked` 风格事件（`tool_name`、`tool_inputs`，成功时还需 `tool_outputs`）和采集元数据。必须显式设置 `capture.protocol_name` 为 `mcp`。`capture.call_id` 必须是从 Agent 策略执行链关联到的真实 MCP `tool_call_id`；仅有会话 `message_id` 不能唯一标识一次工具调用。MCP 版本与传输方式应取自实际 MCP 客户端/提供方配置，不能猜测。耗时和结果状态必须来自实际观测。共享映射器只在内存中计算载荷指纹，不把原始值写入证据。

```js
import { adaptDifyToolInvoked } from "./index.mjs";

const evidence = adaptDifyToolInvoked({ event, capture, identity });
```

该适配器不会连接 Dify、验证工作区用户、执行工具或证明 Dify 追踪完整。部署导出器前，应对照实际版本检查 [Dify 工具事件发出逻辑](https://github.com/langgenius/dify/blob/main/api/core/tools/tool_engine.py)和 [MCP 提供方实现](https://github.com/langgenius/dify/blob/main/api/core/tools/mcp_tool/provider.py)。

