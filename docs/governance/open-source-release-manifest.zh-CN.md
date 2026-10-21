# 开源发布清单

[CT-545 清单](../../specs/release/open-source-release-manifest-v1.json)是 `cloudtelecomCN/ct-aicomm` 的权威机器可读公开边界。其[版本化 Schema](../../specs/release/open-source-release-manifest-v1.schema.json)把资产分为三类：

- **public_now（当前可公开）**：已经批准进入本仓库的源码、契约、测试、文档和证据回执；
- **deferred（延后公开）**：计划开源，但兼容性、隔离、打包或签名门禁尚未完成的资产；
- **prohibited（禁止公开）**：凭据、私有基础设施、合作方数据、受限原始样本和批准记录，不存在直接公开路径。

每类资产都必须有具名职能负责人、明确许可证、分类理由和发布门禁。验证器会枚举 Git 跟踪的每个文件，并要求它只匹配一条 `public_now` 规则；如果延后或禁止路径进入版本控制，同样会失败。

运行：

```bash
node scripts/validate-open-source-release-manifest.mjs
node --test tests/open-source-release-manifest.test.mjs
```

新增顶层资产而不更新清单会阻断发布。资产从延后转为公开前，必须满足清单中的门禁，并完成安全、隐私、来源和许可权审查。禁止公开的材料只能转化为经过独立审核的合成示例或仅含校验和的回执；仅改名不能使其成为可公开资产。
