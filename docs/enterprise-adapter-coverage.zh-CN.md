# 企业适配覆盖计划

[English](enterprise-adapter-coverage.md)

## 目的与声明边界

本计划覆盖 CT-AIComm 目标名单中列出的企业。“覆盖”表示已定义集成路径或证据映射目标，**不**表示已获得厂商认证、完成真实 API 集成、部署到客户环境或通过兼容性验证。公开仓库不存放厂商凭据、专有 API、客户拓扑或生产控制逻辑。

商业集成的第一阶段仅做只读资源发现和证据接入。资源采购/开通、配置写入、流量变更、自动回滚、计费操作和合规认证均不属于这些适配器的范围。

## 共用集成轨道

| 轨道 | 共用接口 | 规范化数据 | 当前状态 |
| --- | --- | --- | --- |
| Agent 与 MCP 运行时 | MCP 调用生命周期及 OpenTelemetry GenAI Span | 显式声明的工具/Agent 身份、调用 ID、协议/传输、时间、结果、载荷指纹、来源 | 已有 Co-Sight、AgentScope 2.0 OTel、Dify MCP 映射桥；Eino 和 WeKnora 有部署侧桥接合同。这些都不是已验证的在线厂商集成。 |
| GPU 遥测 | Prometheus 指标格式、厂商 Exporter 或获准指标 API | 加速器型号/序号、利用率、显存，以及可获取的温度/功耗、时间、来源版本 | NVIDIA DCGM 有公开文档说明的接入路径；其他加速器的 Exporter 和指标语义需按厂商和版本验证。 |
| 网络遥测 | OpenConfig/gNMI、NETCONF/RESTCONF、SNMP 或厂商遥测导出 | 设备/接口标识、链路状态、计数器、队列/丢弃/错误指标；仅在来源提供时采集光层指标 | 已定义标准接入路径；尚未验证任何指定交换机厂商实现。只读查询/订阅。 |
| 云资源与成本清单 | 云厂商 OpenAPI/SDK，使用客户自有只读凭据 | 区域/可用区、实例/GPU SKU、声明的可用性、价格/成本来源、用量/监控样本 | 各云厂商字段映射需取得 API/版本、区域、权限和账户样例；不收集凭据、不创建资源。 |
| 集群与调度器 | Kubernetes API 和调度器只读状态/队列接口 | 节点、加速器分配、工作负载/队列状态、放置结果与事件引用 | 目前只有合同级映射；正式声明支持前需验证具体调度器版本和 RBAC 范围。 |
| 可观测性 | Prometheus API 和 OTLP | 指标、Span、日志引用及来源信息 | 已有公开证据映射；采集器部署和生产数据访问由客户负责。 |
| 集成商/运营商 OSS-BSS | 客户或产品 API、Webhook、导出文件或 MCP 门面 | 获准的资源清单、服务状态、SLA 周期引用、故障/变更记录 | 不能假定存在统一厂商中立 API；须取得接口文档和授权后按项目映射。 |

## 企业覆盖矩阵

