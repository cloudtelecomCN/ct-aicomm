# Registry 条目签名与版本历史

[English](entry-integrity.md)

Registry 条目完整性 v1 将审核通过的元数据贡献转换为可独立验证的版本记录。创建 Ed25519 签名前，记录会绑定协议快照、来源贡献摘要、审核回执摘要、声明制品、发布序号和上一版本摘要。

## 验证模型

1. 使用 `ct-aicomm-json-v1` 对闭合条目对象做确定性规范化。
2. 计算条目的 SHA-256 摘要。
3. 对同时绑定条目摘要、规范化方式、Ed25519 key ID、Schema 版本和发布时间的载荷签名。
4. 重新读取每个声明制品并核对 SHA-256。
5. 验证连续序号、严格递增的 SemVer 和发布时间、唯一贡献 ID，以及上一版本摘要链接。

运行仓库中的双版本合成历史：

```sh
node scripts/verify-registry-history.mjs
```

内容篡改、制品篡改或缺失、未知密钥、错误签名、版本删除或乱序、序号中断、贡献重复以及前序摘要链断裂都会导致失败。`requireArtifacts: false` 只用于查看元数据，返回结果会明确说明制品未验证。

## 密钥边界

公开 keyring 只包含 Ed25519 公钥，提交的密钥明确仅用于合成示例。生产私钥必须保存在离线签名器或受管 HSM/KMS 中，绝不能进入本仓库、CI 变量、日志、网站 bundle 或贡献包。密钥轮换可以使用新的 `key_id`，条目摘要链仍会保留历史；密钥撤销和发布授权仍属于独立运营控制。

签名只证明完整性和签名者持有对应密钥，不代表协议质量、基准性能、法律批准或生产适用性。版本化机器契约位于 [`specs/registry/registry-entry-record-v1.schema.json`](../../specs/registry/registry-entry-record-v1.schema.json)，源码包位于 [`packages/registry-entry-integrity/`](../../packages/registry-entry-integrity/)。
