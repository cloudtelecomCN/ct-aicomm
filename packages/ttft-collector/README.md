# CT-Bench TTFT baseline collector

This zero-dependency Node.js collector sends one streaming request to an existing vLLM OpenAI-compatible endpoint without changing its route. It records end-to-end TTFT and client-observable timings using a monotonic clock.

```sh
node packages/ttft-collector/cli.mjs \
  --endpoint=http://127.0.0.1:8000 \
  --model=your-model \
  --prompt="Explain deterministic benchmarking." \
  --environment-fingerprint=sha256:YOUR_64_HEX_DIGEST
```

Set `VLLM_API_KEY` when the endpoint requires authentication. The key is sent in the Authorization header and is never written to the sample.

The collector deliberately emits `null` with source `unavailable` for queue, network, routing, and model segments it cannot observe. Later Connector and server instrumentation may supply those fields; this baseline collector never invents them.
