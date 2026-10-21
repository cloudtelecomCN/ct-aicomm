# vLLM Connector request correlation

`RequestCorrelationLedger` binds every lifecycle event to an immutable `request_id`, `trace_id`, and inference instance. The accepted lifecycle is:

```text
request_started -> response_headers -> first_token -> completed
request_started -> [response_headers] -> failed
```

The ledger rejects identity changes, time regression, duplicate milestones, out-of-order events, and events after completion or failure. This record is the correlation boundary between the OpenAI-compatible request, first-token observation, selected instance, and error result.

`normalizeVllmMetrics` parses the official `/metrics` Prometheus format and normalizes waiting requests, running requests, KV-cache usage, and aggregate TTFT, queue, and inference latency. Missing required metrics produce a `degraded` snapshot with `null` values; aggregate histogram data is never presented as per-request evidence.

`discoverStatic` and `discoverEndpointSlices` normalize operator-managed manifests and labeled Kubernetes EndpointSlices. Only explicitly labeled, Ready Kubernetes endpoints are returned. Duplicate identities, conflicting endpoints, missing region/model metadata, and unsupported protocols are rejected before an instance can become a routing candidate.

`ConnectorCircuitBreaker` fails closed on missing metrics, fetch failures, and unsuccessful recovery probes. Any degraded observation immediately preserves the original route and disables automatic route changes. Repeated failures open the circuit; after cooldown, exactly a probe-only half-open state can recover it. Every degradation, open, and recovery transition produces a structured alert.

`evaluateVllmCompatibility` applies the frozen version matrix together with metrics and streaming-interface checks. Primary and compatible versions become `ready` only when every required check passes. Probe-only, unknown, incomplete, and unsupported targets preserve the original route and cannot receive automatic execution.
