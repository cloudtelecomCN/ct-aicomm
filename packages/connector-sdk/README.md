# Connector SDK 1.0

The zero-dependency Connector SDK defines one public boundary for inference candidate discovery and metrics adaptation. `createConnectorAdapter` binds a stable adapter identity and SemVer release to `discover` and `collectMetrics` callbacks. Every returned record is normalized, validated, sorted, and frozen before it can enter CT-Orchestrator.

`runConnectorContract` is the reusable contract-test entry point. A fixture passes only when it exposes at least one unique candidate and a valid metric snapshot for every candidate. The contract rejects credential-bearing URLs, identity mismatches, duplicate candidates, optimistic defaults for missing metrics, and synthetic or hybrid evidence without limitations.

The SDK does not fetch infrastructure by itself, authorize traffic changes, or infer missing values. Credentials may be used inside an operator-owned callback, but they must never be returned in candidates, metrics, fixtures, or logs.

Run the public example:

```sh
node examples/connectors/synthetic-static-connector.mjs
```

The example is explicitly synthetic and cannot support a performance claim.
