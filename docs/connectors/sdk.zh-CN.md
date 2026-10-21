# Connector SDK 契约 v1

Connector SDK 1.0 将厂商特定的发现与指标采集逻辑，和 CT-Orchestrator 的稳定候选模型分离。适配器提供两个回调：`discover(context)` 返回候选实例，`collectMetrics(candidate, context)` 返回一份证据快照。SDK 按 [`connector-sdk-v1.schema.json`](../../specs/connectors/connector-sdk-v1.schema.json) 校验两类输出。

候选实例包含稳定身份、HTTP(S) 服务与指标端点、位置、模型列表、就绪状态、发现时间和来源版本。指标包含排队请求数、运行请求数、KV Cache 使用率、聚合时延、健康状态、采集时间和明确的数据来源。缺失观测必须保留为 `null`，证据不完整时适配器不能把快照标记为 `ready`。

任何第三方 Connector 的测试套件都应调用 `runConnectorContract`。它会执行发现，要求至少一个测试候选实例，为每个候选实例采集快照，并验证统一身份与证据边界。[`synthetic-static-connector.mjs`](../../examples/connectors/synthetic-static-connector.mjs) 是可执行的最小示例；其中只使用文档保留地址和合成数值，因此不能支持性能声明。

契约明确排除凭据、生产拓扑、路由授权和流量执行。携带凭据的 URL 会被拒绝。运营方可在自有回调内部完成认证，但返回记录与日志必须保持无凭据。
