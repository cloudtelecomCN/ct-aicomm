# Evidence status and lifecycle v1

[中文](status-and-lifecycle-v1.zh-CN.md)

CT-602 defines the append-only lifecycle and five independent status axes for
Evidence Core. The normative event contract is
[`specs/evidence/evidence-lifecycle-event-v1.schema.json`](../../specs/evidence/evidence-lifecycle-event-v1.schema.json),
and the reference engine is
[`packages/evidence-lifecycle/index.mjs`](../../packages/evidence-lifecycle/index.mjs).

## Non-collapsing status model

Every lifecycle event contains complete `from.status_axes` and
`to.status_axes` objects. A consumer must display and evaluate all five axes:

| Axis | Forward transitions within one EvidenceVersion |
|---|---|
| Measurement validity | `unknown` may become `partial`, `sufficient`, or `invalid`; `partial` may become `sufficient` or `invalid`; `sufficient` may become `invalid`; `invalid` is terminal. |
| Content integrity | `unverifiable` may become `passed` or `failed`; `passed` may become `failed`; `failed` is terminal. |
| Independent review | `not-reviewed` may become `in-progress`; `in-progress` may become `consistent`, `deviation`, or `uncertain`; each conclusion is terminal for that version. |
| Freshness | `unknown` may become `valid`, `expiring`, or `expired`; `valid` may become `expiring` or `expired`; `expiring` may become `expired`; `expired` is terminal. |
| Policy decision | `manual-review` may become `accepted` or `rejected`; `accepted` may become `rejected`; `rejected` is terminal. |

An unfavorable terminal axis needs a new EvidenceVersion or a separate new
decision/review object; it cannot be rewritten in place. The status projection
returns every axis and each blocking condition. It deliberately returns
`single_status_allowed: false` and `certification_issued: false`.

## Lifecycle

```text
draft -> validating -> sealed -> published -> expired
                   \              -> superseded
                    \             -> revoked
                     -> draft (validation failed)
```

The exact transitions and reason codes are:

| From | To | Reason code | Authorized actor role |
|---|---|---|---|
| `draft` | `validating` | `validation_requested` | owner, operator |
| `validating` | `draft` | `validation_failed` | validator |
| `validating` | `sealed` | `validation_passed` | validator |
| `sealed` | `published` | `publication_authorized` | publisher |
| same non-terminal state | same state | `status_changed` | reviewer, policy-consumer, system, operator |
| `published` | `expired` | `validity_elapsed` | system, operator |
| `published` | `superseded` | `replacement_published` | publisher |
| `published` | `revoked` | `revocation_authorized` | publisher, operator |

`expired`, `superseded`, and `revoked` are terminal. A superseding event must
pin a higher exact Semantic Version for the same evidence ID and tenant. An
expiration event must set freshness to `expired` in the same event.

## Immutability boundary

Sealing does not mutate the EvidenceVersion later. Review, freshness, policy,
replacement, and revocation changes are appended as ordered events. The engine
rejects duplicate or discontinuous sequences, stale timestamps, mismatched
references, unknown fields, backward status moves, invalid role/reason pairs,
and no-op status events.

CT-602 verifies deterministic transition semantics only. CT-603 adds content
fingerprints and offline manifest verification. CT-607 adds durable event
delivery, idempotent downstream consumption, and TTL invalidation.

## Stable error codes

The module exports `EVIDENCE_LIFECYCLE_ERROR_CODES`. Callers should branch on
`error.code`, not message text. Error families cover invalid input, unknown or
missing fields, references, lifecycle state and transition, terminal state,
reason and actor authorization, time and sequence, history continuity, axis
state and transition, no-op updates, and replacement requirements.

## Synthetic example

[`examples/evidence/lifecycle/history.synthetic.json`](../../examples/evidence/lifecycle/history.synthetic.json)
passes through draft, validation, sealing, publication, review progress, and
expiration. It remains `partial`, `unverifiable`, and finally `uncertain`; the
published state never hides those limitations. It contains no customer data or
measured production result.
