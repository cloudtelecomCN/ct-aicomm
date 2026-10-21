# 证据缺口检测 v1

[English](evidence-gap-detection.md)

CT-559 定义一个默认拒绝的证据要求检查契约。应用只有在以下四类机器可读缺口均不存在时，才可以输出 `requirements_satisfied`：

| 类型 | 检测规则 |
| --- | --- |
| `missing` | 策略要求没有任何已提交证据。 |
| `stale` | 以调用方提供的评估时间计算，证据年龄超过要求中明确的最大时限。 |
| `conflicting` | 同一要求下的记录包含多个不同的声明指纹。 |
| `unsigned` | 某条证据可接受的已验证签名少于策略要求。 |

格式错误、未知要求、证据类型不匹配、未来时间记录、重复身份，以及租户、工作负载或执行不匹配都会被直接拒绝，不会被转换成乐观报告。

## 信任输入与提交内容分离

评估文件包含证据记录和签名验证回执。以下三类权威输入由调用方单独提供：

- 期望的租户、工作负载和执行标识；
- 用于新鲜度检查的评估时间；
- 调用方信任的验证器 ID。

签名验证回执只有同时满足以下条件才会计数：状态为 `verified`、验证器在调用方信任列表中、签名人角色符合要求，并且验证时间位于证据观测时间与报告评估时间之间。公开 SDK 不验证原始签名、不运营密钥权威，也不认证验证器。调用方必须先认证验证回执的来源，再将其传入本模块。仅在 JSON 文件中写入可信验证器 ID 不能构成证明。

## 运行故意不完整的合成示例

```bash
node scripts/inspect-evidence-gaps.mjs \
  examples/compliance/synthetic-evidence-gap-assessment.json \
  --tenant tenant-synthetic-alpha \
  --workload workload-inference-synthetic \
  --execution execution-synthetic-001 \
  --at 2026-10-22T12:00:00.000Z \
  --trusted-verifier synthetic-verifier-v1
```

该示例包含一份缺失的回滚记录、一份陈旧声明、两份互相冲突的审批声明和一份未签名执行记录。CLI 会输出报告并以状态码 `2` 退出；这个非零默认值可防止不完整报告意外通过 CI 门禁。无效输入以状态码 `1` 退出，只有零缺口报告才以状态码 `0` 退出。

确定性输出保存在 [`synthetic-evidence-gap-report.json`](../../examples/compliance/synthetic-evidence-gap-report.json)。输入与输出都只是合成契约样例，不是生产证据。

## SDK API

```js
import { inspectEvidenceGaps } from "@cloudtelecom/ct-aicomm-sdk";

const report = inspectEvidenceGaps(assessment, {
  expectedContext: {
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId
  },
  evaluatedAt: trustedClockNow,
  trustedVerifierIds: authenticatedVerifierIds
});
```

输入数组会被规范化为稳定顺序。报告分别为规范化策略、评估输入、每项缺口和完整报告生成指纹，便于独立工具复现同一结果。

## 公开契约

- 评估输入 Schema：[`../../specs/compliance/evidence-gap-assessment-v1.schema.json`](../../specs/compliance/evidence-gap-assessment-v1.schema.json)
- 报告 Schema：[`../../specs/compliance/evidence-gap-report-v1.schema.json`](../../specs/compliance/evidence-gap-report-v1.schema.json)
- 参考实现：[`../../packages/compliance/evidence-gap.mjs`](../../packages/compliance/evidence-gap.mjs)
- 类型声明：[`../../packages/compliance/evidence-gap.d.ts`](../../packages/compliance/evidence-gap.d.ts)
- 默认拒绝 CLI：[`../../scripts/inspect-evidence-gaps.mjs`](../../scripts/inspect-evidence-gaps.mjs)

## 结论边界

`requirements_satisfied` 只表示已提交记录在给定时间和信任上下文下，通过了所选版本的声明式证据策略。它不批准执行、不证明法律依据有效、不认证策略本身，也不签发外部认证。因此报告始终保持 `authorization_verified: false` 和 `legal_or_certification_conclusion: false`。
