# CT-Advisor Requirement Passport 2.0

Requirement Passport 2.0 将任务需求转成版本化、机器可读的决策输入。它是公开互操作合同，不是客户记录库。公开仓库只包含 Schema、字段定义、验证代码和合成夹具。

## 合同组成

- `specs/advisor/requirement-field-registry-v2.schema.json` 定义字段注册表格式。
- `examples/advisor/requirement-field-registry-v2.json` 将字段绑定到全部已发布任务模板。
- `specs/advisor/requirement-passport-v2.schema.json` 定义单个可携带 Passport 版本。
- `packages/advisor/requirement-passport.mjs` 验证模板字段、类型、单位、来源元数据、完整性和冻结摘要。
- `examples/advisor/synthetic-requirement-passports-v2.json` 为每个任务模板提供一个合成冻结 Passport。

## 字段语义

每个字段都携带值状态、类型化值、规范单位、约束类别、来源类型、置信度和观测时间。`unknown` 与 `not_applicable` 是显式状态，值必须为 `null`；验证器不会替用户补造数值。各模板通过字段配置声明必填和选填字段，不创建第二套 Passport 对象。

来源类型包括 `measured`、`vendor_published`、`customer_quoted`、`customer_declared`、`modeled`、`inferred`、`synthetic` 和 `unknown`。来源标签只描述溯源，不自动证明数据真实或准确。

## 冻结与验证

草稿可以不完整，也不带摘要。冻结时，模板的每个必填字段必须以 `status=provided` 提供。摘要是规范 Passport 投影的 SHA-256，覆盖任务绑定、修订号、规范化字段顺序、记录者类别、时间和安全边界。冻结后的值、单位、来源或约束发生任何变化，摘要验证都会失败。

冻结后继续编辑必须创建更高修订号的草稿，不能重写已冻结版本。私有实现必须保存不可变版本，并只从服务端认证上下文派生组织范围。

## 能力边界

Passport 只记录决策支持所需的要求，不授权采购、部署、切流或执行。合成夹具不能支撑性能声明；本合同也不认证来源真实性、合规性、可用性、价格或库存。
