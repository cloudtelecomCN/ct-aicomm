# 审计包 v1

[English](audit-package.md)

CT-558 定义一个可确定性生成、可离线验证的审计包，把同一租户、工作负载和执行对应的数据路径声明、审批记录、执行记录与回滚记录绑定在一起。它能够暴露证据缺失和字节级篡改，同时不会把生产凭据或私有基础设施带入公开 SDK。

## 目录契约

```text
audit-package/
|-- manifest.json
|-- SHA256SUMS
`-- artifacts/
    |-- declaration.json
    |-- approval.json
    |-- execution.json
    `-- rollback.json
```

`manifest.json` 使用规范化 JSON，并按上述顺序精确列出四类制品。每个描述项锁定制品 ID、媒体类型、Schema 版本、证据来源、源指纹字段、SHA-256 摘要和字节长度。`SHA256SUMS` 覆盖清单及全部制品。参考工具会拒绝多余、缺失、重复、非规范化、符号链接或路径穿越内容。

## 复跑合成示例

```bash
node scripts/build-audit-package.mjs \
  examples/compliance/synthetic-audit-package-source/descriptor.json \
  /tmp/ct-audit-package

node scripts/verify-audit-package.mjs /tmp/ct-audit-package \
  --tenant tenant-synthetic-alpha \
  --workload workload-inference-synthetic \
  --execution execution-synthetic-001
```

生成器只接受本地 JSON 输入，并且只写入不存在或为空的输出目录。源文件路径必须位于描述文件目录以内。验证器会先扫描完整包目录，再拒绝任何未登记文件。

仓库中的 [`synthetic-audit-package`](../../examples/compliance/synthetic-audit-package/) 由 [`synthetic-audit-package-source`](../../examples/compliance/synthetic-audit-package-source/) 生成，仅用于契约测试。其中的审批和回滚记录描述的是合成演练，不代表生产变更。

## SDK API

```js
import { createAuditPackage, verifyAuditPackage } from "@cloudtelecom/ct-aicomm-sdk";

const built = createAuditPackage({
  packageId,
  tenantId,
  workloadId,
  executionId,
  artifacts
});

const result = verifyAuditPackage({
  manifestBytes: built.manifestBytes,
  checksumsBytes: built.checksumsText,
  files: built.files,
  expectedContext: {
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId
  }
});
```

`expectedContext` 必须来自经过身份认证的权威记录系统，不能直接复制待验证审计包中的值。

## 公开契约

- Schema：[`../../specs/compliance/audit-package-manifest-v1.schema.json`](../../specs/compliance/audit-package-manifest-v1.schema.json)
- 参考实现：[`../../packages/compliance/audit-package.mjs`](../../packages/compliance/audit-package.mjs)
- 类型声明：[`../../packages/compliance/audit-package.d.ts`](../../packages/compliance/audit-package.d.ts)
- 生成器：[`../../scripts/build-audit-package.mjs`](../../scripts/build-audit-package.mjs)
- 验证器：[`../../scripts/verify-audit-package.mjs`](../../scripts/verify-audit-package.mjs)

## 证据边界

验证通过只证明所提供审计包内部完整、字节一致，并且可选地与调用方提供的标识符匹配。校验和不是签名：能够替换全部文件的攻击者也能重新计算全部校验和。因此 v1 固定返回 `authenticity_verified: false`、`authorization_verified: false` 和 `legal_or_certification_conclusion: false`。可信签名、身份校验、留存策略和法规结论需要独立控制。

如需应用明确的新鲜度、冲突和已验证签名要求，请使用 [CT-559 证据缺口检测](evidence-gap-detection.zh-CN.md)。仅通过审计包完整性检查不能产生 `requirements_satisfied` 结果。
