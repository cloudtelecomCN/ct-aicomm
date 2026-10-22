# 版本化合规规则包

CT-561 定义公开、零依赖的规则包契约，用于把 CT-Auditor 控制项映射到测评准备参考。规则包记录签发方、适用范围、语义化版本、前序版本指纹、映射关系和保证边界。它只用于导航和定位证据，不是法律意见，也不是认证证书。

## 公开契约

- Schema：[`specs/compliance/compliance-rule-pack-v1.schema.json`](../../specs/compliance/compliance-rule-pack-v1.schema.json)
- 观测输入 Schema：[`specs/compliance/compliance-control-observation-v1.schema.json`](../../specs/compliance/compliance-control-observation-v1.schema.json)
- 映射报告 Schema：[`specs/compliance/compliance-rule-mapping-report-v1.schema.json`](../../specs/compliance/compliance-rule-mapping-report-v1.schema.json)
- 运行时与类型：[`packages/compliance/rule-pack.mjs`](../../packages/compliance/rule-pack.mjs) 和 [`rule-pack.d.ts`](../../packages/compliance/rule-pack.d.ts)
- 离线校验器：[`scripts/validate-compliance-rule-pack.mjs`](../../scripts/validate-compliance-rule-pack.mjs)

三个合成参考包分别覆盖等保准备、数据边界证据和企业自定义规则。它们使用演示标识符，不包含官方控制条文：

- [`synthetic-mlps-preparation-v1.json`](../../examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json)
- [`synthetic-data-boundary-v1.json`](../../examples/compliance/rule-packs/synthetic-data-boundary-v1.json)
- [`synthetic-enterprise-baseline-v1.json`](../../examples/compliance/rule-packs/synthetic-enterprise-baseline-v1.json)

## 版本与完整性模型

`pack_version` 使用严格语义化版本。除初始版本外，每个新版本都必须在 `supersedes` 中记录前一版本的 ID、版本号和规范化 SHA-256 指纹。`verifyComplianceRulePackUpgrade` 会拒绝更换 `pack_id`、版本号未递增或前序链断裂的更新。`validateComplianceRulePack` 会重新计算规范化指纹并拒绝被修改的内容。

规则包更新不得覆盖旧版本。运行系统应分别保留规则包 ID、版本、指纹、声明版本、观测输入、映射报告和人工复核决定，形成不可变记录。

## 映射语义

`mapComplianceRulePack` 接收调用方提供的控制观测，并要求调用方从独立可信来源提供预期租户、工作负载、声明 ID 和版本。输出状态仅表示：

- `evidence_present`：映射到的内部控制均提交了证据；
- `evidence_missing`：至少一个内部控制明确缺少证据；
- `not_evaluated`：至少一个内部控制尚未观测。

`mapped_without_observed_gaps` 不表示合规、批准、认证或法律充分，只表示所提供观测没有暴露该映射的缺失项。报告固定输出 `mapping_only: true`、`legal_conclusion: false`、`certification_issued: false` 和 `external_assessment_performed: false`。

## 离线使用

```bash
node scripts/validate-compliance-rule-pack.mjs examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json
```

校验新版本时，用 `--previous` 传入精确的前一版本。企业规则包应使用 `authority_type: customer_defined`；如果内部政策文本属于保密信息，应留在私有系统中，并在采用前由具名法务、安全负责人和测评方复核。
