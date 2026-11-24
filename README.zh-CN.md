# CT-AIComm 开放接口

[English](README.md)

CT-AIComm 是 CloudTelecom 面向 AI 的通信与跨域协同操作系统。本仓库仅包含公共互操作层：

- 版本化的证据、Agent 调用和 Registry Schema；
- 只读公共 API 合同；
- Connector 接口与一致性工具；
- 确定性的合成示例；
- 公共架构和集成文档。

## 不包含的内容

CT-AIComm Enterprise 的决策、评分、路由、执行、回滚、商业优化、多租户运行时、部署配置、客户数据、校准数据、权重和阈值均为专有组件，不包含在本仓库中。

本仓库不是 CT-AIComm Enterprise 的开发源。所有公开内容必须经过明确白名单导出和独立复核。

## 快速验证

需要 Node.js 22 或更高版本。

```sh
npm test
npm run verify:example
```

仓库内示例全部为合成数据。通过 Schema 或一致性检查，不代表测量有效、方案最优、获得执行授权、取得认证或具备生产就绪性。

## 公共资源

- [产品公开与私有边界](docs/public-boundary.zh-CN.md)
- [公共架构](docs/architecture.zh-CN.md)
- [只读 OpenAPI 合同](openapi/public-api-v0.2.yaml)
- [证据对象 Schema](schemas/evidence/evidence-object-v1.schema.json)
- [Agent 调用证据 Schema](schemas/agent/agent-call-evidence-v1.schema.json)
- [Registry 贡献 Schema](schemas/registry/registry-contribution-v2.schema.json)
- [Connector 接口](adapters/connector-sdk/index.mjs)

## 项目链接

- 网站：[cloudtelecom.cn](https://cloudtelecom.cn/)
- 英文网站：[cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)
- 安全报告：[SECURITY.md](SECURITY.md)

## 许可

公开源文件采用 Apache-2.0，文档默认采用 CC BY 4.0。许可仅适用于本仓库实际发布的文件，不授予对 CT-AIComm Enterprise 专有组件的访问权或其他权利。
