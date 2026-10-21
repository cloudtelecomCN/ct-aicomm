# vLLM Connector 兼容矩阵 v1

首版 Connector 面向 vLLM OpenAI 兼容服务。机器可读契约位于 [`../../specs/connectors/vllm-compatibility-v1.json`](../../specs/connectors/vllm-compatibility-v1.json)。

该厂商实现同时遵循统一的 [Connector SDK 契约 v1](sdk.zh-CN.md)。`createVllmConnectorAdapter` 接受运营方自有的发现和指标加载回调，再由公共 SDK 校验每个候选实例与指标快照。

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

## 可复现探针

在能够访问推理端点的主机上运行：

```bash
node scripts/probe-vllm-compatibility.mjs --endpoint http://127.0.0.1:8000 --model Qwen/Qwen2.5-7B-Instruct
```

探针核验 `/version`、`/metrics`、`/v1/models`、有效的 SSE 分帧和首个非空流式增量。输出只包含端点 SHA-256 身份，不披露端点本身。只有 `ready` 状态允许自动执行。

## 官方依据

- [vLLM 生产指标](https://docs.vllm.ai/en/latest/usage/metrics/)
- [vLLM Releases](https://github.com/vllm-project/vllm/releases)
- [vLLM 发布与兼容政策](https://github.com/vllm-project/vllm/blob/main/RELEASE.md)
