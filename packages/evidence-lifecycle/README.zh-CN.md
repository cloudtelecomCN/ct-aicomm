# Evidence 生命周期 v1

[English](README.md)

此零依赖包实现 CT-602 Evidence Core 生命周期和五轴转换规则。它不保存租户状态、不认证操作者、不投递下游事件，也不签发认证。

每个事件都携带五个状态轴的完整 `from` 与 `to` 快照。因此，`published` 不能掩盖测量无效、完整性失败、未独立复核、证据过期或策略拒绝。生命周期终态只能追加记录，不能返回活动状态。

参见[双语生命周期规范](../../docs/evidence/status-and-lifecycle-v1.zh-CN.md)、[事件 Schema](../../specs/evidence/evidence-lifecycle-event-v1.schema.json)和[合成历史](../../examples/evidence/lifecycle/history.synthetic.json)。
