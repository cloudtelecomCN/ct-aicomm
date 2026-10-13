# vLLM Connector 兼容矩阵 v1

首版 Connector 面向 vLLM OpenAI 兼容服务。机器可读契约位于 [`../../specs/connectors/vllm-compatibility-v1.json`](../../specs/connectors/vllm-compatibility-v1.json)。

## 冻结支持范围

| vLLM 版本 | 状态 | 行为 |
|---|---|---|
| 0.31.x | 主版本 | 完整兼容检查和发布验证 |
| 0.30.x | 兼容 | 使用同一契约并纳入兼容测试 |
| 0.29.x | 仅探测 | 允许发现，但禁用自动切流 |
| 更早或更新版本 | 不支持 | 保持原路由并报告版本不匹配 |

该范围有意保持收敛。vLLM 发布频繁，官方兼容政策只保证有限数量的 minor 版本。每个新 minor 版本必须先通过 Connector 兼容测试，才能修改此矩阵。

## 测量边界

逐请求 TTFT 使用单调时钟测量：从请求字节提交完成，到收到第一个非空流式内容增量。Prometheus 直方图只用于聚合交叉验证，绝不转换成单请求观测。

最低聚合指标集合：

- `vllm:time_to_first_token_seconds`
- `vllm:request_queue_time_seconds`
- `vllm:request_inference_time_seconds`

指标缺失时不得虚构数值。目标状态降级为 `degraded`，省略不可用字段，保持原路由，并禁用自动执行。

## 官方依据

- [vLLM 生产指标](https://docs.vllm.ai/en/latest/usage/metrics/)
- [vLLM Releases](https://github.com/vllm-project/vllm/releases)
- [vLLM 发布与兼容政策](https://github.com/vllm-project/vllm/blob/main/RELEASE.md)
