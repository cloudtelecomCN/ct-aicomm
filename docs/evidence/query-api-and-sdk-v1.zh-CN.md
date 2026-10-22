# 证据查询 API 与 SDK v1

[English](query-api-and-sdk-v1.md)

状态：CT-608 公开契约，版本 1.0.0。

## 目的

CT-608 用一套可移植的只读层完成 Evidence Core 阶段。消费方可以列出公开
证据投影、读取一个精确版本，并刷新该版本的时点状态；查询结果不会泄露
租户身份、私有拓扑、存储位置、凭据或客户数据。

OpenAPI 文件是接口契约，不代表一个托管端点已经上线，因此有意不声明
`servers`。实际部署自行选择主机，并负责认证、授权、限流、留存、日志和
存储控制。

## 公开操作

| 操作 | 路由 | 契约 |
|---|---|---|
| 列表 | `GET /evidence-versions` | 稳定筛选；游标与完整查询条件绑定 |
| 精确记录 | `GET /evidence-versions/{evidenceId}/versions/{version}` | 只接受精确语义版本，不提供可变的 `latest` 别名 |
| 状态 | `GET /evidence-versions/{evidenceId}/versions/{version}/status` | 返回 `checked_at` 时点的生命周期与五个独立状态轴 |

契约中不存在 `POST`、`PUT`、`PATCH` 或 `DELETE`。状态响应明确包含
`cache_freshness_only: true`，HTTP 缓存仍然新鲜不等于证据仍然有效。
下游失效与有界 TTL 仍由 CT-607 契约处理。

## 公开投影

每条查询记录都采用严格字段，并要求 `visibility: public`。允许公开：

- 精确证据 ID、语义版本、内容指纹和发布时间；
- 生命周期以及测量、完整性、复核、新鲜度和策略五轴状态；
- 明确的 `synthetic`、`hybrid` 或 `measured` 来源与限制；
- 公开站点标签、方向、工作负载类别和协议标签；
- 版本化方法身份和有界指标摘要；
- 精确记录、状态与可选公开 manifest 的 HTTPS 链接。

禁止公开租户 ID、创建人、主体、组织、私有端点 ID、存储位置、导出接收方、
凭据、联系信息和受限原始制品。未知字段默认拒绝，不能静默复制进响应。

只有 `measured` 记录才可以把 `performance_claim_allowed` 设为 `true`。
即使通过 Schema，也不证明测量真实，不认证发布者，也不形成独立复核或认证。

## 筛选与分页

列表可以按数据来源、生命周期、每个状态轴、工作负载类别、协议和精确公开
站点标签筛选。参考 SDK 会规范化全部条件，按发布时间、证据 ID 和版本稳定
排序，并对包含页大小的完整查询做指纹。游标只能与同一规范化查询一起重放。
游标只是分页值，不是授权令牌。

## 错误模型

所有 JSON 错误使用同一个稳定信封：

```json
{
  "schema_version": "1.0.0",
  "response_type": "evidence_query_error",
  "error": {
    "code": "not_found",
    "message": "未找到精确的公开证据版本。",
    "request_id": "request-synthetic-ct608",
    "retryable": false,
    "field": null
  }
}
```

公开错误不包含调用栈、SQL 或对象存储细节、租户上下文、端点清单、提交值或
凭据。版本化错误码为 `invalid_request`、`invalid_cursor`、
`version_required`、`not_found`、`rate_limited`、
`temporarily_unavailable`、`response_invalid`、
`private_field_forbidden` 和 `field_unknown`。

## SDK 使用

```js
import {
  buildEvidenceQueryRequest,
  getEvidenceQueryRecord,
  queryEvidenceRecords
} from "../../packages/evidence-query/index.mjs";

const page = queryEvidenceRecords(publicRecords, {
  data_origin: "synthetic",
  workload_class: "inference",
  limit: 25
});

const exact = getEvidenceQueryRecord(publicRecords, {
  evidence_id: "evidence-synthetic-ct608-a",
  version: "1.0.0"
});

const request = buildEvidenceQueryRequest({
  baseUrl: "https://evidence.example.invalid/v1/",
  operation: "get",
  evidenceId: exact.evidence_id,
  version: exact.version
});
```

`buildEvidenceQueryRequest()` 只返回冻结的 `GET` 描述，不执行网络请求、
不附带凭据，也不发现生产端点。调用方单独提供并治理传输实现。

## 仓库边界

| 公开仓库 `cloudtelecomCN/ct-aicomm` | 私有服务实现 |
|---|---|
| OpenAPI、JSON Schema、类型、参考筛选、请求描述、测试和合成示例 | 身份、租户成员关系、策略执行、私有索引、客户记录、拓扑、凭据和部署配置 |
| 公开投影校验 | 投影前授权与访问决定审计 |
| 离线确定性分页 | 游标签名、滥用控制、生产缓存、可用性和留存 |

合成场景不包含真实客户、端点、拓扑或性能数据，其中数值只用于演示契约。

## 文件

- `specs/evidence/evidence-query-api-v1.openapi.json`
- `specs/evidence/evidence-query-record-v1.schema.json`
- `specs/evidence/evidence-query-status-v1.schema.json`
- `specs/evidence/evidence-query-error-v1.schema.json`
- `packages/evidence-query/index.mjs`
- `packages/evidence-query/index.d.ts`
- `examples/evidence/query-api-synthetic.mjs`
