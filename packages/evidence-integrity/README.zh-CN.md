# 证据内容完整性

这个零依赖 ESM 模块实现 CT-603 的内容指纹、规范 manifest、
`SHA256SUMS` 和 Evidence Core 包离线验证。

```js
import { verifyEvidenceContentBundle } from "./index.mjs";

const result = verifyEvidenceContentBundle({
  manifestBytes,
  checksumsBytes,
  files,
  expectedManifestFingerprint: trustedFingerprint
});
```

验证器保护每个已声明对象的全部字节和全部 JSON 字段，并拒绝未知 manifest
字段、重复或不安全路径、非规范 JSON、缺失或额外文件、对象身份漂移、校验和
漂移以及与外部固定 manifest 指纹不一致的内容。

完整性不等于真实性。结果始终把真实性、授权、独立复核和认证标记为 false。
使用 API 或 CLI 前请阅读[规范说明](../../docs/evidence/content-integrity-v1.zh-CN.md)。
