# 腾讯 WeKnora MCP 证据桥接

[English](README.md)

状态：**桥接合同和字段映射；不宣称这是 WeKnora 原生即插即用插件。**

WeKnora 文档说明了 [MCP 客户端/服务端能力](https://github.com/Tencent/WeKnora/blob/main/website-docs/03-features/08-mcp.md)、工作区级凭据和工具、审批控制、审计能力及追踪集成。这使其适合作为试点候选。但目前核对的公开文档没有定义一套稳定导出的 MCP 调用事件，能够提供 CT-AIComm 所需的全部字段。因此接入需要 WeKnora 侧的小型导出器，或由部署方配置 OTLP 桥接。

## 所需桥接事件

导出器须按[共享 Agent 调用桥接合同](../agent-call-evidence/README.zh-CN.md)，为每次完成的 MCP 工具调用输出一条 JSON 事件。至少要有工具目标、请求/响应值或经批准的指纹、调用 ID、MCP 版本和传输方式、起止时间、规范化状态，以及精确的运行时和记录器来源信息。只有来源明确提供的工作区或用户身份才可以映射；否则身份和授权一律保持为 `not_observed`。

不要导出 API Key、Bearer Token、原始凭据或不受限的提示词/结果内容。桥接会在内存中计算指纹，输出证据不会保留原文。若直接复制来源日志中的摘要，除非能独立验证关联的制品，否则它只是来源方声明。

## 使用与边界

英文文档提供了桥接 JSON 外层样例，可用 `adaptWeKnoraBridgeEvent({ bridgeEvent })` 将其映射为证据。该样例是 CT-AIComm 提出的桥接合同，不代表 WeKnora 当前原生输出此 JSON 格式。适配器不会连接 WeKnora，也不会认证用户、判定工作区权限、审批工具调用、执行 MCP 或认证合规。

