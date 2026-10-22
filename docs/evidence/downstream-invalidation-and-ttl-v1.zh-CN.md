# 下游失效传播与 TTL v1

[English](downstream-invalidation-and-ttl-v1.md)

状态：CT-607 公开契约。本规范把 CT-602 生命周期终态变化传递给下游缓存、榜单、
SLA 工作流、离线导出和调度适配器，同时避免把缓存状态误写成可信结论。

规范性公开制品：

- [`evidence-status-ttl-contract-v1.schema.json`](../../specs/evidence/evidence-status-ttl-contract-v1.schema.json)
- [`evidence-invalidation-event-v1.schema.json`](../../specs/evidence/evidence-invalidation-event-v1.schema.json)
- [`packages/evidence-invalidation/index.mjs`](../../packages/evidence-invalidation/index.mjs)

## 两条独立失效路径

每个下游投影都有两条默认拒绝的失效路径：

1. 收到 `evidence.expired`、`evidence.superseded` 或 `evidence.revoked` 后，
   立即使对应租户下的精确 EvidenceVersion 失效；
2. 即使事件完全丢失，状态租约也会在 `ttl_expires_at` 到期时失效。该时间取“状态
   检查时间加配置缓存 TTL”与证据有效期截止时间中更早者。

这是“至少一次”投递契约，不宣称传输层“恰好一次”。消费者持久化 `event_id`
和 `event_fingerprint`；相同组合重复出现时不产生变化，同一 ID 携带不同内容时
报错。新的终态事件必须推进租约已观察到的生命周期序号。

## TTL 契约

状态租约只对应一个精确的 `tenant_id`、证据 ID 和语义化版本。它固定源状态指纹
和生命周期序号，状态查询入口必须是无内嵌凭据的 HTTPS URI，最大缓存 TTL 为
24 小时，并固定 `fail_closed_on_ttl_expiry: true`。

`current` 只表示缓存租约仍在时限内。CT-602 的五个状态轴仍然彼此独立且必须
分别判断。租约不代表实测、复核通过、授权、身份真实性或认证。

## 终态事件规则

| CT-602 转换 | CT-607 事件 | 下游结果 |
|---|---|---|
| `published -> expired` | `evidence.expired` | 精确版本立即失效。 |
| `published -> superseded` | `evidence.superseded` | 旧版本失效并展示精确替代引用，但不得自动启用新版本。 |
| `published -> revoked` | `evidence.revoked` | 立即失效，不隐含替代版本。 |

失效事件包含完整源生命周期事件的指纹。参考引擎拒绝非终态转换、陈旧序号、跨
租户或不同版本投递、无效替代引用、未知字段、错误时间顺序和指纹变更。持有源
生命周期事件的验证方可将其传给 `verifyEvidenceInvalidationEvent`，同时核对源事件
ID、序号、引用、转换、时间、替代版本和指纹。

## 离线导出

离线导出应显示导出时间、租约截止时间和在线状态查询入口。超过截止时间后，
即使设备一直没有重新联网，也必须显示为陈旧或已失效。查询 URI 只是定位入口，
不是凭据；生产身份认证和网络投递不属于公开模块。

## 合成场景

[`examples/evidence/downstream-invalidation-synthetic.mjs`](../../examples/evidence/downstream-invalidation-synthetic.mjs)
向 Marketplace、SLA 和 Scheduler 投影各重复消费一次替代事件，并为断网导出演示
TTL 兜底失效。场景只含合成标识，不形成性能或认证结论。
