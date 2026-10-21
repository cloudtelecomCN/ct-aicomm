# CT-AIComm public SDK boundary

This zero-dependency ESM entry point exposes only the versioned public protocol and evidence helpers listed in [`../specs/public-api-v1.json`](../specs/public-api-v1.json). Import directly from a source checkout:

```js
import { normalizeNetworkTelemetry, validateControlMessage } from "./sdk/index.mjs";
```

The SDK validates and normalizes caller-supplied evidence. It does not contain credentials, discover private infrastructure, authorize execution, attach eBPF programs, or claim that synthetic data is measured. Version `0.1.0` is source-distributed and is not an npm registry publication.

Run the example with `node examples/sdk/validate-public-evidence.mjs`. Run one measured client-side TTFT observation with `node packages/ttft-collector/cli.mjs --endpoint=URL --model=MODEL --prompt=TEXT --environment-fingerprint=sha256:...`; provide credentials only through `VLLM_API_KEY`.
