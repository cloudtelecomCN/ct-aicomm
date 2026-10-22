# CT-AIComm 公开 SDK 边界

这个零依赖 ESM 入口只导出 [`../specs/public-api-v1.json`](../specs/public-api-v1.json) 中列明的版本化公开协议与证据工具。可直接从源码检出目录导入：

```js
import { normalizeNetworkTelemetry, validateControlMessage } from "./sdk/index.mjs";
```

SDK 只校验并规范化调用方提供的证据，不包含凭据、不发现私有基础设施、不授权执行、不挂载 eBPF 程序，也不会把合成数据表述为实测数据。版本 `0.15.0` 新增 CT-609 链路证据护照场景与方法冻结、精确运行绑定，以及运行开始后强制创建替代运行的策略，同时保留 CT-608 只读 Evidence Query 契约和既有 Evidence Core 模块。身份认证、私有查询授权、测量执行、消息代理投递、私有制品内容访问、法律审批、可信签名、认证签发和生产证据读取能力仍明确排除；当前以源码分发，尚未发布到 npm Registry。

护照集成方可以导入 `createPassportScenarioMethodFreeze`、`createPassportRunPlan`、`startPassportRun`、`assertPassportRunFreeze` 和 `createPassportReplacementRun`。契约会冻结精确站点对、方向、协议、工作负载配置、方法引用、工具指纹、参数、采样、排除规则、统计项和环境前提。运行一旦开始，任何变更都会以 `passport_new_run_required` 默认拒绝，并要求使用新的 `run_id`；SDK 不执行基准测试，也不认证结果。

证据目录消费方可以导入 `queryEvidenceRecords`、`getEvidenceQueryRecord`、`createEvidenceQueryStatus` 和 `buildEvidenceQueryRequest`。记录一旦包含租户、主体、存储、端点、凭据或联系字段就默认拒绝。SDK 不执行网络访问，也不定义生产服务器；私有查询只能由单独的实现完成认证与授权。

证据导出服务可以导入 `createEvidenceExportAuditLedger`、`evaluateEvidenceExportRequest`、`recordEvidenceExportDelivery` 和 `verifyEvidenceExportAuditLedger`。策略引擎会对租户、接收方、用途、精确资源版本、字段范围、时间、grant 状态以及调用方提供的认证上下文锚执行默认拒绝检查。它不记录私有载荷、凭据、存储定位或下载 URL，也不宣称已认证主体或证明传输。

下游产品可以导入 `createEvidenceTtlContract`、`createEvidenceInvalidationEvent`、`createEvidenceDownstreamProjection`、`consumeEvidenceInvalidationEvent` 和 `evaluateEvidenceDownstreamTtl`。至少一次的重复投递保持幂等；即使事件丢失，本地状态也会在有界 TTL 截止时失效。当前租约只代表缓存新鲜度，不代表有效或认证结论。

使用 `node examples/sdk/validate-public-evidence.mjs` 运行示例。使用 `node packages/ttft-collector/cli.mjs --endpoint=URL --model=MODEL --prompt=TEXT --environment-fingerprint=sha256:...` 采集一次客户端可观测 TTFT；凭据只能通过 `VLLM_API_KEY` 提供。

第三方 Connector 开发者可从 `examples/connectors/synthetic-static-connector.mjs` 开始，并在自己的测试套件中调用 `runConnectorContract`。契约通过只证明记录结构与证据边界符合要求，不代表获得流量执行授权，也不构成性能认证。

Agent 集成方可使用 `packages/agent-protocol-sdk/` 中的类型化源码包，构造注册、准备、应用、撤销和回执记录。该包不包含传输客户端、生产凭据签发机构或执行回调。

Registry 使用方可以运行 `node scripts/verify-registry-history.mjs` 验证仓库中的合成历史，也可以导入 `verifyRegistryEntryRecord` 和 `verifyRegistryEntryHistory`。验证只证明所提供字节的完整性和摘要链连续性，不授予发布权限，也不构成协议认证。

合规集成方可以导入 `createExecutionEvidenceBinding` 和 `verifyExecutionEvidenceBinding`。验证器不接受绑定文件自证，期望上下文必须来自 SDK 外部、经过身份认证的租户和执行记录查询。

数据治理集成方可以导入 `createDataPathDeclaration`、`validateDataPathDeclaration` 和 `verifyDataPathDeclaration`。结构验证不认证上下文；权威验证必须提供期望租户、工作负载和声明修订号。

审计工具可以导入 `createAuditPackage` 和 `verifyAuditPackage`，也可以运行离线生成与验证 CLI。审计包验证能够发现证据缺失和篡改，并可将标识符绑定到调用方提供的上下文；仅通过校验和验证不能认证审批人，也不能授权执行。

证据审核方可以导入 `inspectEvidenceGaps`，或运行 `scripts/inspect-evidence-gaps.mjs`。调用方必须把权威上下文、可信评估时间和已认证验证器 ID 与待检查评估文件分开提供。只有零缺口报告才会输出 `requirements_satisfied`；该状态不构成执行授权、法律批准或外部认证。

合规架构人员可以导入 `createComplianceRulePack`、`validateComplianceRulePack`、`verifyComplianceRulePackUpgrade` 和 `mapComplianceRulePack`，也可以运行 `scripts/validate-compliance-rule-pack.mjs`。映射报告只按版本化参考定位已提交证据，不签发法律结论、外部测评或认证。
