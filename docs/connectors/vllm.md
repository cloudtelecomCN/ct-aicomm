# vLLM connector compatibility v1

The first connector release targets the vLLM OpenAI-compatible server. The machine-readable contract is [`../../specs/connectors/vllm-compatibility-v1.json`](../../specs/connectors/vllm-compatibility-v1.json).

## Frozen support range

| vLLM version | Status | Behavior |
|---|---|---|
| 0.31.x | Primary | Full compatibility checks and release validation |
| 0.30.x | Compatible | Same contract, covered by compatibility tests |
| 0.29.x | Probe only | Discovery allowed; automatic route changes disabled |
| Earlier or newer | Unsupported | Preserve the original route and report the version mismatch |

This range is deliberately narrow. vLLM publishes frequently and documents that backward compatibility is guaranteed for only a limited number of minor releases. A new minor version must pass the connector compatibility suite before this matrix changes.

## Measurement boundary

Per-request TTFT is measured from the monotonic timestamp taken after request bytes are committed until the first non-empty streamed content delta. Prometheus histograms provide aggregate cross-checks; they are never represented as individual request observations.

The minimum aggregate metric set is:

- `vllm:time_to_first_token_seconds`
- `vllm:request_queue_time_seconds`
- `vllm:request_inference_time_seconds`

Missing metrics do not produce invented values. The target becomes `degraded`, unavailable fields are omitted, the original route remains active, and automatic execution is disabled.

## Source references

- [vLLM production metrics](https://docs.vllm.ai/en/latest/usage/metrics/)
- [vLLM releases](https://github.com/vllm-project/vllm/releases)
- [vLLM release and compatibility policy](https://github.com/vllm-project/vllm/blob/main/RELEASE.md)
