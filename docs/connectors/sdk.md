# Connector SDK contract v1

Connector SDK 1.0 separates provider-specific discovery and metric collection from CT-Orchestrator's stable candidate model. An adapter supplies two callbacks: `discover(context)` returns candidate instances, and `collectMetrics(candidate, context)` returns one evidence snapshot. The SDK validates both outputs against [`connector-sdk-v1.schema.json`](../../specs/connectors/connector-sdk-v1.schema.json).

Candidates carry stable identity, HTTP(S) service and metric endpoints, location, served models, readiness, discovery time, and source revision. Metrics carry queue depth, running requests, KV-cache use, aggregate latency, health, collection time, and explicit evidence origin. Missing observations remain `null`; an adapter cannot call an incomplete snapshot `ready`.

Use `runConnectorContract` in every third-party connector test suite. It runs discovery, requires at least one fixture candidate, collects a snapshot for every candidate, and verifies the common identity and evidence boundary. [`synthetic-static-connector.mjs`](../../examples/connectors/synthetic-static-connector.mjs) is the minimal executable example. It uses documentation-only addresses and synthetic values, so it cannot support performance claims.

The contract deliberately excludes credentials, production topology, route authorization, and traffic execution. Credential-bearing URLs are rejected. An operator may authenticate inside its own callback, but returned records and logs must remain credential-free.
