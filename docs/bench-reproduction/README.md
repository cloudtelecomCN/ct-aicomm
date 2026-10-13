# CT-Bench reproduction and evidence contract

CT-Bench defines a stable evidence package for communication measurements. A package contains:

- `report.json`: methodology, explicit data origin, complete environment, fingerprint, sample policy, and aggregate metrics.
- `raw-samples.csv`: stable raw sample fields, including retained failures.
- `SHA256SUMS`: hashes for exported artifacts.

For inference TTFT, [`ttft-sample.schema.json`](ttft-sample.schema.json) defines the canonical per-request record. It separates ingress, connector, routing, network, inference queue, and model execution time while binding every observation to a route, environment fingerprint, methodology, and collector version. Successful observations require `ttft_ms`; failed observations retain a machine-readable stage and code.

[`synthetic-ttft-sample.json`](synthetic-ttft-sample.json) is contract test data only. Validate the published contract without installing dependencies:

```sh
node scripts/validate-ttft-contract.mjs
```

The canonical CSV header is:

```text
sample_id,ttft_ms,connection_setup_ms,success,failure_code
```

Failed samples must remain present with a machine-readable `failure_code`. Successful samples must contain a non-negative `ttft_ms`. Synthetic and measured runs share a schema but must remain explicitly separated by `data_origin`.

This directory publishes the report and environment schemas plus a clearly labeled synthetic example. It does not claim that the example represents measured network performance. The runnable packaging tool will be published here when its source release review is complete.
