# 链路证据护照封存、版本与终态 v1

[English](sealing-versioning-and-terminal-status-v1.md)

CT-612 把一次精确冻结的运行及其规范化观测封存为不可变护照版本，并定义追加式的
到期、替代和撤销事件。这些契约用于保留证据历史；它们不认证操作者身份、不批准
策略、不宣称性能，也不签发认证。

## 公开契约

- [`evidence-version-v1.schema.json`](../../specs/passport/evidence-version-v1.schema.json)：
  封存版本 Schema。
- [`version-terminal-event-v1.schema.json`](../../specs/passport/version-terminal-event-v1.schema.json)：
  精确版本的终态事件 Schema。
- [`versioning.mjs`](../../packages/link-evidence-passport/versioning.mjs)：创建并验证版本、
  替代版本、终态事件和状态投影。
- [`sealing-versioning-synthetic.mjs`](../../examples/passport/sealing-versioning-synthetic.mjs)：
  离线合成示例，不是基准结果。

## 封存规则

只有冻结的运行窗口结束后才能封存。每条纳入的观测都必须：

1. 通过 CT-611 观测归一验证；
2. 精确绑定同一个已开始运行和场景—方法冻结；
3. 在 `sealed_at` 之前已经产生；
4. 仅出现一次，并保留在原始的实测、合成、推断或声明分组中。

版本指纹保护精确运行、冻结、分组后的观测引用、授权范围、有效期、初始状态轴和
版本血缘。任何内容变化都必须产生新的语义化版本，旧记录不得原地修改。

`freshness_ttl_seconds` 确定性地产生 `valid_until`，且版本有效期不得超过授权范围。
即使消费者没有收到终态事件，在 `valid_until` 到达后进行状态投影也会默认失效。

## 版本自身的状态

初始状态只属于本次新封存的内容：

| 状态轴 | 初始值 |
|---|---|
| 测量有效性 | 根据本版本已验证观测的质量状态推导 |
| 内容完整性 | 每条精确观测指纹验证后为 `passed` |
| 独立复核 | `not-reviewed` |
| 新鲜度 | 在本版本自己的 `valid_until` 之前为 `valid` |
| 策略决定 | `manual-review` |

因此替代版本不会继承前序版本的复核结论、新鲜度或策略决定。复核和策略决定必须
重新引用新的精确版本。

## 终态

一个封存版本最多只能接受一个追加式终态事件：

| 状态 | 固定原因 | 操作者角色 | 附加规则 |
|---|---|---|---|
| `expired` | `validity_elapsed` | system 或 operator | 事件时间不早于 `valid_until` |
| `superseded` | `replacement_published` | publisher | 更高精确版本已封存，并反向引用本版本 |
| `revoked` | `revocation_authorized` | publisher 或 operator | 不暗示存在替代版本 |

替代和撤销必须发生在到期前。终态事件只记录决定，不修改封存源；重复追加第二个终态
事件会被拒绝。

## 边界

验证通过只说明调用方提供记录的结构一致且规范化内容指纹正确。模块不执行测量、
网络访问、身份认证、可信签名、存储、投递、法律复核或认证签发。

运行离线合成示例和测试：

```bash
node examples/passport/sealing-versioning-synthetic.mjs
node --test tests/passport-sealing-versioning.test.mjs
```
