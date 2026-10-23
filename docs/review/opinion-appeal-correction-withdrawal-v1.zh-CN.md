# 意见、申诉、更正与撤销 v1

[English](opinion-appeal-correction-withdrawal-v1.md)

CT-620 在精确的 CT-616 至 CT-619 记录之上增加受治理的意见生命周期。它从已验证的复算记录和可选的后续运行记录派生有边界的发现，识别 CT-617 中合格的意见签署人，并把每次申诉、处理、更正和撤销保留在一条仅追加的完整历史中。

## 派生结果

调用方不能自行填写结果。参考实现只派生以下三种之一：

- `consistent`（一致）：没有复算统计项超出声明容差，且所附后续运行没有已变化或未知的环境维度；
- `deviation`（偏差）：至少一项复算统计超出声明容差；
- `uncertain`（不确定）：复算没有超出容差，但所附后续运行存在已变化或未知的环境维度。

`deviation` 的优先级高于 `uncertain`。后续运行始终只是后续运行；CT-620 不会把它表述为历史状态重现。发现中保留逐统计项、逐环境维度的条目和单独的发现指纹。

## 角色与权限

只有经 CT-617 声明记录门禁判定合格的精确 `opinion-signer`，才能签发意见、处理申诉、签发更正或撤销意见。证据提交人与委托方可以提出申诉；属于委托机构的销售人员可以转交申诉。销售和提交人不能修改发现，不能处理申诉，不能签发更正，也不能撤销意见。

CT-617 的合格门禁仍然只基于声明记录，不代表已对签署人完成外部身份认证，也不代表复核独立性认证。

## 仅追加生命周期

每个事件都有单调递增序号、规范 UTC 时间、精确意见引用、前序事件指纹和内容指纹。允许的事件为：

1. `appeal-filed`：记录被争议的当前发现和请求补救方式，不改变发现；
2. `appeal-resolved`：由合格签署人记录维持原结论、需要更正或需要撤销；
3. `correction-issued`：必须已有“需要更正”的申诉处理结果和不同的已验证来源；生成新的当前发现，同时保留原意见；
4. `withdrawal-issued`：必须已有“需要撤销”的申诉处理结果；把生命周期标为已撤销，并进入终态。

更正绝不覆盖旧记录。投影同时返回原始意见、全部事件、每项申诉状态、当前来源绑定发现和终态。对已保存生命周期进行重排、删除、重复、倒签时间或修改内容，都会破坏事件链或生命周期指纹。

## 信任边界

CT-620 记录的是有边界的独立复核意见。它不认证主体身份，不外部核验机构控制关系或导出授权，不认证复核独立性，不重现历史状态，不修改 Passport，不形成性能声明，不裁决 SLA，不提供法律结论，也不签发认证。随附场景为合成数据。

## 离线运行

```bash
node --test tests/review-opinion-lifecycle.test.mjs
node examples/review/opinion-lifecycle-synthetic.mjs
```

参考模块位于 [`packages/independent-run-review/opinion.mjs`](../../packages/independent-run-review/opinion.mjs)，公开类型位于 [`opinion.d.ts`](../../packages/independent-run-review/opinion.d.ts)，闭合 Schema 位于 [`review-opinion-lifecycle-v1.schema.json`](../../specs/review/review-opinion-lifecycle-v1.schema.json)。
