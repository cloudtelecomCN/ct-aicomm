# CT-Advisor 正式证据包离线验证规范 v1

[English](formal-evidence-package-verification-v1.md)

CT-668 发布冻结版 CT-Advisor GPU 决策与证据包格式的零依赖 Node.js 验证器。验证器免费公开，不包含客户数据、权益判断、价格、签名私钥、私有评分配置，也不包含生成客户正式交付物的商业服务。

## 验证范围

验证器校验确定性 ZIP 的精确字节，并拒绝：

- 缺失、额外、重复、绝对路径、路径穿越、反斜杠、NUL、目录或符号链接条目；
- 加密、压缩、分卷、ZIP64、数据描述符、额外字段、注释、重叠或 CRC 错误；
- 非规范或不兼容的 manifest、profile、语义版本、制品顺序、媒体类型和 D01-D13 文件集合；
- ZIP、`manifest.json` 与 `SHA256SUMS` 之间的字节数或 SHA-256 不一致；
- 错误的外部 `<package-id>.zip.sha256` 侧车摘要；
- 不完整或校验和错误的 D12 完整退出包；
- 覆盖范围与交付载荷不一致的 D11 非循环预检记录。

外层 ZIP 使用按路径规范排序的无压缩文件条目。`SHA256SUMS` 覆盖 `manifest.json` 和 D01-D09、D11-D13 的全部载荷。D10 描述聚合容器，因此没有自身文件条目。完整 ZIP 的摘要必须置于包外，manifest 与 ZIP 都不会声称对自身做摘要。

## D11 非循环边界

D11 是组包阶段对 D11 之外载荷文件的预检，明确排除 D10、D11、`manifest.json`、`SHA256SUMS` 和外层 ZIP。随后由公开验证器校验 D11、manifest、校验和、ZIP 结构与外部侧车，从而避免文件“验证自己”。

## 命令行

```bash
node scripts/verify-advisor-evidence-package.mjs \
  advisor_evidence_package_<uuid>.zip \
  --sha256 advisor_evidence_package_<uuid>.zip.sha256
```

可使用 `--package-id` 和 `--contract-id` 把验证绑定到预期上下文。成功结果遵循 `specs/advisor/formal-evidence-package-verification-v1.schema.json`。

## 安全与声明边界

验证成功只能证明归档完整性、格式兼容性、包内声明的快照状态，以及调用方提供时的精确上下文。它不证明来源真实性、签署人身份、商业权益、签发权限、认证、法律合规、性能、最优性、执行授权或当前在线撤销状态。

manifest 状态为 `revoked` 时返回 `revoked_as_packaged`；其他状态返回 `snapshot_only_not_live_checked`。出现新包修订或撤销记录后，历史归档字节仍保留并可审计。
