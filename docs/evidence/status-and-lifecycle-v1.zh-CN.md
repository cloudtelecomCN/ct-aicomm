# 证据五轴状态与生命周期 v1

[English](status-and-lifecycle-v1.md)

CT-602 定义 Evidence Core 的追加式生命周期和五个独立状态轴。规范事件契约是
[`specs/evidence/evidence-lifecycle-event-v1.schema.json`](../../specs/evidence/evidence-lifecycle-event-v1.schema.json)，参考引擎是
[`packages/evidence-lifecycle/index.mjs`](../../packages/evidence-lifecycle/index.mjs)。

## 不可折叠的状态模型

每个生命周期事件都必须携带完整的 `from.status_axes` 和 `to.status_axes`。消费方必须逐轴显示和判断：

| 状态轴 | 同一个 EvidenceVersion 内允许的前向转换 |
|---|---|
| 测量有效性 | `unknown` 可进入 `partial`、`sufficient` 或 `invalid`；`partial` 可进入 `sufficient` 或 `invalid`；`sufficient` 可进入 `invalid`；`invalid` 为终态。 |
| 内容完整性 | `unverifiable` 可进入 `passed` 或 `failed`；`passed` 可进入 `failed`；`failed` 为终态。 |
| 独立复核 | `not-reviewed` 可进入 `in-progress`；`in-progress` 可进入 `consistent`、`deviation` 或 `uncertain`；每个结论对当前版本都是终态。 |
| 新鲜度 | `unknown` 可进入 `valid`、`expiring` 或 `expired`；`valid` 可进入 `expiring` 或 `expired`；`expiring` 可进入 `expired`；`expired` 为终态。 |
| 策略决定 | `manual-review` 可进入 `accepted` 或 `rejected`；`accepted` 可进入 `rejected`；`rejected` 为终态。 |

不利终态需要创建新的 EvidenceVersion 或独立的新决定/复核对象，不能原位改写。状态投影返回全部状态轴及逐项阻塞原因，并固定返回 `single_status_allowed: false` 和 `certification_issued: false`。

## 生命周期

```text
草稿 -> 校验中 -> 已封存 -> 已发布 -> 已过期
                     \        -> 已替代
                      \       -> 已撤销
校验中 -> 草稿（校验失败）
```

精确转换、原因码和操作者角色如下：

| 起点 | 终点 | 原因码 | 允许角色 |
|---|---|---|---|
| `draft` | `validating` | `validation_requested` | owner、operator |
| `validating` | `draft` | `validation_failed` | validator |
| `validating` | `sealed` | `validation_passed` | validator |
| `sealed` | `published` | `publication_authorized` | publisher |
| 同一非终态 | 同一状态 | `status_changed` | reviewer、policy-consumer、system、operator |
| `published` | `expired` | `validity_elapsed` | system、operator |
| `published` | `superseded` | `replacement_published` | publisher |
| `published` | `revoked` | `revocation_authorized` | publisher、operator |

`expired`、`superseded` 和 `revoked` 均为终态。替代事件必须固定同租户、同证据 ID 的更高精确语义版本；过期事件必须在同一事件中把新鲜度设为 `expired`。

## 不可变边界

封存后不再修改 EvidenceVersion。复核、新鲜度、策略、替代和撤销变化只能追加为有序事件。引擎拒绝重复或断裂序号、陈旧时间、引用不匹配、未知字段、状态轴倒退、角色与原因不匹配以及无变化事件。

CT-602 只验证确定性转换语义。[CT-603](content-integrity-v1.zh-CN.md) 已提供内容指纹和离线 manifest 验证；CT-607 增加持久事件投递、下游幂等消费和 TTL 失效传播。

## 稳定错误码

模块导出 `EVIDENCE_LIFECYCLE_ERROR_CODES`。调用方应根据 `error.code` 而不是消息文本分支。错误类别覆盖输入、未知或缺失字段、引用、生命周期状态与转换、终态、原因与角色、时间与序号、历史连续性、状态轴及其转换、无变化更新和替代要求。

## 合成示例

[`examples/evidence/lifecycle/history.synthetic.json`](../../examples/evidence/lifecycle/history.synthetic.json) 依次经过草稿、校验、封存、发布、复核进度和过期。该样例始终只具有 `partial`、`unverifiable`，最后为 `uncertain`；“已发布”不会掩盖这些限制。样例不包含客户数据或真实生产测量结果。
