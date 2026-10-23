# CT-Advisor 2.0 产品使用手册

[English](user-guide-v2.md)

> 手册版本：1.0.0  
> 产品合同：CT-Advisor 2.0 / Schema 2.0.0  
> 更新日期：2026-10-24  
> 发布状态：Pre-RC 实现指南

CT-Advisor 是一个 AI 基础设施决策工作区，把需求、候选资源、Sizing、基础设施组合、来源状态、硬约束、多目标分析、报告和人工决定放进同一条可追溯工作流。它提供只读决策支持，不购买资源、不部署工作负载、不切换流量、不执行调度决策，也不提供性能或合规认证。

## 1. 产品与收费边界

CT-Advisor 只有一个产品和一个工作区。已发布任务模板、资源发现、Sizing、成本估算、跨 GPU/云/地域/网络比较、约束分析、普通建议和基础报告导出全部免费。

唯一收费能力是 **GPU 决策与证据包**。只有符合条件的用户主动要求生成正式包时，页面才显示商业提示。打开或关闭提示不会扣费、授权或删除免费工作。正式包制作前必须完成人工报价和服务端权益授权。

当前托管入口：

- 中文基础报告工作区：`https://cloudtelecom.cn/advisor`
- 英文基础报告工作区：`https://cloudtelecom.cn/en/advisor/`
- 中文帮助中心：`https://cloudtelecom.cn/advisor/help/`
- 英文帮助中心：`https://cloudtelecom.cn/en/advisor/help/`
- OpenAPI 合同：`https://cloudtelecom.cn/openapi.yaml`

当前浏览器工作区覆盖：认证后的基础报告生成、不可变报告历史、JSON/CSV/本地 PDF 导出和原位正式包提示。上游项目、Passport、目录、Sizing、组合、Data Gate 与分析目前通过版本化 API 完成。本手册不声称这些上游步骤已经拥有完整网页界面。

## 2. 使用前准备

尽量准备以下事实；缺少的事实会保留为明确的未知项：

- 模型名称、版本、参数量、精度、上下文和输出长度；
- 推理或训练框架；
- 平均/峰值 QPS、并发或 Token 量；
- TTFT、TPOT、吞吐、可用性或完成时间目标；
- 预算、币种、期限、折扣、税和网络出站假设；
- 允许和排除的 GPU、供应商、地域与网络路径；
- 数据驻留和内部策略约束；
- 厂商报价、内部实测或公开来源；
- 决策截止时间和具名复核人。

不要把密码、私钥、Bearer Token 或生产凭据写入项目字段、来源记录或普通支持消息。

## 3. 身份认证与角色

托管工作区凭据是高熵 Bearer Token，只显示一次；服务端只保留 SHA-256 摘要。请存入批准的密钥管理工具，不要提交到源码或写进浏览器书签。

```bash
export CT_ADVISOR_TOKEN='ctw_替换为一次性显示的工作区令牌'
```

组织范围由服务端根据 Token 确定，客户端附加其他 `org_id` 不能改变租户。

| 角色 | 当前服务端权限 |
|---|---|
| Owner | 工作区管理、项目写入、正式评审、保留策略、归档、删除和允许的下载 |
| Admin | 项目写入、正式评审、保留策略、归档和允许的下载 |
| Operator | 项目写入和允许的下载 |
| Viewer | 只读访问和允许的下载 |

平台法律保全和商业授权使用独立管理员凭据，不属于工作区 Token 权限。

## 4. 端到端工作流

整条工作流使用同一个不可变项目 ID：

1. 选择已发布任务模板；
2. 创建免费项目；
3. 填写并冻结 Requirement Passport；
4. 选择公开资源或添加带来源的租户私有事实；
5. 创建 Sizing 计算与基础设施组合；
6. 运行 Data Readiness Gate；
7. 运行确定性多目标分析；
8. 生成并导出免费基础报告；
9. 可选申请正式 GPU 决策与证据包。

### 4.1 查看模板与公开资源

以下端点公开访问，不返回租户数据：

```bash
curl -sS https://cloudtelecom.cn/api/v1/advisor/task-templates
curl -sS https://cloudtelecom.cn/api/v1/advisor/catalog/resources
```

模板成熟度 `preview`、`beta`、`stable` 表示实现证据，不是收费等级。公开目录可能包含合成测试记录，使用任何值前都要阅读来源状态。

### 4.2 创建项目

```bash
curl -sS -X POST https://cloudtelecom.cn/api/v1/workspace/advisor/projects \
  -H "Authorization: Bearer $CT_ADVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "推理基础设施选型",
    "template_id": "ai-inference-infrastructure-selection/v1",
    "locale": "zh-CN"
  }'
```

项目本身免费。正式包资格仍属于同一个项目，CT-Advisor 不会创建隐藏的付费项目副本。

### 4.3 Requirement Passport

Passport 记录值、单位、硬约束、来源状态、置信度和明确未知项。编辑草稿不会覆盖已冻结版本。进入 Data Gate 和分析前应先冻结 Passport，使后续结果可以复算。

请求结构与字段配置见公开的 [Requirement Passport 2.0 合同](requirement-passport-v2.zh-CN.md)。

### 4.4 目录、Sizing 与组合

公开目录与租户私有报价、内部实测物理隔离。资源类型包括 GPU、云实例、地域、网络路径、软件栈和价格方案。

Sizing 与成本计算保留公式、单位、假设、来源绑定和未知项。计算结果是估算，不代表库存或真实部署性能承诺。

基础设施组合绑定 GPU、供应商/实例、地域、网络路径、软件栈、价格和配置。JSON/CSV 导入执行原子校验。跨 GPU、云、地域或网络的比较在支持范围内始终免费。

