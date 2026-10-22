# 租户导出授权与下载审计 v1

[English](tenant-export-authorization-v1.md)

状态：CT-606 公开契约。本契约把 Evidence Core `ExportGrant` 转换为默认
拒绝的租户范围授权决策和追加式交付审计记录，供权威服务在导出指定证据
字段之前调用。

## 信任边界

公开模块是确定性策略引擎，不是身份提供方、对象存储或下载服务。它不会
认证主体、读取私有证据、签发链接或令牌、传输字节、判断法律授权或签发
认证结论。

权威部署必须提供：

- 从可信租户存储读取的当前不可变 `ExportGrant`；
- 导出请求中的租户、主体、组织、用途、精确版本资源和 JSON Pointer 字段；
- 已认证请求上下文的 SHA-256 指纹；
- 由认证网关或授权服务独立取得、与上述指纹对应的外部可信锚。

可信锚缺失或不一致时，公开引擎拒绝请求。指纹一致只说明调用方提供的两份
上下文一致，并不能证明公开引擎完成了身份认证，因此事件始终保留
`principal_authentication_verified: false`。

## 默认拒绝决策

`evaluateEvidenceExportRequest()` 仅在以下检查全部通过时允许请求：

1. 台账、grant、请求、资源以及 grant 所列资源属于同一租户；
2. grant 状态为 `active`、可见性为 `shared`，且接收方组织列在
   `authorization_scope.recipients` 中；
3. 请求时间不早于 grant 创建时间，并严格早于全部声明到期时间中的最早值；
4. 主体和组织与指定接收方完全一致；
5. 用途和精确版本资源与 grant 完全一致；
6. 每个请求字段都是获准 JSON Pointer 本身或其下级字段。

Pointer 匹配以完整路径段为边界：`/boundary` 可以授权
`/boundary/data_origin`，但绝不会授权 `/boundaryOther`。未知字段、重复
Pointer、非法时间和非法指纹会在记录决策前直接拒绝。

拒绝事件会记录全部适用的机器可读原因码。跨租户访问和越权字段请求都会
进入审计链，而不是静默失败。

## 交付审计

允许决策仍标记 `download_performed: false`。传输层随后最多调用一次
`recordEvidenceExportDelivery()`，记录以下结果之一：

- `delivered`：正整数发送字节数和导出内容指纹；
- `failed`：零字节和不含敏感信息的错误码。

成功交付必须发生在授权到期前。审计记录不包含导出字节、源值、存储定位、
下载 URL、凭据、Cookie、Bearer Token 或签名私钥，只保存受限元数据和指纹。

每个事件都承诺前一事件指纹。相同事件 ID 和相同请求可幂等重放；相同 ID
对应不同输入会失败。在保留预期链头时，这能检测本地篡改和截断，但不等同
于数字签名或外部透明日志。

## 公开 API

```js
import {
  createEvidenceExportAuditLedger,
  evaluateEvidenceExportRequest,
  recordEvidenceExportDelivery,
  verifyEvidenceExportAuditLedger
} from "@cloudtelecom/ct-aicomm-sdk";
```

`verifyEvidenceExportAuditLedger()` 校验规范事件结构、指纹、链顺序、授权与
交付关联以及单次回执约束。其结果会明确把主体认证、传输证明和认证签发
报告为 `false`。

## 示例

运行不依赖外部服务的合成场景：

```sh
node examples/evidence/export-authorization-synthetic.mjs
```

示例不包含客户数据，也不声明实测性能。生产服务还必须实施租户数据库隔离、
当前撤销状态检查、身份认证、下载限流、存储访问控制和保留策略。
