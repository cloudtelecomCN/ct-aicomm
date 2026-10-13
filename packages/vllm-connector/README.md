# vLLM Connector request correlation

`RequestCorrelationLedger` binds every lifecycle event to an immutable `request_id`, `trace_id`, and inference instance. The accepted lifecycle is:

```text
request_started -> response_headers -> first_token -> completed
request_started -> [response_headers] -> failed
```

The ledger rejects identity changes, time regression, duplicate milestones, out-of-order events, and events after completion or failure. This record is the correlation boundary between the OpenAI-compatible request, first-token observation, selected instance, and error result.
