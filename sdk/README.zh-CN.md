# CT-AIComm 公开 SDK 边界

这个零依赖 ESM 入口只导出 [`../specs/public-api-v1.json`](../specs/public-api-v1.json) 中列明的版本化公开协议与证据工具。可直接从源码检出目录导入：

```js
import { normalizeNetworkTelemetry, validateControlMessage } from "./sdk/index.mjs";
```

SDK 只校验并规范化调用方提供的证据，不包含凭据、不发现私有基础设施、不授权执行、不挂载 eBPF 程序，也不会把合成数据表述为实测数据。版本 `0.2.0` 新增 Connector SDK 1.0 的候选实例与指标适配契约；当前以源码分发，尚未发布到 npm Registry。

使用 `node examples/sdk/validate-public-evidence.mjs` 运行示例。使用 `node packages/ttft-collector/cli.mjs --endpoint=URL --model=MODEL --prompt=TEXT --environment-fingerprint=sha256:...` 采集一次客户端可观测 TTFT；凭据只能通过 `VLLM_API_KEY` 提供。

第三方 Connector 开发者可从 `examples/connectors/synthetic-static-connector.mjs` 开始，并在自己的测试套件中调用 `runConnectorContract`。契约通过只证明记录结构与证据边界符合要求，不代表获得流量执行授权，也不构成性能认证。
