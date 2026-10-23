# CT-Advisor Combination Builder v1

状态：CT-662 公开合同。实现可确定性复算、支持离线验证，示例仅使用合成数据。

## 用途

Combination Builder 将目录资源引用组合成版本化的 `InfrastructureCombination`。一个组合绑定一个 GPU、云实例、地域、网络路径、一个或多个软件栈、一个或多个计费条目，以及明确的精度、拓扑和数量配置。

它只支持采购前并排比较，不执行客户硬约束、评分、排序、推荐、容量预留、基础设施部署或流量变更。

## 输入

- 手工 JSON 使用 `infrastructure-combination-input-v1.schema.json`。
- JSON 批量导入接受数组或 `{ schema_version, combinations }` 对象。
- CSV 必须使用 `combinationCsvColumns` 导出的固定列顺序。
- CSV 列表字段使用 `|` 分隔资源 ID；支持标准引号字段和双引号转义。
- 单次导入 1–200 个组合；每个资源引用必须使用不可变的 `advisor_resource_*` 标识。

## 确定性检查

构建器在给定目录快照中解析所有引用，并为下列问题输出稳定冲突代码：

- 资源缺失或资源类型错误；
- 重复引用、重复组合键或完整签名重复；
- 来源过期、尚未生效、资源弃用或无分析授权；
- 云实例/GPU、云/地域、网络/地域、软件兼容性和 GPU 容量冲突；
- 精度不支持、计费目标/币种冲突，以及相同目标和计费单位出现矛盾价格。

错误产生 `blocked`，警告产生 `needs_review`，无问题时为 `comparable`。符合合同的服务不得持久化被阻断组合。

## 比较矩阵

`buildCombinationComparison()` 输出 19 个固定顺序维度，覆盖 GPU、云、地域、网络、软件、精度、拓扑、数量、币种、计费单位和承诺类型，并列出未知维度、混合币种、阻断行和重复签名。它不输出评分或首选组合。

该输出是后续任务的稳定输入边界：

- CT-663 执行数据准备规则和硬约束。
- CT-664 执行多目标情景、Pareto 和敏感性计算。

## 完整性

每个组合文档包含：

- 规范化输入摘要；
- 资源选择和配置的签名摘要；
- 被解析资源及其来源的不可变摘要；
- 完整文档内容摘要；
- 构建器版本和评估时间。

修改已存储字段但不重算完整文档时，`validateInfrastructureCombinationDocument()` 必须失败。

## 产品边界

每个组合都明确：

- `decision_support_only: true`
- `execution_authorized: false`
- `constraint_evaluation_performed: false`
- `ranking_performed: false`
- `performance_claim_allowed: false`

每个比较结果都明确没有执行约束、评分、排序、推荐或自动执行。

## 运行合同测试

```bash
node --test tests/advisor-combination-builder.test.mjs
```

所有示例均为合成数据，不代表厂商价格、库存、基准结果或采购建议。
