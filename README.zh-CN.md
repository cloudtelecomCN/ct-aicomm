# CT-AIComm

[English](README.md)

CT-AIComm 是 CloudTelecom 面向 AI 训练与推理通信场景构建的开放、证据优先的通信操作系统项目。本仓库是 CT-AIComm 公共资料与未来开源代码的统一入口。

## 当前公开内容

- [文档与资源索引](docs/README.zh-CN.md)
- [离线贡献者测试环境](docs/contributor/test-environment.zh-CN.md)
- [中文白皮书](docs/whitepaper/README.zh-CN.md)
- [CT-Bench 复现与证据规范](docs/bench-reproduction/README.zh-CN.md)
- [TTFT 样本 v1 JSON Schema](docs/bench-reproduction/ttft-sample.schema.json)
- [CT-Bench 复现 CLI](packages/bench-reproduce/)
- [vLLM Connector 兼容矩阵 v1](docs/connectors/vllm.zh-CN.md)
- [Connector SDK 契约 v1](docs/connectors/sdk.zh-CN.md)
- [Agent 协议 SDK v1](docs/agent/protocol-sdk.zh-CN.md)
- [Registry 贡献规范 v2](docs/registry/contributing.zh-CN.md)
- [Registry 条目签名与版本历史](docs/registry/entry-integrity.zh-CN.md)
- [公开 SDK 边界](sdk/README.zh-CN.md)
- [开源发布清单](docs/governance/open-source-release-manifest.zh-CN.md)
- [版本验证与 SBOM](docs/release/verification.zh-CN.md)
- [变更记录](CHANGELOG.zh-CN.md)
- [Agent 控制与遥测 Schema](specs/agent/)
- [POC 环境冻结契约](docs/poc/environment-freeze.zh-CN.md)
- [真实基线采集门禁](docs/poc/baseline-collection.zh-CN.md)
- [真实仅实例调度实验](docs/poc/instance-scheduling-experiment.zh-CN.md)
- [CT-DSL v1 JSON Schema](specs/ct-dsl/ct-dsl-v1.schema.json)
- [CT-DSL 示例](examples/ct-dsl/)
- [CT-DSL 参考包](packages/ct-dsl/)与[版本策略](docs/ct-dsl/versioning.zh-CN.md)
- [OpenAPI 3.1 合约](api/openapi.yaml)
- [白皮书 PDF](assets/whitepaper/)

## 公开边界

目录记录不等于基准结果，合成演示不等于真实测量，策略建议不等于执行授权，准备材料也不等于外部认证。仓库中的合成数据始终使用明确标记，不得作为真实生产性能声明。

公开 SDK、Agent 协议、遥测 Schema、CT-Bench 采集器、CT-DSL、Registry 贡献与签名历史验证、示例和校验工具已按仓库许可证以源码发布。其他模块将在公开评审后继续加入。网站部署配置、凭证、签名私钥、客户数据、私有拓扑、受限 POC 原始样本和内部运营材料不属于公开范围。

## 项目链接

- 官网：[cloudtelecom.cn](https://cloudtelecom.cn/)
- 英文站：[cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)
- 安全问题：参见 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)
- 参与贡献：参见 [CONTRIBUTING.md](CONTRIBUTING.md)
- 公开版本：[已签名 GitHub Releases](https://github.com/cloudtelecomCN/ct-aicomm/releases)

## 许可

源代码采用 [Apache License 2.0](LICENSE)，文档及媒体采用 [CC BY 4.0](LICENSE-DOCUMENTATION.md)，文件另有说明的除外。
