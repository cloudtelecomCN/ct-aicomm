# 参与贡献

[English](CONTRIBUTING.md)

感谢你帮助改进 CT-AIComm。

## 提交变更前

1. 先提交 Issue，说明问题、证据和预期范围。
2. 让文档、Schema、示例和代码变更可以独立审核。
3. 不得提交凭据、客户数据、私有端点或专有测试数据。
4. 明确标记合成数据，不得把合成值或估算值表述为真实测量结果。
5. 基准证据必须包含来源、单位、方法、环境信息和失败样本。

安全漏洞不是普通贡献。不得在公开 Issue 或拉取请求中披露，请遵循 [SECURITY.zh-CN.md](SECURITY.zh-CN.md) 的私密流程。

## 拉取请求

- 使用聚焦的标题并说明兼容性影响。
- Schema 和代码变更应新增或更新验证。
- 同时存在中英文版本时应保持事实一致。
- 确认自己拥有提交每个文件的权利。

## 测试环境

提交拉取请求前运行不需要凭据的契约测试和可执行合成场景：

```sh
npm test
```

不需要安装依赖、GPU 节点或私有端点。运行器会从子进程移除凭据和部署变量，并禁止访问非回环网络。配置和可选容器命令参见[贡献者测试环境](docs/contributor/test-environment.zh-CN.md)。

## Registry 贡献

协议元数据遵循 [Registry 贡献规范 v2](docs/registry/contributing.zh-CN.md)。复制合成示例到 `registry/contributions/<contribution_id>.json`，保持审核状态为 pending，然后运行：

```sh
node scripts/validate-registry-contribution.mjs --files registry/contributions/<contribution_id>.json
```

外部拉取请求预检会检查元数据、公开来源、权利声明、利益冲突和审核要求。预检通过不等于批准或发布。

签名条目历史是由维护者生成的发布制品。贡献者不得添加签名私钥，也不得自行签署贡献并把它作为批准证明。公开验证密钥、签名记录和声明制品必须遵守 [Registry 条目完整性契约](docs/registry/entry-integrity.zh-CN.md)。

## 治理角色

外部 Reviewer 或 Maintainer 必须遵循[项目治理流程](GOVERNANCE.zh-CN.md)，通过公开提名、利益冲突披露、最小权限试用和定期复核。贡献历史或评论不会自动授予角色；当前角色以[机器可读名册](governance/roles.json)为准。

提交贡献即表示你同意：代码贡献采用 Apache-2.0，文档贡献采用 CC BY 4.0，文件另有说明的除外。

## 发布

只有已记录的维护者可以创建发布标签。发布变更需要同时更新 `VERSION`、`CHANGELOG.md`、`CHANGELOG.zh-CN.md` 和受支持版本表。标签必须严格为 `v<VERSION>` 并通过签名发布工作流。参见[版本验证](docs/release/verification.zh-CN.md)；不得向仓库或 CI 密钥中添加长期签名私钥。
