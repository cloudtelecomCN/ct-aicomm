# CT-Advisor 2.0 公开产品合同

[English](product-contract-v2.md)

## 产品类目

CT-Advisor 是 **AI 基础设施决策工作区**，采用一个产品、一个账户和一个工作区模型。

## 免费访问合同

资源发现、LLM Sizing、公开基准、成本与 TCO 估算、跨 GPU/云/地域/网络比较、约束与情景分析、Pareto 与敏感性分析、普通建议、基础 PDF/JSON/CSV 导出以及全部已发布任务模板均免费使用。

`preview`、`beta` 和 `stable` 只表示成熟度，不改变免费访问规则。

## 唯一收费包边界

唯一可能收费的能力是：

```text
GPU 决策与证据包
capability_key: gpu_preprocurement_decision_evidence_package
```

比较多个 GPU、云、地域或网络本身不触发收费。只有用户明确要求把采购前分析固化为正式包时，才进入商业流程。价格、权益授予、客户记录和交付运营不属于公开合同。

首个可申请正式包的任务是 `ai-inference-infrastructure-selection/v1`。所有任务模板仍可免费完成自助分析。

## 责任边界

CT-Advisor 提供决策支持，不保证结果全局最优，不构成合规认证或法律意见，也不会采购基础设施、部署工作负载、切换流量或执行调度决定。

## 规范性文件

- [JSON Schema](../../specs/advisor/advisor-product-contract-v2.schema.json)
- [公开合同示例](../../examples/advisor/advisor-product-contract-v2.json)

符合 Schema 只能证明结构和冻结术语正确，不会授予收费权益，也不能证明推荐结果正确。
