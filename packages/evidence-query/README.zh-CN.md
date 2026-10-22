# Evidence Query SDK

[English](README.md)

这个零依赖 CT-608 模块定义 Evidence Core 公开投影的可移植只读查询层：
校验记录、执行确定性筛选和游标分页、强制精确版本、生成状态视图，并构造
与传输实现无关的 `GET` 请求描述。

```js
import {
  buildEvidenceQueryRequest,
  getEvidenceQueryRecord,
  queryEvidenceRecords
} from "./index.mjs";
```

SDK 只接受 `visibility` 为 `public` 的记录。未知字段会被拒绝；租户 ID、
主体身份、存储位置、凭据、端点和联系信息都不属于公开投影。SDK 不负责
认证调用方、授权私有证据、发现生产服务、签署响应或颁发认证。

`buildEvidenceQueryRequest()` 不执行网络访问，也不会构造写请求。实际部署
必须自行确定服务器地址、认证授权、限流、留存和存储控制。HTTP 缓存仍然
新鲜，只代表响应缓存未过期，不代表证据有效。
