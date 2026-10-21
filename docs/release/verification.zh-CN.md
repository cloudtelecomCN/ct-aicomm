# 验证公开版本

[English](verification.md)

CT-AIComm 的每个公开标签版本都由 GitHub Actions 从对应标签构建。Release 同时提供源码包、SPDX 2.3 源码 SBOM、机器可读发布清单、SHA-256 校验清单、Sigstore 无密钥签名包和 GitHub 构建来源证明。

项目版本记录在 [`VERSION`](../../VERSION) 中。根目录 `package.json` 属于私有、零依赖的贡献者测试运行器，其版本号不是项目发布版本。

## 下载与验证

安装 [GitHub CLI](https://cli.github.com/) 和 [Cosign](https://docs.sigstore.dev/cosign/system_config/installation/) 后执行：

```bash
TAG=v0.1.0
gh release download "$TAG" --repo cloudtelecomCN/ct-aicomm --dir "ct-aicomm-$TAG"
cd "ct-aicomm-$TAG"
sha256sum --check SHA256SUMS
cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/cloudtelecomCN/ct-aicomm/.github/workflows/release.yml@refs/tags/$TAG" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  SHA256SUMS
gh attestation verify "ct-aicomm-$TAG-source.tar.gz" --repo cloudtelecomCN/ct-aicomm
```

校验和通过表示下载文件与签名清单一致；Cosign 验证通过表示校验清单由本仓库对应标签的 Release 工作流签发；GitHub Attestation 则独立证明源码包摘要来自 GitHub 托管构建。

## 检查证据边界

使用制品前应阅读 `release-manifest-v0.1.0.json`。除非未来版本包含通过独立审核的真实测量证据，否则 `measured_production_performance_included` 和 `performance_claim_allowed` 始终为 `false`。合成示例不得表述为真实性能。

SBOM 清点标签提交中的全部 Git 跟踪源码，但不表示所有文件采用同一许可证。适用许可应以 `LICENSE`、`LICENSE-DOCUMENTATION.md` 和[开源发布清单](../governance/open-source-release-manifest.zh-CN.md)为准。

## 维护者发布门禁

维护者应在同一个审核提交中更新 `VERSION`、两份变更记录和 `SECURITY.md` 支持版本表。标签必须严格为 `v<VERSION>` 并指向该提交。发布工作流拒绝脏工作区、版本不匹配或无标签源码，也不保存长期签名私钥。
