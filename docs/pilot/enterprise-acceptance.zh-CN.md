# 企业试点验收包

CT-533 为 CT-AIComm 试点定义一份可审核协议。机器可读契约位于 [`../../specs/pilot/enterprise-pilot-acceptance-v1.schema.json`](../../specs/pilot/enterprise-pilot-acceptance-v1.schema.json)，不可用于性能声明的合成模板位于 [`../../examples/pilot/synthetic-enterprise-pilot.json`](../../examples/pilot/synthetic-enterprise-pilot.json)。

## 必须事先约定

部署前，双方必须冻结业务问题、范围内与范围外服务、日期、环境指纹、RACI 责任、指标定义、目标比较方式、最低样本量、必需证据、执行控制、数据处理和退出负责人。指标必须明确测量对象，运行后不得用营销表述替换。

试点从 `observe_only` 开始，必须具备人工批准、具名变更窗口和可用回滚路径。自动执行只能发生在明确列出的范围；安装成功或策略建议都不构成执行授权。

## 数据边界

验收包把允许遥测与禁止收集的凭据、载荷、Prompt、客户标识和未批准拓扑分离。传输与静态加密、角色访问、导出审批、留存周期、可验证删除和证据摘要均属于验收条件，而不是可选备注。

## 验收与退出

状态设为 `accepted` 必须具备实测证据、客户与提供方审批人、独立审核引用和不可变证据摘要。合成模板必须保持 `draft` 与 `pending`，校验结果中的 `performance_claim_allowed` 为 `false`。

试点结束或触发安全条件时，应恢复基线、卸载 Agent、导出获批证据包、删除受限工作数据、关闭临时访问并记录完成状态。有保留或拒绝结论必须保留例外，不能改写成无条件性能声明。
