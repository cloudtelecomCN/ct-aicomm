# 链路证据护照观测归一与质量标记 v1

状态：CT-611 公开工作契约。版本：`1.0.0`。

CT-611 把精确版本且已启动的护照运行所产生的一项聚合结果，转换为不可变、按内容寻址的观测记录。单位换算、尝试样本、失败、排除、来源和派生质量均必须显式记录。本契约不执行测量、不认证身份，也不签发性能结论或认证。

## 公开制品

- [`normalized-observation-v1.schema.json`](../../specs/passport/normalized-observation-v1.schema.json)：严格记录 Schema。
- [`observation.mjs`](../../packages/link-evidence-passport/observation.mjs)：无需网络和凭据的创建与验证实现。
- [`observation.d.ts`](../../packages/link-evidence-passport/observation.d.ts)：TypeScript 公共边界。
- [`observation-normalization-synthetic.mjs`](../../examples/passport/observation-normalization-synthetic.mjs)：离线合成示例，不是基准结果。

## 精确运行与方法绑定

创建和验证都必须提供精确版本的 `started` Run 及其场景方法 Freeze。记录固定二者的版本与指纹。指标和聚合方式必须存在于冻结方法中，每项排除都必须引用运行前冻结的排除规则，`observed_at` 必须位于已启动运行的时间窗内。单独一份记录不能证明这些关系。

## 版本化单位规则

SDK 通过 `PASSPORT_OBSERVATION_UNIT_RULES` 转换声明的来源单位，并同时记录来源值、来源单位、归一值、Evidence Core 规范单位和换算系数。它不会根据指标名称猜测单位，也不会静默接受本地化别名。

| 数量 | 可接受来源单位 | 规范单位 |
|---|---|---|
| 时长 | `ns`、`us`、`ms`、`s` | `ms` |
| 比特率 | `bit/s`、`kbit/s`、`Mbit/s`、`Gbit/s` | `bit/s` |
| 字节率 | `byte/s`、`KiB/s`、`MiB/s`、`GiB/s` | `byte/s` |
| 字节数 | `bytes`、`KiB`、`MiB`、`GiB` | `bytes` |
| 比率 | `1` | `1` |
| 百分比 | `percent`、`%` | `percent` |
| 计数与速率 | `count`、`request/s`、`token/s` | 原规范单位 |

不支持的单位默认拒绝。纳入样本数为零时，来源值和归一值都必须是 `null`，不能用失败样本虚构聚合值。

## 闭合样本账

以下等式必须同时成立：

```text
attempted = successful + failed
successful = included + excluded
sum(failure.count) = failed
sum(exclusion.count) = excluded
```

失败样本必须保留机器可读的失败码、阶段和数量。排除样本必须引用运行前冻结的精确规则 ID。任何一类样本都不能在没有披露的情况下从分母中消失。

## 来源严格分离

四种来源互斥，并要求不同的来源证据：

| 来源 | 必须使用的来源类型 | 必须提供的来源信息 | 派生质量上限 |
|---|---|---|---|
| `measured` | `instrument` | 一项按内容寻址的来源 Artifact | `valid` 或 `partial` |
| `synthetic` | `generator` | 一项按内容寻址的生成 Artifact | `valid` 或 `partial`，但仍是合成数据 |
| `inferred` | `derivation` | 一项或多项精确 Observation 引用 | `unknown` |
| `declared` | `attestation` | 具名声明人 | `unknown` |

仅合成的 Freeze 会拒绝实测、推断和声明记录；仅实测的 Freeze 会拒绝所有非实测来源。混合 Freeze 可以包含分别标记的记录，但任何记录都不能在归一过程中改变来源。

## 派生质量

调用方不能自行选择质量。SDK 按固定规则派生：

- 纳入样本为零：`invalid`；
- 推断或声明来源且存在纳入值：`unknown`；
- 保留失败或排除样本：`partial`；
- 其他实测或合成记录：`valid`。

质量标记会保留原因。即使是 `valid`，也只表示结构契约和样本账通过；边界仍固定为 `performance_claim_allowed: false` 和 `certification_issued: false`。

## 安全与隐私边界

公开实现只保存引用、计数、指纹和有界标签，不保存来源路径、原始载荷、端点、凭据、客户拓扑或签名私钥。生产身份认证、持久化存储、Artifact 内容访问、测量执行和授权执行仍不属于此离线参考实现。
