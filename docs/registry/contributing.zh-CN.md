# Registry 贡献规范 v2

[English](contributing.md)

Registry 贡献规范 v2 定义用于提交协议元数据的公开、待审核贡献包，覆盖元数据、来源与权利、利益冲突和审核要求。预检通过仅表示贡献包具备可审核的结构，不表示协议已经获批、背书、完成性能测试、签名或发布。

## 提交贡献包

1. Fork 本仓库，将 [`examples/registry/synthetic-quic-example-v1.json`](../../examples/registry/synthetic-quic-example-v1.json) 复制为 `registry/contributions/<contribution_id>.json`。
2. 用公开且有来源依据的元数据替换合成示例；文件名必须等于 `<contribution_id>.json`。
3. 运行 `node scripts/validate-registry-contribution.mjs --files registry/contributions/<contribution_id>.json`。
4. 使用 **Registry contribution v2** 模板发起 Pull Request。只读权限的 `Registry contribution preflight` 工作流会自动预检外部 PR 中发生变化的贡献包。

更新或废弃条目时使用 `change_type: update` 或 `deprecate`，并把 `supersedes` 设置为 `protocol-id@version`；不得删除或重命名历史贡献包。

## 元数据边界

每个贡献包描述一个协议版本、类别、摘要、公开规范链接、可选的公开实现链接和互操作标签。URL 必须是公开 HTTPS 地址，不得嵌入凭据。严禁提交私网 IP、私有主机名、凭据、客户数据、私有拓扑或保密来源材料。

Registry 元数据不等于性能证据。贡献包不得包含时延、吞吐、成本、可用性或生产性能结论；可复现测量应通过 CT-Bench 证据流程提交。

## 来源与权利

每个贡献包必须提供：

- 贡献者的公开 GitHub 用户名及可选的所属机构；
- 至少一个公开来源，包括标题、发布方、类型、URL 和访问日期；
- 已知时提供 SPDX 许可证标识；需要固定来源制品时提供 SHA-256 摘要；
- 权利依据，以及“有权贡献”和“不含保密材料”的明确声明。

`link-only` 表示只记录公开引用而不复制其内容。缺失或为假的权利声明会导致预检失败。

## 利益冲突

如果雇主、厂商、顾问、投资、维护者或其他关系可能合理影响提交，应将 `declared` 设为 `true`，并说明相关主体与关系。声明利益冲突不会自动拒绝贡献，而是让维护者安排无冲突的独立审核人。`declared: false` 时关系列表必须为空。

## 审核要求

贡献者编写的贡献包必须保持 `status: pending`，同时请求 Registry 维护者和独立领域审核人，并完成元数据、来源与权利、利益冲突和技术四类检查。提交者不能批准自己的贡献包。

CODEOWNERS 会请求公开 Registry 维护者。仓库分支保护应在合并前要求预检状态和已配置的审核批准。CI 通过绝不等于发布决定。条目签名、不可变版本历史和发布验证由后续独立流程负责，不属于本 v2 接收契约。

## 预检命令

校验一个或多个文件：

```sh
node scripts/validate-registry-contribution.mjs --files registry/contributions/example-v1.json
```

校验所有已提交贡献包：

```sh
node scripts/validate-registry-contribution.mjs --all
```

版本化机器契约位于 [`specs/registry/registry-contribution-v2.schema.json`](../../specs/registry/registry-contribution-v2.schema.json)。
