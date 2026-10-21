# Agent 协议 SDK 1.0

这个零依赖包按照 [`control-protocol-v1.schema.json`](../../specs/agent/control-protocol-v1.schema.json) 构造并验证公开的 CT-DataPlane Agent 控制消息，提供注册、策略准备、策略应用、策略撤销和关联回执的类型化构造器。

构造器会拒绝未知输入字段、非法身份、非 SemVer Agent 版本、错误指纹、重复或不支持的能力、已过期准备、非法版本号，以及操作与回执状态不匹配。默认在本地生成随机消息 ID 和 nonce；测试时可显式传入确定性值。

SDK 只负责序列化与关联验证，不包含凭据签发机构、信任根、生产密钥、传输客户端、端点发现、策略审批或网络变更回调。消息格式有效不等于获得执行授权。认证、授权、重放存储和 mTLS 传输仍由运营方控制，不属于这个公开包。

运行合成生命周期示例：

```sh
node examples/agent/protocol-sdk.mjs
```

TypeScript 类型声明位于 [`index.d.ts`](index.d.ts)。该包当前以源码分发，未发布到 npm Registry。
