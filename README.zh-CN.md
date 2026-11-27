# CT-AIComm 开放接口

[English](README.md)

> CT-AIComm 是面向跨域 AI 通信决策的证据优先运行模型：把声明输入、策略决定、具名人工审批与结果证据绑定在一起，同时不把“建议”混同为“执行”。

本仓库是 CloudTelecom CT-AIComm 的公共互操作层。它发布稳定合同和本地验证工具；CT-AIComm Enterprise 运行时与商业决策逻辑继续保留在私有产品源中。

## 解决什么痛点

大模型跨域通信与基础设施决策通常存在三个问题：

- 候选链路、资源、指标和排除原因分散在不同系统，事后难以还原；
- 调度或路由建议没有稳定绑定生成它的证据、策略版本和约束；
- 自动化工具容易混淆“系统建议”“具名人工批准”和“已经执行的生产变更”。

CT-AIComm 将这些状态分离，使买方和复核方能够追问：观察到了什么、使用了哪条策略、谁批准了下一步、报告了什么动作，以及哪些事实仍未验证。

## 参考运行架构

```text
CT-AIComm
  ↔ 遥测与证据源（交换机、Kubernetes、OpenTelemetry）
  ↔ 策略引擎                         [CT-AIComm Enterprise / 私有]
  ↔ 具名人工审批闸门                 [CT-AIComm Enterprise / 私有]
  ↔ ODAP Gateway                    [MCP 集成目标 / 本仓库不包含]
  ↔ Agent 或客户工具                [由客户控制执行]

每次状态转换都可以生成版本化的决策或动作证据
  → 公共 Schema → 离线验证器 → 可复核证据包
```

上图是参考集成模型，并不表示本仓库已经提供交换机驱动、Kubernetes Controller、OpenTelemetry Collector、OPA 策略服务、ODAP Gateway、Agent 运行时或生产执行面。

## 能力清单

产品手册覆盖现有网站功能、使用条件、操作流程和输出。 [中文使用手册](docs/product-guide.zh-CN.md) · [English Product and User Guide](docs/product-guide.md)

### 本公开仓库已经包含

- 版本化的证据、Agent 调用和 Registry JSON Schema；
- 支持 `mcp`、`a2a` 和 `custom` 的 Agent 调用协议证据字段；
- 只读公共 OpenAPI 合同；
- 用于候选发现和指标采集的最小 Connector 接口；
- 共享 Agent 调用证据映射器，以及 OTel GenAI/MCP Span 桥接合同；
- AgentScope 2.0 与 Dify MCP 工具事件桥接，并明确记录 Qwen-Agent 适配状态；
- 面向目标企业生态的厂商中立只读接入映射器和配置档；
- 零依赖离线证据验证器；
- 确定性合成样例和默认拒绝公开边界测试；
- 中英文架构、集成、安全和贡献文档。

### CT-AIComm Enterprise 私有边界

决策、评分、排序、路由、策略执行、具名审批编排、流量控制、回滚、商业优化、多租户授权、计费、部署和运维实现均为专有组件，不包含在本仓库中。商业版本或 POC 是否提供某项能力，必须以当前产品状态和书面项目范围为准。

## 快速跑通合成 Demo（Mock 模式）

需要 Node.js 22 或更高版本。仓库下载完成后，不需要云账号、工作区 Token、生产凭据或网络服务。

```sh
git clone https://github.com/cloudtelecomCN/ct-aicomm.git
cd ct-aicomm
npm test
npm run verify:example
```

离线验证器按公开 Schema 校验九类 Evidence Core 对象。对合成 `evidence_version`，还会校验用途边界，并在排除顶层 `content_fingerprint` 后，重算 UTF-8 规范化 JSON 的 SHA-256。规范化会递归排序对象键、保留数组顺序、去除无意义空白。其余对象类型执行 Schema 校验。引用文件、签名、身份和测量声明需要独立验证。

该 Demo 会验证公开白名单、运行合同测试，并校验一份本地合成证据文件。它不会生成网络流量、测量真实性能、推荐生产路由或执行任何变更。

## 集成方案

| 集成对象 | 公共起点 | 边界 |
| --- | --- | --- |
| 交换机或网络控制器 | 实现 Connector 接口，把获批准的资源清单或指标字段规范化 | 不包含厂商驱动、配置写入、凭据处理或流量切换 |
| Kubernetes | 将选定的资源和事件字段映射为候选记录或证据记录 | 不包含集群凭据、Controller、准入动作、工作负载部署或调度器修改 |
| OpenTelemetry | 将获批准的 Metric、Span 或 Log 引用映射到版本化证据字段 | 不包含 Collector 发行版、原始载荷留存或生产遥测管道 |
| OPA | 将策略标识、版本、输入摘要和决定摘要绑定到决策记录 | 不包含私有策略包、执行服务、审批权或执行授权 |
| Co-Sight / MCP | 使用 Co-Sight 事件适配器把采集到的 MCP 工具调用元数据映射为 Agent 调用证据 | 需要事件钩子或导出器提供适配器所需字段；不执行或授权 MCP 工具调用 |
| OpenTelemetry GenAI / MCP | 使用共享 OTel 桥接合同映射已完成的工具 Span | 需要显式桥接属性，并在内存中取得请求/响应以计算指纹；纯载荷 Span 会被拒绝，不会生成误导性指纹 |
| CloudWeGo Eino | 从 Eino 回调与 MCP 客户端封装生成约定的桥接事件 | 当前是实验性字段映射；不宣称原生 Eino 插件或上游兼容 |
| 腾讯 WeKnora | 从获批准的审计/追踪导出器生成约定的桥接事件 | 当前是实验性字段映射；不宣称原生 WeKnora 插件或上游兼容 |
| AgentScope 2.0 | 将完成的 OTel 工具 Span 映射到共享 GenAI/MCP 桥 | 需从固定版本部署中验证载荷及 MCP 桥接属性；不宣称 AgentScope 原生输出完整合同 |
| Dify MCP | 映射关联后的 Dify 工具事件和 MCP 调用 ID | 需要部署侧关联调用 ID 并显式提供 MCP 配置；不宣称原生 Dify 插件或授权能力 |
| Qwen-Agent | 暂无可复用适配器 | 等待验证稳定、版本化的生命周期/导出合同；不依赖 monkey patch |

