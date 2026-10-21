# vLLM connector compatibility v1

The first connector release targets the vLLM OpenAI-compatible server. The machine-readable contract is [`../../specs/connectors/vllm-compatibility-v1.json`](../../specs/connectors/vllm-compatibility-v1.json).

The provider implementation also conforms to the shared [Connector SDK contract v1](sdk.md). `createVllmConnectorAdapter` accepts operator-owned discovery and metric-loading callbacks, while the common SDK validates every candidate and metric snapshot.

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

## Reproducible probe

Run the compatibility probe from a host that can reach the inference endpoint:

```bash
node scripts/probe-vllm-compatibility.mjs --endpoint http://127.0.0.1:8000 --model Qwen/Qwen2.5-7B-Instruct
```

The probe verifies `/version`, `/metrics`, `/v1/models`, valid server-sent event framing, and a first non-empty streamed delta. It emits only a SHA-256 endpoint identity, not the endpoint itself. `ready` is the only state that permits automatic execution.

## Source references

- [vLLM production metrics](https://docs.vllm.ai/en/latest/usage/metrics/)
- [vLLM releases](https://github.com/vllm-project/vllm/releases)
- [vLLM release and compatibility policy](https://github.com/vllm-project/vllm/blob/main/RELEASE.md)
