# 独立运行复核契约

[English](README.md)

这个零依赖 Node.js 包实现 CT-616“复核委托与范围”契约、CT-617 身份、组织与利益冲突门禁、CT-618 结构检查与统计复算记录、CT-619 监督重新运行记录，以及 CT-620 意见生命周期。CT-616 将委托绑定到一个精确的链路证据护照版本和一个已通过校验和验证的交付清单；CT-617 再把主体、实际控制、付款、职责分离、冲突与回避声明绑定到该精确委托；CT-618 要求有效的复核方分享，独立复算授权样本，应用声明容差策略，并登记每项非精确差异；CT-619 把后续监督运行和派生的七维环境差异登记绑定到精确历史包，但不声称重现了历史状态；CT-620 从已验证来源派生意见发现，并把申诉、更正和撤销保留在指纹链历史中。

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
- `compareIndependentReviewRunEnvironment(input)` 根据历史冻结和当前快照派生固定七维环境差异登记。
- `createIndependentReviewSupervisedReexecution(input)` 记录一次后续运行、完整监督窗口、事件日志指纹和环境差异。
- `verifyIndependentReviewSupervisedReexecution(input)` 重建历史绑定、时间关系、监督检查、环境分类和汇总。
- `createIndependentReviewOpinion(input)` 派生并签发一项有边界的“一致、偏差或不确定”发现。
- `createIndependentReviewOpinionEvent(input)` 追加经过角色检查的申诉、处理、更正或撤销事件。
- `projectIndependentReviewOpinion(input)` 投影当前发现，不覆盖原始意见。
- `createIndependentReviewOpinionLifecycle(input)` 把意见、完整事件历史和当前投影输出为一个带指纹账本。
- `verifyIndependentReviewOpinionLifecycle(input)` 重建全部来源与转换，包括每项更正来源。

## 信任边界

委托只记录约定，不证明复核方独立性。CT-617 门禁仅基于声明记录。CT-618 记录有限的结构检查与复算工作，CT-619 记录一次后续监督运行和环境差异，CT-620 只签发有边界且由来源派生的复核意见；实现、监督者和签署人身份仍由调用方声明，有效分享记录也不是对身份或导出授权的外部证明。本包不外部核验企业控制关系，不外部证明监督事实，不认证复核方独立性，不声称重现历史状态，不改变护照状态，不裁决 SLA，不形成性能声明，不提供法律结论，也不签发认证。

参见 CT-616 [委托说明](../../docs/review/engagement-and-scope-v1.zh-CN.md)、CT-617 [身份与冲突说明](../../docs/review/identity-organization-and-conflicts-v1.zh-CN.md)、CT-618 [结构检查与统计复算说明](../../docs/review/structure-and-statistical-recalculation-v1.zh-CN.md)、CT-619 [监督重新运行说明](../../docs/review/supervised-reexecution-and-environment-differences-v1.zh-CN.md)、CT-620 [意见生命周期说明](../../docs/review/opinion-appeal-correction-withdrawal-v1.zh-CN.md)及对应合成示例。