建议从[共享 Agent 调用证据映射器](adapters/agent-call-evidence/README.md)、[OTel GenAI/MCP 桥接](adapters/otel-genai/README.md)、[厂商中立基础设施接入](adapters/vendor-ingestion/README.zh-CN.md)、[Co-Sight 适配器](adapters/cosight/README.md)、[AgentScope 桥接](adapters/agentscope/README.md)、[Dify 桥接](adapters/dify/README.md)、[Eino 桥接](adapters/eino/README.md)、[WeKnora 桥接](adapters/weknora/README.md)、[Qwen-Agent 状态](adapters/qwen-agent/README.md)、[企业适配覆盖计划](docs/enterprise-adapter-coverage.zh-CN.md)、[Agent 调用证据 Schema](schemas/agent/agent-call-evidence-v1.schema.json)和[产品公开与私有边界](docs/public-boundary.zh-CN.md)开始。

## 公开与私有源码边界

本仓库不是 CT-AIComm Enterprise 的开发源。所有公开内容必须经过明确白名单导出和独立复核。

公开仓库不得包含专有算法、权重、阈值、私有规则、生产绑定、客户或合作方数据、原始 POC、私有拓扑、凭据或受限证据。公共合同可以描述输入与输出，但不得披露专有决策如何计算或执行。

通过 Schema 或一致性检查，不代表测量有效、方案最优、获得执行授权、取得认证或具备生产就绪性。

## 商业与战略合作

**欢迎探讨联合 POC、技术合作、战略投资和 IP 收购。**

潜在合作与本公开仓库分开确定范围，并须经过书面授权、保密、安全、数据权利和知识产权审查。可从 [CloudTelecom 中文联系页面](https://cloudtelecom.cn/about)或[英文联系页面](https://cloudtelecom.cn/en/about/)开始联系。

## 公共资源

- [共享 Agent 调用证据映射器](adapters/agent-call-evidence/index.mjs)
- [共享 Agent 调用证据合同（中文）](adapters/agent-call-evidence/README.zh-CN.md)
- [OTel GenAI/MCP 桥接合同](adapters/otel-genai/README.md)
- [OTel GenAI/MCP 桥接合同（中文）](adapters/otel-genai/README.zh-CN.md)
- [Co-Sight MCP 事件适配器](adapters/cosight/README.md)
- [AgentScope 2.0 OTel/MCP 桥](adapters/agentscope/README.md)
- [Dify MCP 工具证据桥](adapters/dify/README.md)
- [Qwen-Agent 适配状态](adapters/qwen-agent/README.md)
- [企业适配覆盖计划](docs/enterprise-adapter-coverage.zh-CN.md)
- [企业适配覆盖计划（English）](docs/enterprise-adapter-coverage.md)
- [厂商中立基础设施接入](adapters/vendor-ingestion/README.zh-CN.md)
- [Vendor-neutral infrastructure ingestion](adapters/vendor-ingestion/README.md)
- [CloudWeGo Eino 桥接合同](adapters/eino/README.md)
- [CloudWeGo Eino 桥接合同（中文）](adapters/eino/README.zh-CN.md)
- [腾讯 WeKnora 桥接合同](adapters/weknora/README.md)
- [腾讯 WeKnora 桥接合同（中文）](adapters/weknora/README.zh-CN.md)

- [产品公开与私有边界](docs/public-boundary.zh-CN.md)
- [公共架构](docs/architecture.zh-CN.md)
- [只读 OpenAPI 合同](openapi/public-api-v0.2.yaml)
- [证据对象 Schema](schemas/evidence/evidence-object-v1.schema.json)
- [Agent 调用证据 Schema](schemas/agent/agent-call-evidence-v1.schema.json)
- [Registry 贡献 Schema](schemas/registry/registry-contribution-v2.schema.json)
- [Connector 接口](adapters/connector-sdk/index.mjs)
- [安全披露策略](SECURITY.md)

## 项目链接

- 网站：[cloudtelecom.cn](https://cloudtelecom.cn/)
- 英文网站：[cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)

## 许可

公开源文件采用 Apache-2.0，文档默认采用 CC BY 4.0。许可仅适用于本仓库实际发布的文件，不授予对 CT-AIComm Enterprise 专有组件的访问权或其他权利。

