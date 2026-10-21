# Agent 协议 SDK 1.0

公开 Agent 协议 SDK 将版本化控制 schema 转换为类型化、零依赖的消息构造器，覆盖注册、准备、应用、撤销和回执，同时保持现有两阶段执行边界。

`createPreparePolicyMessage` 绑定策略身份、单调递增版本、SHA-256 内容指纹、过期时间、目标路由与原路由。`createApplyPolicyMessage` 必须使用相同策略身份和指纹，并绑定已接受的准备回执。`createRevokePolicyMessage` 声明封闭的撤销原因和要恢复的历史已应用版本。所有构造器都只生成消息，不发送，也不执行。

`createAgentReceipt` 只允许与操作对应的成功状态，或者包含机器可读失败码的拒绝/失败状态。`verifyAgentReceipt` 检查消息时效、Agent 身份、请求关联、操作、状态和双方消息指纹。这是结构化证据，不是发送方的密码学身份证明。

公开源码包明确排除生产凭据、私钥、信任根、内部控制面路由、传输客户端和网络变更回调。运营方必须在公开 SDK 之外增加双向认证传输、授权、重放保护、审批门禁和执行实现。

- 包：[`../../packages/agent-protocol-sdk/`](../../packages/agent-protocol-sdk/)
- 类型声明：[`../../packages/agent-protocol-sdk/index.d.ts`](../../packages/agent-protocol-sdk/index.d.ts)
- 协议 schema：[`../../specs/agent/control-protocol-v1.schema.json`](../../specs/agent/control-protocol-v1.schema.json)
- 合成示例：[`../../examples/agent/protocol-sdk.mjs`](../../examples/agent/protocol-sdk.mjs)
