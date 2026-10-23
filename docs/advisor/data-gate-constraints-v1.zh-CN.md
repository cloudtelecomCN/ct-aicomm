# CT-Advisor Data Gate 与硬约束 v1

Data Gate 用于判断一个已冻结的 Requirement Passport 与一组不可变基础设施组合，是否具备进入后续分析所需的完整性和可比性。它采用确定性、默认拒绝的规则，不执行评分、排序、推荐或生产操作。

## 输入

- 一个摘要验证通过且已冻结的 Requirement Passport v2。
- 一至 500 个不可变 Infrastructure Combination v1 文档。
- 版本化 Requirement Field Registry v2。
- 已冻结的 `ct-advisor-data-readiness-hard-constraints` v1 规则集。

硬约束判断后至少要保留两个合格候选。硬约束值未知、输入来源未知、单位不受支持或硬约束字段没有映射时，分析会被阻断。候选维度未知时，该候选标记为无法判断；硬约束不满足时，该候选被排除并保留明确原因。

## 结果状态

- `ready`：没有阻断项或警告。
- `ready_with_gaps`：可以继续分析，但合成来源等警告必须持续展示。
- `blocked`：阻断项解决前不得继续分析。

结果通过内容 SHA-256 绑定准确的 Passport 修订、候选摘要、规则集摘要、时间、问题和候选判定。调用方改变输入顺序不会改变结果。

## 安全边界

Data Gate 始终明确：

- 硬约束必须先于未来任何评分执行；
- 本阶段没有执行评分、排序或推荐；
- 未知值没有被自动补全；
- 没有授权任何执行动作。

合成样例仅证明软件契约可复算，不是真实生产测量证据，不能用于采购性能声明。

## 公开制品

- 规则：`examples/advisor/data-readiness-rules-v1.json`
- 规则 Schema：`specs/advisor/data-readiness-rules-v1.schema.json`
- 结果 Schema：`specs/advisor/data-gate-result-v1.schema.json`
- 参考实现：`packages/advisor/data-gate-constraints.mjs`
- 固定指纹：`examples/advisor/data-gate-fixed-expected-v1.json`
- 离线契约测试：`tests/advisor-data-gate-constraints.test.mjs`
