# CT-Bench reproduction and evidence contract

CT-Bench defines a stable evidence package for communication measurements. A package contains:

- `report.json`: methodology, explicit data origin, complete environment, fingerprint, sample policy, and aggregate metrics.
- `raw-samples.csv`: stable raw sample fields, including retained failures.
- `SHA256SUMS`: hashes for exported artifacts.

New TTFT runs use [`environment-fingerprint-v2.schema.json`](environment-fingerprint-v2.schema.json), which adds structured accelerator, runtime, vLLM, model artifact, kernel BPF, interface, route, container, and configuration evidence. Environment v1 remains published for existing packages.

For inference TTFT, [`ttft-sample.schema.json`](ttft-sample.schema.json) defines the canonical per-request record. It separates ingress, connector, routing, network, inference queue, and model execution time while binding every observation to a route, environment fingerprint, methodology, and collector version. Successful observations require `ttft_ms`; failed observations retain a machine-readable stage and code.

The frozen experiment design and prompt dataset are documented in [TTFT methodology v1](ttft-methodology.md).

[`synthetic-ttft-sample.json`](synthetic-ttft-sample.json) is contract test data only. Validate the published contract without installing dependencies:

```sh
node scripts/validate-ttft-contract.mjs
```

The canonical CSV header is:

```text
sample_id,ttft_ms,connection_setup_ms,success,failure_code
```

Failed samples must remain present with a machine-readable `failure_code`. Successful samples must contain a non-negative `ttft_ms`. Synthetic and measured runs share a schema but must remain explicitly separated by `data_origin`.

The [evidence authenticity gate](../../packages/evidence-gate/README.md) also recognizes `hybrid` observations. Import, aggregation, downloads, APIs, and pages must preserve its fixed origin labels. Cross-origin aggregation is rejected, and only complete `measured` evidence may permit a performance claim.

This directory publishes the report and environment schemas plus a clearly labeled synthetic example. It does not claim that the example represents measured network performance. The runnable packaging tool will be published here when its source release review is complete.
