# vLLM Connector request correlation

`RequestCorrelationLedger` binds every lifecycle event to an immutable `request_id`, `trace_id`, and inference instance. The accepted lifecycle is:

```text
request_started -> response_headers -> first_token -> completed
request_started -> [response_headers] -> failed
```

The ledger rejects identity changes, time regression, duplicate milestones, out-of-order events, and events after completion or failure. This record is the correlation boundary between the OpenAI-compatible request, first-token observation, selected instance, and error result.

`normalizeVllmMetrics` parses the official `/metrics` Prometheus format and normalizes waiting requests, running requests, KV-cache usage, and aggregate TTFT, queue, and inference latency. Missing required metrics produce a `degraded` snapshot with `null` values; aggregate histogram data is never presented as per-request evidence.

`discoverStatic` and `discoverEndpointSlices` normalize operator-managed manifests and labeled Kubernetes EndpointSlices. Only explicitly labeled, Ready Kubernetes endpoints are returned. Duplicate identities, conflicting endpoints, missing region/model metadata, and unsupported protocols are rejected before an instance can become a routing candidate.
