# CT-AIComm 产品功能与使用手册

手册 1.0.0 · 2026 年 11 月 25 日

CT-AIComm 是面向 AI 的通信与跨域协同操作系统。它将协议选型、推理通信、基础设施比较、跨域约束和审计证据放在同一工作流中。你可以从公开目录和合成示例开始，在获授权的工作区形成报告，或下载本地评估套件断网试用。

## 选择使用入口

| 你要完成的任务 | 使用入口 | 前置条件 |
| --- | --- | --- |
| 筛选、比较通信协议 | [Protocol Registry](https://cloudtelecom.cn/registry) | 无需登录 |
| 查看、下载和复跑基准证据 | [CT-Bench](https://cloudtelecom.cn/bench) | 浏览无需登录，复跑见环境要求 |
| 比较跨 GPU、云和地域的采购组合 | [CT-Advisor](https://cloudtelecom.cn/advisor) | 保存项目和生成在线报告需要工作区 Token |
| 在本机体验从需求到证据的流程 | [本地评估套件](https://cloudtelecom.cn/resources) | Windows 或 Linux，Node.js 22 或更高版本 |
| 验证证据、查看引用或试跑策略 | [证据验证](https://cloudtelecom.cn/evidence/verify)、[证据问答](https://cloudtelecom.cn/evidence/query)、[策略工作区](https://cloudtelecom.cn/playground) | 公开示例无需登录 |
| 推进集成、合规交接或企业试点 | [产品状态](https://cloudtelecom.cn/product-status)、[企业试点](https://cloudtelecom.cn/enterprise) | 受控功能按项目与角色授权 |

建议先选一个真实问题，例如“跨地域推理部署应该比较哪些 GPU、地域和链路”，再用公开示例熟悉输入和报告格式。正式决策使用与目标工作负载相匹配、来源可追溯的数据。

## Protocol Registry

1. 打开目录，按类别、成熟度和证据信任级别筛选，或搜索 gRPC、QUIC、RoCE v2 等名称。
2. 打开协议详情，检查用途、引用来源、版本与场景说明。对多项候选使用比较页，或在推荐向导中选择工作负载、网络边界、目标与硬件环境。
3. 将推荐作为候选清单，结合 CT-Bench 中同类环境的证据复核。目录条目和规则推荐不会给出实测结论。
4. 贡献者可通过提交入口附协议版本、来源链接和场景定义。审核发布后，条目才进入公开目录。

[目录](https://cloudtelecom.cn/registry) · [协议比较](https://cloudtelecom.cn/registry/compare) · [推荐向导](https://cloudtelecom.cn/registry/recommend) · [提交条目](https://cloudtelecom.cn/registry/submit)

## CT-Bench

1. 进入场景详情，先核对方法版本、指标单位、环境指纹、样本策略和失败处理。比较推理通信时确认 TTFT 的采集定义和工作负载一致。
2. 打开运行记录，检查数据来源。合成运行用于演示复现和验证流程，测量结果仅适用于记录中的环境与方法。
3. 按复现指南下载方法和样本。运行附带的复现工具，核对报告 JSON、可用的原始 CSV 及 SHA-256。原始样本下载以该运行记录提供的制品为准。
4. 提交实测时准备协议与场景、完整环境信息和原始样本。提交进入审核队列，发布和独立复核依相应流程完成。

[Bench](https://cloudtelecom.cn/bench) · [复现指南](https://cloudtelecom.cn/docs/bench-reproduction) · [提交运行](https://cloudtelecom.cn/bench/submit)

## CT-Advisor

在线工作区覆盖采购前的需求、比较和报告。基础模式引导逐步完成任务，专家模式展示更多方法、来源和配置细节。两种模式使用同一套分析结果。

1. **进入工作区。** 从获授权的工作区创建流程或管理员取得 Token。到 Advisor 工作区输入 Token，选择任务模板，填写项目名称、使用场景和目标决策日期。管理员使用工作区内的访问凭据面板签发或轮换 Token，凭据值显示时存入密钥管理工具。
2. **冻结需求护照。** 填写工作负载、预算、目标区域、延迟、数据驻留及合规约束，确认目标和硬约束。
3. **准备候选与估算。** 选择或登记带来源的资源，运行 Sizing 与成本估算，记录假设、来源和生效时间。手工创建组合，也可通过受支持的 JSON 或 CSV 导入。
4. **运行 Data Gate。** 选择冻结护照及至少两个组合。检查硬约束、阻断项与缺口，补齐必要资料再重跑。为十项分析指标录入值和来源，缺少依据的值标记为未知。
5. **复核多目标分析。** 检查成本、性能、合规和均衡四个情景的排序、排除原因、Pareto 和敏感性信息。比较候选时将估算与实测区分开。
6. **交付基础报告。** 选择分析运行与语言，生成报告并导出 JSON、CSV 或浏览器本地 PDF。输出包含来源、假设、限制和证据摘要。需要留档时，使用项目导出及对应离线验证器。

目录、估算、分析和基础报告属于免费自助范围。唯一收费项为跨 GPU、云、地域及网络的正式 **GPU 决策与证据包**。用户主动申请后进入人工报价和授权流程，交付以书面范围为准，可能包含编号报告、决策记录、证据包和签收。

[进入 Advisor](https://cloudtelecom.cn/advisor) · [Advisor 详细手册](https://cloudtelecom.cn/advisor/help) · [发布状态](https://cloudtelecom.cn/advisor/release-status)

## 本地评估套件 0.2.1

1. 在资源中心获取 ZIP、SHA-256、Sigstore bundle 和双语手册。核对完整性后解压，准备 Node.js 22 或更高版本。
2. Windows 在套件目录运行 `.\start.ps1`，Linux 运行 `sh start.sh`。打开终端显示的地址，默认是 `http://127.0.0.1:43120/`。若 Linux 无桌面启动工具，可手动打开地址，服务会继续运行。
3. 载入合成样例或按随包 Schema 导入自有数据。核对需求、候选和十项指标，运行 Data Gate 和分析。
4. 导出项目 JSON、基础报告 JSON/CSV 和证据 ZIP。在套件目录运行 `node verify-evidence.mjs <证据ZIP路径>`，核对清单、文件集合和 SHA-256。

本地套件绑定回环地址，基础流程无需云账号或工作区 Token。内置样本标记为 `synthetic`，导入数据保留 `imported_unverified`。适用范围为离线评估。

[下载与验证材料](https://cloudtelecom.cn/resources) · [中文套件手册](https://cloudtelecom.cn/downloads/local-evaluation-kit/v0.2.1/README.zh-CN.md)

## 证据验证与问答

- **Evidence in CI。** 在浏览器验证器载入合成例子或符合 CI 证据契约的护照，查看摘要、证据状态和可复核徽章，再下载验证结果。徽章只表示对应验证范围内的可复核性。自动化接入时按 CI 契约保存运行来源和指纹。 [使用指南](https://cloudtelecom.cn/docs/evidence-in-ci) · [浏览器验证器](https://cloudtelecom.cn/evidence/verify)
- **证据问答。** 选择示例问题，读结论、数值、引用、缺口与冲突。专家模式可检查查询、方法版本、证据账本和摘要。可导出 JSON、HTML 或 PDF 解释包。 [证据问答](https://cloudtelecom.cn/evidence/query)
- **Copilot。** 选择 Registry、Bench 等知识范围后发起问答，打开引用核对来源。 [Copilot 工作台](https://cloudtelecom.cn/copilot)
- **公开 CLI。** 在公开仓库用 Node.js 22 运行 `npm run verify:example`。CLI 检查九类 Evidence Core 对象的 Schema，并为合成 `evidence_version` 重算文档摘要。CI 护照、套件导出 ZIP 和 Agent 签名各有相应验证器。 [公开 CLI](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/cli/verify-evidence.mjs)

## 策略工具链与 CT-Orchestrator

1. 从 CT-DSL 示例开始，选择工作负载、候选链路与约束，运行策略校验和模拟。
2. 查看候选筛选、推荐解释和阻断项。使用变更审查、韧性演练及发布闸门记录人工审批和故障处置依据。
3. 导出模拟结果或审查包，保存策略版本与场景输入。网站公开工作区使用声明数据做模拟。真实下发和回滚属于具名受控验证，由试点协议、权限及环境决定。

[CT-DSL](https://cloudtelecom.cn/docs/ct-dsl) · [策略工作区](https://cloudtelecom.cn/playground) · [CT-Orchestrator](https://cloudtelecom.cn/orchestrator) · [运行控制台](https://cloudtelecom.cn/console)

## DataPlane Agent 与 vLLM Connector

- **CT-DataPlane Agent。** 阅读宿主机要求和兼容矩阵，从获授权环境的 `observe_only` 预检开始，保存宿主环境和事件证据。正式策略下发和切流依据具名试点范围。 [Agent 产品页](https://cloudtelecom.cn/products/agent)
- **vLLM Connector。** 按版本支持矩阵确认端点，在授权环境中做健康与能力探测。区分实测探测和夹具覆盖，记录版本、探测结果与失败行为。 [vLLM Connector](https://cloudtelecom.cn/products/connectors/vllm)
- **Agent 身份证据。** 从资源中心下载一致性套件，用本地样例校验 Agent 身份和动作记录的字段、摘要与签名。对接时记录执行者、代理对象、授权范围和凭证指纹。验签结果适用于对应的签名和证据范围。 [一致性套件](https://cloudtelecom.cn/resources)

## CT-Auditor 与 SLA 对账

- **合规声明。** 在 CT-Auditor 填系统、工作负载、来源与目的区域、用途、传输边界，绑定获授权证据。查看缺口后生成声明，配合就绪评估、隔离证据和外部评估交接。最终评估意见由具名机构按授权范围出具。 [CT-Auditor](https://cloudtelecom.cn/compliance/auditor) · [就绪评估](https://cloudtelecom.cn/compliance/readiness) · [评估交接](https://cloudtelecom.cn/compliance/mlps-assessment-handoff)
- **SLA 履约证据。** 绑定服务周期、适用条款、指标口径和测量证据，再生成可复核的对账材料或草稿。正式账单、责任判定和付款依据合同及审批完成。 [SLA 履约证据](https://cloudtelecom.cn/compliance/sla-billing-evidence)

## Marketplace 与企业工作区

在 Marketplace 查看经审核的通信组件。比较版本、兼容条件、来源和校验材料，再决定是否进入自有测试环境。已获授权的审核人和贡献者通过工作区处理提交与审查。 [Marketplace](https://cloudtelecom.cn/marketplace) · [组件工作区](https://cloudtelecom.cn/marketplace/workspace)

企业试点按目标、数据范围、具名角色和验收条件推进。获授权后使用企业工作区维护试点范围、验收矩阵、进度、证据、风险、决策及结项材料。身份与权限配置适用各租户的启用状态。 [企业试点](https://cloudtelecom.cn/enterprise) · [企业身份](https://cloudtelecom.cn/enterprise/identity)

## API 接入与问题反馈

公开仓库提供只读 OpenAPI、证据和 Registry Schema、Connector 接口、CLI 与合成样例。采购排序、生产路由、执行、租户控制与部署由私有产品实现。集成时先用公开契约和样例完成校验，再按所需权限申请工作区或商定试点。 [官网 API 文档](https://cloudtelecom.cn/docs/api) · [公开源边界](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/docs/public-boundary.zh-CN.md)

出现无权限、数据不足或校验失败时，依次检查角色和 Token 有效期、数据来源和版本、下载摘要，以及当前产品状态。反馈时附页面、复现步骤、时间、错误码和可共享的标识。凭据和客户原始材料请通过企业授权渠道处理。 [产品状态](https://cloudtelecom.cn/product-status) · [安全反馈](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/SECURITY.md)
