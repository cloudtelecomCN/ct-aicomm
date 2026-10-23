# 独立运行复核契约

[English](README.md)

这个零依赖 Node.js 包实现 CT-616“复核委托与范围”契约、CT-617 身份、组织与利益冲突门禁，以及 CT-618 结构检查与统计复算记录。CT-616 将委托绑定到一个精确的链路证据护照版本和一个已通过校验和验证的交付清单；CT-617 再把主体、实际控制、付款、职责分离、冲突与回避声明绑定到该精确委托；CT-618 要求有效的复核方分享，独立复算授权样本，应用声明容差策略，并登记每项非精确差异。

本包创建不可变且带内容指纹的记录。任一范围字段发生变化时，调用方必须创建新的 `engagement_id`、引用精确的上一项委托并说明变更原因。复用委托标识或创建没有范围变化的替代委托都会失败关闭。

## 公共 API

- `createIndependentReviewEngagement(input)` 创建初始委托或替代委托。
- `verifyIndependentReviewEngagement(input)` 验证内容指纹、精确护照和交付包绑定、版本有效状态及可选前序委托。
- `compareIndependentReviewScope({ baseline, candidate })` 列出发生变化的顶层范围字段，并判断新委托是否满足替代规则。
- `createIndependentReviewIndependenceAssessment(input)` 创建不可变、仅基于声明记录的独立性门禁。
- `verifyIndependentReviewIndependenceAssessment(input)` 根据精确委托、组织、职责、付款、冲突与回避重新计算门禁。
- `assertIndependentOpinionSignerEligible(input)` 在共同控制、职责重叠、结果挂钩付款或未管理冲突存在时默认阻断后续意见签署资格。
- `recalculateIndependentReviewStatistics({ delivery })` 从通过校验和验证的样本包独立推导固定统计配置下的数值。
- `createIndependentReviewRecalculation(input)` 创建七项结构检查、逐项统计比较和不可变差异登记。
- `verifyIndependentReviewRecalculation(input)` 根据精确委托、独立性评估、有效分享、交付包和提交的复算值重建全部派生结果。

## 信任边界

委托只记录约定，不证明复核方独立性。CT-617 门禁仅基于声明记录。CT-618 记录有限的结构检查与复算工作，但实现身份仍由调用方声明，有效分享记录也不是对身份或导出授权的外部证明。本包不外部核验企业控制关系，不认证复核方独立性，不执行监督重跑，不签发意见，不改变护照状态，不裁决 SLA，不形成性能声明，也不签发认证。

参见 CT-616 [委托说明](../../docs/review/engagement-and-scope-v1.zh-CN.md)、CT-617 [身份与冲突说明](../../docs/review/identity-organization-and-conflicts-v1.zh-CN.md)、CT-618 [结构检查与统计复算说明](../../docs/review/structure-and-statistical-recalculation-v1.zh-CN.md)及对应合成示例。
