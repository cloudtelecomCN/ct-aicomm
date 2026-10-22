# 证据下游失效传播

[English](README.md)

这个零依赖 CT-607 参考模块把 CT-602 生命周期终态事件转换为带指纹、至少投递
一次的失效事件，并为下游产品强制执行有上限的状态缓存 TTL。

```js
import {
  consumeEvidenceInvalidationEvent,
  createEvidenceDownstreamProjection,
  createEvidenceInvalidationEvent,
  createEvidenceTtlContract,
  evaluateEvidenceDownstreamTtl
} from "./index.mjs";
```

同一事件重复投递是幂等的；同一事件 ID 携带不同内容时默认拒绝。即使下游丢失
所有事件，本地投影也会在 `ttl_expires_at` 到期时失效；在再次把该版本视为当前
状态前，必须取得新的权威状态租约。

`current` 只表示缓存状态租约尚未到期，不代表证据有效、已复核、已授权、已认证
或适合调度。本模块不负责向消息代理发布事件、不认证状态查询端点、不读取客户
数据，也不证明任何下游已经收到事件。
