# 独立运行复核委托

[English](README.md)

这个零依赖 Node.js 包实现 CT-616“复核委托与范围”契约。它把一项委托绑定到一个精确的链路证据护照版本和一个已通过校验和验证的交付清单，并记录约定的复核层级、容差、用途、禁止用途和交付内容。

本包创建不可变且带内容指纹的记录。任一范围字段发生变化时，调用方必须创建新的 `engagement_id`、引用精确的上一项委托并说明变更原因。复用委托标识或创建没有范围变化的替代委托都会失败关闭。

## 公共 API

- `createIndependentReviewEngagement(input)` 创建初始委托或替代委托。
- `verifyIndependentReviewEngagement(input)` 验证内容指纹、精确护照和交付包绑定、版本有效状态及可选前序委托。
- `compareIndependentReviewScope({ baseline, candidate })` 列出发生变化的顶层范围字段，并判断新委托是否满足替代规则。

## 信任边界

委托只记录约定，不证明复核方独立性，不认证任何一方身份，不授权访问受限证据，不执行复算或重跑，不签发意见，不改变护照状态，不裁决 SLA，不形成性能声明，也不签发认证。上述职责必须由后续独立治理的记录完成。

参见[双语集成说明](../../docs/review/engagement-and-scope-v1.zh-CN.md)和[合成示例](../../examples/review/engagement-scope-synthetic.mjs)。
