# Local import and run preflight v1

Status: public working contract for CT-610. Version: `1.0.0`.

CT-610 adds a mandatory local import and preflight gate between a planned Link
Evidence Passport run and the `started` state. A failed preflight cannot start
a run; the same applies when it is expired, mismatched, or missing. The original
plan remains immutable and `planned` after every rejected attempt.

## Contracts

1. [`local-run-import-v1.schema.json`](../../specs/passport/local-run-import-v1.schema.json)
   binds the exact planned run and scenario-method freeze to a local payload
   fingerprint.
2. [`run-preflight-v1.schema.json`](../../specs/passport/run-preflight-v1.schema.json)
   records five gate inputs, deterministic results, blockers, and a freshness
   deadline.
3. [`index.mjs`](../../packages/link-evidence-passport/index.mjs) implements the
   zero-dependency reference evaluator and the only public start transition.

The local import accepts validated objects already in memory. It performs no
file or network access and deliberately retains no source path, raw payload, or
credential. `payload_fingerprint` identifies the caller-supplied local package
without publishing it.

## Five mandatory gates

| Gate | Pass condition |
|---|---|
| Authorization | Exact tenant, principal, action, run, and freeze are allowed; the grant is active, not revoked, and covers the complete planned window. |
| Clock | The clock check is synchronized, fresh, and inside its declared skew bound. |
| Budget | Tenant and run match; estimated minor-unit cost fits inside the uncommitted limit and the budget remains valid through the run window. |
| Concurrency | Tenant and run match; the source-fingerprinted fresh snapshot has capacity for all requested slots. |
| Stop conditions | Hard `max-duration`, `max-failures`, and `budget-exhausted` stop rules are present and safe. |

Expected operational failures produce an immutable preflight with
`decision: "failed"`; they do not masquerade as malformed input and do not
mutate the run. Stable blocker codes include `authorization_denied`,
`clock_skew_exceeded`, `budget_exceeded`, `concurrency_exceeded`, and
`stop_condition_unsafe`.

## Freshness and start invariant

The evaluator derives `valid_until` as the earliest of:

- the planned run end;
- authorization expiry;
- budget expiry;
- clock-check freshness expiry; and
- concurrency-snapshot freshness expiry.

`startPassportRun()` requires the exact plan, freeze, local import, and passed
preflight. Their tenant IDs, versions, and content fingerprints must all match.
The caller must name the same execution principal authorized by the preflight.
The requested start instant must be no earlier than evaluation and no later
than `valid_until`. There is no exported unchecked start path.

## Integrity and authority boundary

All records use deterministic SHA-256 content fingerprints and strict closed
objects. That detects accidental or malicious record changes; it is not an
identity signature. A production host must authenticate the principal and
verify the authorization source before supplying its fingerprint. This public
contract does not contact an authorization service, reserve money, acquire a
runtime slot, execute a benchmark, certify a result, or make a performance
claim.

The public repository contains schemas, evaluator code, types, documentation,
and synthetic examples. Real grants, customer identities, endpoint addresses,
budgets, credentials, and operational snapshots remain in authorized private
systems.

## Offline example

```bash
node examples/passport/local-import-preflight-synthetic.mjs
```

The example creates one passed and one budget-failed preflight. Only the passed
record can start its synthetic run. It uses no credentials or external network
and its output explicitly disallows performance and certification claims.
