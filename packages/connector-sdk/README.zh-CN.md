# Connector SDK 1.0

零依赖 Connector SDK 为推理候选实例发现和指标适配定义统一公开边界。`createConnectorAdapter` 将稳定的适配器标识、SemVer 版本与 `discover`、`collectMetrics` 回调绑定。任何记录进入 CT-Orchestrator 前都会被规范化、校验、排序并冻结。

`runConnectorContract` 是可复用的契约测试入口。测试夹具只有在提供至少一个唯一候选实例，并为每个候选实例生成有效指标快照时才会通过。契约会拒绝携带凭据的 URL、身份不一致、重复候选实例、为缺失指标填入乐观默认值，以及未声明限制条件的合成或混合证据。

SDK 本身不扫描基础设施、不授权流量变更，也不推断缺失值。运营方可在自有回调内部使用凭据，但候选实例、指标、测试夹具和日志都不得返回凭据。

运行公开示例：

```sh
node examples/connectors/synthetic-static-connector.mjs
```

示例明确标记为合成数据，不能用于性能声明。