| 企业/主体 | 轨道 | 适配方式 | 就绪度/所需证据 |
| --- | --- | --- | --- |
| 中兴通讯 | 网络遥测、集群/网络资源清单 | 优先 OpenConfig/gNMI 或有文档的只读北向 API；取得设备固件和数据模型后再做中兴配置 | 目标对象；尚无设备或 API 验证 |
| 华为企业 BG / 昇腾 | 网络遥测、加速器遥测 | OpenConfig/gNMI 或华为批准的只读北向 API；昇腾指标使用厂商支持的 Exporter/API | 目标对象；需确认产品系列、软件版本、指标名称/单位、权限及测试环境 |
| 烽火通信 | 传输/DCI 遥测 | 标准遥测或有文档的只读 NMS 北向 API；仅当来源提供时映射光层指标 | 目标对象；尚无 OTN/DCI 适配器验证 |
| 锐捷网络 | 交换机遥测 | 支持时使用 OpenConfig/gNMI，否则使用有文档的只读 API/SNMP 导出 | 目标对象；需提供型号/固件及遥测路径 |
| 新华三 / 紫光股份 | 交换机和集群遥测 | OpenConfig/gNMI 或有文档的只读 NMS/设备 API | 目标对象；需提供型号/固件和数据字典 |
| 阿里云 | 云 GPU 清单、成本和监控 | 通过云连接器合同调用阿里云 OpenAPI/SDK，凭据由客户侧只读托管 | 计划做云厂商映射；需核实产品 API、区域、指标维度和价格来源 |
| 腾讯云 | 云 GPU 清单、成本和监控 | 通过云连接器合同调用腾讯云 API/SDK，凭据由客户侧只读托管 | 计划做云厂商映射；官方 CVM 监控文档列有 GPU 指标，但 CT-AIComm 尚未接入真实账户验证 |
| 火山引擎 | 云 GPU 清单、成本和监控 | 通过云连接器合同接入火山引擎 OpenAPI/SDK | 计划中；需提供并验证 API/版本和允许读取的指标范围 |
| 百度智能云 | BCC/GPU 清单与监控 | 通过云连接器合同映射 BCC/BCM API 和有文档的 GPU/RDMA 指标来源 | 有候选文档路径；尚未通过 CT-AIComm 真实云账户验证 |
| 中国电信 / TeleAI / 天翼云 | 云、网络和运营商 OSS/BSS 证据 | 云服务商轨道加获授权 OSS/BSS 导出或 API；不假定存在单一统一接口 | 按项目实施；需接口负责人、数据字典、权限范围和测试租户 |
| 中国联通 / 联通云 / 元景 | 云、网络和 Agent 平台 | 云 API 加有文档的 MCP/OSS 接口；Agent 调用按共享 MCP 证据合同映射 | 按项目实施；需产品/版本对应 API 和授权沙箱 |
| 中国移动 / 移动云 / 研究院 | 云、DCI 和运营商 OSS/BSS 证据 | 云 API 加获授权 NMS/OSS/BSS 导出，映射到共用遥测合同 | 按项目实施；不宣称厂商兼容已验证 |
| 软通动力、中软国际、神州数码、拓维信息 | 系统集成商交付环境 | 基于共享连接器合同，使用集成商自有 API/MCP/Webhook/导出配置 | 合作/集成目标；不能假定其产品有共同 API |
| 恒为科技、云杉网络、DeepFlow 生态 | 网络可观测性 | 优先 OTLP 或 Prometheus；只有接口有文档且获授权时才接入厂商 API/导出 | 标准遥测路径可对接；具体产品 Exporter 和 Schema 仍需验证 |
| Dify | Agent/MCP 调用 | 已有公开 Dify MCP 桥；部署时须关联真实 MCP 工具调用 ID | 桥接合同已在 PR；不是原生插件或线上部署认证 |
| FastGPT | Agent/MCP 调用 | 若所部署版本导出所需生命周期字段，则接入 MCP 或 OpenTelemetry 桥 | 候选；实现前需验证当前事件钩子和调用 ID 语义 |
| LobeHub 商业生态 | Agent/MCP 调用 | MCP/OTel 桥或客户自有事件导出器 | 候选；先确定具体产品/仓库和版本 |
| ODAP Gateway 及同类网关 | MCP 网关生命周期 | MCP 协议记录或 OTel 桥；仅映射来源明确提供的网关身份和来源信息 | 使用共享 MCP 证据合同；具体网关需固定版本并提供样例验证 |
| 寒武纪、海光、摩尔线程、燧原 | 加速器遥测 | 使用厂商支持的 Exporter/SDK 或客户推送的 Prometheus 指标，并显式配置型号/驱动/固件 | 目标对象；需验证指标语义、单位、版本兼容及映射公开授权 |
| NVIDIA | GPU 遥测和集群 | DCGM Exporter/Prometheus；在授权范围内关联集群工作负载信息 | 上游接入路径有文档；CT-AIComm 仍需固定版本样例和支持版本政策 |
| AWS / Azure 中国区生态 | 云清单、成本与监控 | 使用区域对应的云 API 和只读配置；遵守账户/区域可用性及数据驻留限制 | 候选；需核实具体中国区产品 API 和租户权限，不假定跨区域可用 |
| AXON Networks | 网络遥测/控制面证据 | 标准 gNMI/OpenConfig 或有文档的只读北向 API | 目标对象；适配前需确认具体产品/API 和支持版本 |

## 交付顺序

1. **共用合同**：发布厂商覆盖矩阵、字段/单位规则、来源要求和只读边界。
2. **标准优先采集器**：用合成样例实现并验证 OTLP、Prometheus、OpenConfig/gNMI、Kubernetes 映射；不提供网络写入方法。
3. **云厂商配置**：取得官方 API 参考和客户授权样例后，逐家添加云与加速器字段映射。
4. **具名厂商验证**：针对固定产品/固件/软件版本测试，并记录不支持字段、权限及故障行为。
5. **商业连接器**：凭据和专有编排留在私有部署；公开侧只发布获批 Schema 映射和一致性样例。

## 单个具名适配器的验收门槛

- 记录确切产品、版本、区域、设备型号、API/Exporter 版本。
- 数据源所有者授予最小权限只读访问；密钥不得进入 Git 或证据制品。
- 每个指标都有单位、时间语义、聚合方式和缺失值处理说明。
- 尽量减少原始载荷；指纹不能被描述为源测量真实的证明。
- 先通过合成样例，再评估获授权的真实样例；实测数据始终明确标记。
- 不支持字段、限流、过期数据和 API 错误都要显式返回降级/不可用状态。
- 任何适配器都不采购资源、不写设备配置、不切流、不回滚、不扣费，也不认证合规。

## 主要参考

- [OpenConfig gNMI 规范](https://github.com/openconfig/reference/blob/master/rpc/gnmi/gnmi-specification.md)
- [NVIDIA DCGM Exporter 文档](https://docs.nvidia.com/datacenter/dcgm/latest/reference/command-line-reference/dcgm-exporter.html)
- [腾讯云 CVM 监控指标](https://intl.cloud.tencent.com/document/product/248/6843)
- [百度云 GPU 监控](https://cloud.baidu.com/doc/GPU/s/Tllgafkyy)
- [AgentScope 追踪中间件](https://github.com/agentscope-ai/docs/blob/main/en/versions/2.0.8/building-blocks/middleware.mdx)
- [Dify MCP 工具提供方](https://github.com/langgenius/dify/blob/main/api/core/tools/mcp_tool/provider.py)
- [腾讯 WeKnora MCP 文档](https://github.com/Tencent/WeKnora/blob/main/website-docs/03-features/08-mcp.md)

