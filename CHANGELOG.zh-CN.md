# 变更记录

CT-AIComm 的重要公开变更均记录在此文件中。带标签的公开版本遵循[语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [0.1.0] - 2026-10-22

### 新增

- 公开 API、SDK、CT-DSL、Registry、Agent 控制、遥测及 Connector 契约。
- 可复现 CT-Bench 证据 Schema、合成示例和离线贡献者场景。
- 以源码发布的 CT-DataPlane Agent 与 vLLM Connector 参考实现，并明确执行和证据边界。
- Registry 贡献来源、签名条目历史验证和独立审核契约。
- 双语安全报告、贡献、运维和治理文档。
- 每个标签版本均提供确定性源码包、SPDX 2.3 源码 SBOM、SHA-256 清单、Sigstore 无密钥签名包和 GitHub 构建来源证明。

### 证据边界

- 本版本包含合成示例和软件契约，不包含真实生产性能测量，也不得据此宣称生产性能。
- 策略建议、准备材料和测试通过不等于执行授权、外部认证或真实生产运行成功。

[0.1.0]: https://github.com/cloudtelecomCN/ct-aicomm/releases/tag/v0.1.0