### 4.5 Data Gate 与分析

Data Gate 返回三类状态：

- `ready`：必要输入可比较；
- `ready_with_gaps`：可以继续，但缺口必须保留在结果中；
- `blocked`：修复阻断前不生成建议。

系统先按硬约束排除候选，再对合格组合运行版本化的成本、性能、均衡和合规优先情景。Pareto 和敏感性结果绑定同一组冻结观察值。未知指标不会被静默补值。

### 4.6 基础报告

打开托管基础报告工作区，输入工作区 Token，选择项目与分析运行，再生成报告。JSON 与 CSV 由服务端生成；PDF 在浏览器本地生成，不发送到外部转换服务。

基础报告属于自助分析，不是正式采购证据、独立复核、认证、审批或执行授权。

## 5. 数据来源状态

每个关键值都要保留来源类型与置信度。

| 状态 | 含义 |
|---|---|
| `measured` | 有方法和环境记录的实测值 |
| `vendor_published` | 厂商公开事实 |
| `customer_quoted` | 客户持有的报价或合同条件 |
| `customer_declared` | 客户声明但未独立验证 |
| `modeled` | 公式或模型推导值 |
| `inferred` | 间接推断值 |
| `synthetic` | 测试或演示数据，不是真实世界声明 |
| `unknown` | 暂无可靠值 |

不得把 `modeled`、`inferred` 或 `synthetic` 改写为 `measured`。

## 6. 正式 GPU 决策与证据包

对于符合条件的推理基础设施选型任务，完整基础报告可以显示正式包操作。原位提示展示正式范围和报价状态。申请报价只创建待处理记录，不扣费，也不授予权益。

商业授权完成后，正式流程冻结范围与来源，把复核、人工决定与系统建议分别记录，并生成编号报告和确定性 Evidence Package。建议、人工决定以及未来可能出现的执行回执是不同事实。

正式包不保证全局最优、来源真实性、性能提升、认证、法律合规、采购、部署或执行。

## 7. 验证 Evidence Package

同时下载 ZIP 和 `.zip.sha256` 旁车文件，使用本公开仓库中的零依赖验证器：

```bash
node scripts/verify-advisor-evidence-package.mjs \
  advisor_evidence_package_<uuid>.zip \
  --sha256 advisor_evidence_package_<uuid>.zip.sha256
```

可选 `--package-id` 和 `--contract-id` 用于绑定预期上下文。通过表示结构、摘要、兼容版本和包内状态一致；不表示来源真实、签发者身份、商业权益、认证、性能或当前线上撤销状态。详见[正式证据包验证指南](formal-evidence-package-verification-v1.zh-CN.md)。

## 8. 安全、保留与删除

- 受保护读取和下载需要工作区认证，并使用 `Cache-Control: no-store`。
- 基础报告和 Evidence Package 下载追加有限审计事件，不记录凭据、查询字符串、请求体或制品字节。
- 归档需要 Owner 或 Admin；删除只允许 Owner。
- 归档保留、正式证据保留、活动商业流程或法律保全存在时，删除保持阻断。
- 平台默认归档项目保留 30 天，正式证据和审计记录保留 2,555 天；组织只能在受支持且顺序合法的范围内配置。
- 法律或合同义务可能阻止立即删除。处置端点会返回阻断原因，并在可确定时返回日期。

这些控制是工程基线，不是独立渗透测试、认证或法律意见声明。

## 9. 常见问题处理

| 现象或代码 | 含义 | 处理方式 |
|---|---|---|
| `unauthorized_workspace` | 缺少或无效工作区 Token | 使用当前一次性签发的 Token；丢失后申请轮换 |
| 项目不存在 | 对象不存在或属于其他租户 | 检查项目 ID 和 Token；API 会隐藏跨租户对象是否存在 |
| `ready_with_gaps` | 可分析但存在明确限制 | 在依赖排序前检查来源、单位和有效期缺口 |
| `blocked` | 硬约束或必要映射未解决 | 修复问题；CT-Advisor 不会虚构建议 |
| 报告页没有分析 | 项目不存在有效分析运行 | 通过 API 完成 Passport、组合、Data Gate 和分析 |
| 没有正式包按钮 | 项目/模板/报告不符合资格或未完成 | 继续使用免费基础报告，或使用符合范围的任务 |
| `upgrade_required` | 正式制作缺少有效权益 | 申请报价，或继续使用免费输出 |
| 包验证失败 | 字节、结构、版本或上下文不一致 | 不要正式使用该包，获取完整替代包 |
| 删除被阻断 | 存在保留、证据、商业流程或法律保全 | 查看处置评估，等待或解决具名阻断项 |

## 10. 版本映射与支持

托管帮助中心提供机器可读版本映射。当前手册对应：

| 表面 | 版本 |
|---|---|
| 产品 | CT-Advisor 2.0 |
| 产品合同 Schema | 2.0.0 |
| 手册 | 1.0.0 |
| Requirement Passport Schema | 2.0.0 |
| 任务注册表、项目、目录、Sizing、组合、Data Gate、分析、基础报告、Evidence Package、商业与安全 Schema | 1.0.0 |

已部署源码版本以网站 `/release.json` 为准。产品版本、手册版本、API/Schema 版本和网站部署 revision 是不同标识。

报告问题时请提供产品/手册版本、项目 ID、页面或端点、时间、步骤和错误代码；不要包含密码、Token、私钥或未脱敏客户数据。安全问题按 [SECURITY.zh-CN.md](../../SECURITY.zh-CN.md) 的私密流程提交。

