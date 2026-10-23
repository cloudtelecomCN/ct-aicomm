# CT-Advisor 正式证据包合同 v1

[English](formal-evidence-package-contract-v1.md)

## 目的

CT-666 冻结 CT-Advisor 唯一收费能力的公开合同：

```text
GPU 决策与证据包
capability_key: gpu_preprocurement_decision_evidence_package
```

合同把一份既有免费 Basic Report 绑定到固定包配置，提前定义 13 项客户制品、manifest 字段、校验和、版本兼容规则与产品边界。正式报告、审批、打包、报价和权益属于后续私有工作流。

资源发现、Sizing、组合比较、分析、普通建议和 Basic Report 导出继续免费。冻结合同既不授予付费权益，也不生成正式包。

## 十三项交付制品

| 编号 | 制品 | 允许格式 | 实现任务 |
|---|---|---|---|
| D01 | 项目范围与责任边界 | PDF / DOCX | CT-667 |
| D02 | Requirement Passport | PDF / JSON | CT-667 |
| D03 | 候选与组合矩阵 | XLSX / CSV / JSON | CT-667 |
| D04 | 数据来源账本与数据缺口清单 | PDF / CSV / JSON | CT-667 |
| D05 | 成本、性能、网络、地域与风险分析 | PDF / JSON | CT-667 |
| D06 | 四情景、Pareto 与敏感性结果 | PDF / CSV / JSON | CT-667 |
| D07 | 正式编号 GPU Decision Report | PDF / DOCX | CT-667 |
| D08 | Explainable Recommendation | PDF / JSON | CT-667 |
| D09 | Decision Record 与审批记录 | PDF / JSON | CT-667 |
| D10 | Evidence Package 聚合容器 | ZIP + manifest + SHA256SUMS | CT-668 |
| D11 | 离线验证结果 | TXT / JSON | CT-668 |
| D12 | 原始数据、转换数据和完整退出包 | ZIP | CT-668 |
| D13 | 对应产品版本的使用手册 | PDF / HTML / Markdown | CT-673 |

配置中的 13 项均为必交付项。后续实现不得静默删除制品，也不能只用 PDF 替代约定的机器可读输出。

## Manifest 与校验和模型

- `manifest.json` 记录精确合同、配置、来源、包修订和文件。
- `SHA256SUMS` 覆盖包内每个文件的精确字节。
- D10 表示聚合 ZIP 容器。ZIP 无法包含自身摘要，因此归档摘要必须作为外部 sidecar 交付，manifest 明确禁止循环自引用。
- 路径必须是相对路径，禁止目录穿越；CT-668 验证器必须拒绝未声明文件。
- 已签发字节不可变。来源或制品变化必须生成新的包修订并记录替代关系，不能覆盖既有包。

本任务只冻结 manifest Schema。归档生成、完整校验和验证、篡改检测与离线打包在 CT-668 实现。

## 兼容策略

Schema 与制品配置采用严格读取的语义化版本：

- 读取器只接受相同主版本，且读取器版本不能旧于文档版本；
- patch 版本只能做说明或非结构修正；
- 新增可选字段必须升级 minor 版本并由读取器明确支持；
- 删除、重命名、类型变化、语义变化和新增必填字段必须升级 major 版本；
- 未知字段一律拒绝，不能静默忽略；
- 已签发文档不得静默迁移。

每个包都必须记录精确 Schema、配置和最低验证器版本。不支持的验证器必须失败关闭并提示升级。

## 公开文件

- `specs/advisor/formal-evidence-package-contract-v1.schema.json`
- `specs/advisor/formal-evidence-package-manifest-v1.schema.json`
- `packages/advisor/formal-evidence-package-contract.mjs`
- `scripts/verify-advisor-formal-package-contract.mjs`

离线运行：

```bash
npm test
```

## 边界

冻结的 CT-666 合同不等于正式报告、人工决定、审批、独立复核、认证、法律意见、性能声明或执行授权。公开合同不包含客户数据、报价、权益、服务凭据或私有评分配置。
