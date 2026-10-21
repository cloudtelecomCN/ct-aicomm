# Registry 条目完整性 1.0

[English](README.md)

这个零依赖 Node.js 包用于创建和验证受摘要约束、由 Ed25519 签名的 Registry 条目版本。每个版本都会绑定已审核贡献、审核回执、协议快照、声明的制品哈希、发布序号和上一版本的条目摘要。

```js
import { verifyRegistryEntryHistory } from "./index.mjs";

const result = verifyRegistryEntryHistory(history.records, {
  publicKeys,
  artifactBytesByPath
});
```

元数据被修改、制品缺失或变化、密钥未知、签名无效、版本被删除或乱序、序号中断、贡献重复或前序摘要链断裂时，验证都会失败。只有在查看元数据时才可传入 `requireArtifacts: false`，此时结果会明确返回 `artifacts_verified: false`。

`createRegistryEntryRecord` 只在调用时接收 Ed25519 私钥，用于离线发布工具。本仓库不包含任何生产签名私钥；提交的示例只包含明确标记为合成验证用途的公开测试密钥。密钥保管、轮换、撤销和发布授权仍由运营方负责。

运行 `node scripts/verify-registry-history.mjs` 可验证仓库内的合成版本历史。验证通过只证明所提供记录的完整性和连续性，不代表协议质量、基准性能或生产适用性获得认证。
