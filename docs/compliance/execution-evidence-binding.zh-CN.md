# 执行证据绑定模型 v1

[English](execution-evidence-binding.md)

CT-556 为一次执行实际使用的策略、Agent 构建版本、选定路由、Trace Bundle 和环境指纹建立一个不可变绑定。验证方必须提供权威的当前执行上下文；不能仅因绑定文件内部校验和正确就接受它。

## 强制边界

- 每个组件的 `tenant_id` 必须与绑定记录一致。
- 路由和 Trace 证据还必须携带相同的 `execution_id`。
- 每个组件必须提供不可变 ID、版本和 SHA-256 指纹。
- `lock_fingerprint` 覆盖租户、执行和五类组件引用。
- `binding_fingerprint` 覆盖完整记录，包括证据来源和创建时间。
- 验证时逐项对比调用方权威上下文中的 ID、版本和指纹，任何不一致都默认拒绝。

验证器会拒绝缺少期望上下文、跨租户、跨执行、组件版本变化、组件指纹变化、未知字段或绑定内容被修改的情况。因此，即使某份策略或 Trace 本身有效，也不能被静默挪作其他租户或软件版本的证据。

## 公开契约

- Schema：[`../../specs/compliance/execution-evidence-binding-v1.schema.json`](../../specs/compliance/execution-evidence-binding-v1.schema.json)
- 参考实现：[`../../packages/compliance/evidence-binding.mjs`](../../packages/compliance/evidence-binding.mjs)
- 类型声明：[`../../packages/compliance/evidence-binding.d.ts`](../../packages/compliance/evidence-binding.d.ts)
- 合成示例：[`../../examples/compliance/synthetic-execution-evidence-binding.json`](../../examples/compliance/synthetic-execution-evidence-binding.json)

```js
import { verifyExecutionEvidenceBinding } from "@cloudtelecom/ct-aicomm-sdk";

const result = verifyExecutionEvidenceBinding(binding, activeContext);
```

`activeContext` 必须来自经过身份认证的租户和执行记录查询，不能从待验证的绑定文件中复制。

## 证据边界

验证通过只说明引用元数据完整且与精确上下文一致，不证明底层事件真实发生、人工审批成立、来源制品内容真实或已取得外部认证。签名审计包、证据缺口分析、留存规则和法规映射由后续 CT-Auditor 任务分别实现。
