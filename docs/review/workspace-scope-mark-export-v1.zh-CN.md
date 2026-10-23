# 独立运行复核工作区、范围化标识与导出 v1

[English](workspace-scope-mark-export-v1.md)

CT-621 将 CT-616 至 CT-620 的记录组织成买方可查看、可导出的有限只读视图。它不创建托管租户、不认证用户、不持久化客户数据，也不签发认证；这些运营职责属于私有商业工作区。

## 公开记录

公开契约定义三类不可变记录：

1. `independent_review_workspace_snapshot` 把精确的复核委托、独立性评估、统计复算、可选监督重跑和当前意见生命周期呈现为六个工作流步骤。
2. `independent_review_scope_mark` 展示复核机构、意见日期、精确 Passport 与交付范围、结论和所有必须显示的限制。
3. `independent_review_workspace_export_manifest` 将工作区、标识、人类可读边界说明和校验和绑定成五文件离线包。

每条记录均绑定租户并带有内容指纹。工作区只是只读模型，不执行控制动作，也不持久化客户数据。

## 范围化标识资格

只有经验证的意见生命周期当前为 `issued` 或 `corrected`，且不存在未关闭申诉时，才能创建范围化标识。正在申诉、等待更正或撤销、或者已经撤销的意见都会阻断标识创建。已撤销工作区仍保留完整历史，但不能生成新的有效标识。

它是范围化意见标识，不是“通过徽章”。标识始终显示机构、日期、范围、结论和限制：

- 声明的复核机构；
- 意见生效日期；
- 复核级别、精确 Passport 版本和预定用途；
- 当前由来源派生的结论；
- 明确限制：不是认证、法律建议、SLA 裁决或性能保证。

机器可读限制还会说明：身份未经认证、组织控制关系和导出授权未经外部核验、复核方独立性未经认证、历史状态未被重现。

## 离线导出

`createIndependentReviewWorkspaceExport()` 生成：

```text
README.md
SHA256SUMS
manifest.json
scope-mark.json
workspace.json
```

`verifyIndependentReviewWorkspaceExport()` 在不访问网络的情况下核验精确文件集合、SHA-256、记录指纹和引用关系。该精简导出明确不包含原始样本、客户标识、凭据、私有存储位置或来源复核记录，因此只能验证包完整性，不能复核底层工作。需要复核来源的接收方必须另行取得经过授权的 CT-616 至 CT-620 记录与证据包。

## 公开 API

- `createIndependentReviewWorkspace(input)` 从完整验证的意见生命周期派生工作区。
- `verifyIndependentReviewWorkspace(input)` 根据精确来源记录重建并核验工作区。
- `createIndependentReviewScopeMark(input)` 仅在当前生命周期符合条件时创建标识。
- `verifyIndependentReviewScopeMark(input)` 根据已验证工作区与来源重建标识。
- `createIndependentReviewWorkspaceExport(input)` 创建五文件精简包。
- `verifyIndependentReviewWorkspaceExport({ files })` 离线核验包完整性。

## 信任边界

CT-621 不认证主体，不外部核验企业控制关系，不确立导出授权，不附加可信签名，不认证复核方独立性，不重现历史状态，不保证性能，不裁决 SLA，不提供法律结论，也不签发认证。机构名称只是与精确意见签署组织绑定的声明展示值。生产身份、授权、存储、留存、撤销送达和客户访问必须由私有托管或客户管理的工作区实现。

运行合成、离线示例：

```bash
node examples/review/workspace-scope-mark-synthetic.mjs
```
