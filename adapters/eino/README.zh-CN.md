# CloudWeGo Eino MCP 证据桥接

[English](README.md)

状态：**桥接合同和字段映射；不宣称这是 Eino 原生即插即用包。**

Eino 公共 [`eino-ext` MCP 组件](https://github.com/cloudwego/eino-ext/blob/main/components/tool/mcp/officialmcp/mcp.go)提供 `ToolCallResultHandlerV2`，可取得稳定的原始/公开工具标识和已完成的 MCP 结果。但仅靠该处理器签名，无法得到调用开始时间、请求参数、MCP 传输/版本、稳定调用 ID 或已认证主体。Eino 的[回调系统](https://github.com/cloudwego/eino/blob/main/callbacks/interface.go)提供开始、结束和错误钩子；集成代码仍需核实组件级回调载荷并进行关联，才能生成证据。

## 所需桥接事件

Eino 侧封装器/导出器须按[共享 Agent 调用桥接合同](../agent-call-evidence/README.zh-CN.md)，为每次完成的调用输出一条 JSON 记录。必需字段包括：目标工具、请求与响应、调用 ID、MCP 版本/传输、开始和结束时间、耗时、结果、数据来源、运行时和记录器的确切版本及制品指纹。

示例值均为合成数据。映射器只在内存中对请求和响应计算指纹，不会复制到输出。不得在桥接日志中记录密钥或原始用户数据。若 Eino 未提供某个已观测字段，不得推断；必需字段缺失时记录必须被拒绝。

## 使用与边界

可用 `adaptEinoBridgeEvent({ bridgeEvent })` 将符合英文文档 JSON 格式的事件映射为证据。该适配器不会安装 Eino 回调、导出器或调用 MCP 服务；Go 侧桥接代码由具体部署负责。只有在针对固定 Eino 版本完成实现，并确认钩子生命周期和字段语义后，才能发布原生集成包。

