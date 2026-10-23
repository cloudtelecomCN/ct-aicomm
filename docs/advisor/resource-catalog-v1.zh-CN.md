# CT-Advisor 资源与来源目录 v1

CT-660 定义 CT-Advisor 使用的 GPU、云实例、地域、网络路径、软件栈和价格记录公开数据合同。目录记录只是决策支持输入，不代表资源可用性承诺、认证、执行指令或性能声明。

## 合同文件

- `specs/advisor/resource-field-registry-v1.schema.json` 定义字段注册表格式。
- `specs/advisor/resource-catalog-v1.schema.json` 定义公开目录包。
- `examples/advisor/resource-field-registry-v1.json` 冻结规范字段与单位。
- `examples/advisor/synthetic-resource-catalog-v1.json` 为每类资源提供一个明确标注的合成条目。
- `packages/advisor/resource-catalog.mjs` 可离线校验字段、有效期、授权、隔离和 SHA-256 摘要。

## 每个值保留上下文

每个资源包含类型化事实和一份不可变来源快照。来源快照记录来源类型、置信度、发布者、观测时间、生效区间、摘要、分析授权、再分发授权和独立摘要。`unknown` 与 `not_applicable` 是显式状态；缺失数据不得用虚构数值填补。

## 有效期与授权

使用方必须在声明的 UTC 时间评价资源是 `not_yet_effective`、`current` 还是 `expired`。只有处于活跃状态、当前有效、允许分析且必填事实完整的资源，才可进入分析。过期或禁止使用的数据仍可为追溯目的显示，但不能静默进入计算。

公开目录条目只能是公开数据或明确标注的合成数据，并且必须同时允许分析和再分发。租户私有记录只由商业工作区保存和提供；公开目录验证器会拒绝任何租户私有条目。

## 完整性边界

来源快照与资源分别使用规范 SHA-256 摘要。修改事实、来源摘要、授权决定或有效期都会导致相应摘要失效。目录数据始终遵守：

- 仅用于决策支持；
- 不授权执行；
- 不构成性能声明；
- 合成数据必须显式标注；
- 租户私有记录在物理上排除于公开目录之外。

运行 `npm test` 可在不联网、不使用凭据的情况下验证 Schema、夹具、摘要、过期处理和公开/私有边界。
