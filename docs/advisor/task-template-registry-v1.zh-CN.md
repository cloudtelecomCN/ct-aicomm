# CT-Advisor 任务模板注册表 v1

[English](task-template-registry-v1.md)

## 目的

注册表为每个 CT-Advisor 任务提供稳定键、语义版本、成熟度、启停状态、免费访问声明和合成合同夹具。它是公开术语的权威来源；租户、工作区和运营控制由私有服务执行。

## 身份与版本

- 模板 ID：`<template-key>/v<major>`
- 模板版本：完整语义版本，例如 `1.0.0`
- 输入或输出含义发生破坏性变化时，必须创建新的主版本模板 ID。
- 次版本和修订版本变更必须保持主版本合同兼容。

## 成熟度

- `preview`：可体验，但字段或覆盖范围可能变化。
- `beta`：主要流程在明确支持边界内可用。
- `stable`：合同与基础行为稳定，但不保证结果。

成熟度不改变访问规则，全部已发布模板继续免费。

## 启停

`default_enabled` 记录发布默认值，`enabled` 与 `state_reason` 描述注册表快照。停用模板仍可发现，使已有项目能够解释为什么暂时不能新建运行。未知模板 ID 和未知运营覆盖配置必须默认拒绝。

停用不会创建付费墙，也不授权删除已有项目数据。

## 夹具与责任边界

每个模板绑定一个合成夹具。夹具验证身份、成熟度、启用状态和 `execution_authorized=false`，不构成性能结果。全部模板使用 `decision_support_only`，不能采购资源、部署工作负载、切换流量或执行调度决定。

## 规范性文件

- [注册表 Schema](../../specs/advisor/task-template-registry-v1.schema.json)
- [夹具 Schema](../../specs/advisor/task-template-fixtures-v1.schema.json)
- [注册表示例](../../examples/advisor/task-template-registry-v1.json)
- [合成夹具](../../examples/advisor/task-template-fixtures-v1.json)
