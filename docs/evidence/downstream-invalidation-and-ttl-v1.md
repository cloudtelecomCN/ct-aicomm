# Downstream invalidation and TTL v1

[中文](downstream-invalidation-and-ttl-v1.zh-CN.md)

Status: public contract for CT-607. This specification connects CT-602
terminal lifecycle changes to downstream caches, rankings, SLA workflows,
exports, and scheduling adapters without turning a cached state into a trust
claim.

Normative public artifacts:

- [`evidence-status-ttl-contract-v1.schema.json`](../../specs/evidence/evidence-status-ttl-contract-v1.schema.json)
- [`evidence-invalidation-event-v1.schema.json`](../../specs/evidence/evidence-invalidation-event-v1.schema.json)
- [`packages/evidence-invalidation/index.mjs`](../../packages/evidence-invalidation/index.mjs)

## Two independent invalidation paths

Every downstream projection has two fail-closed paths:

1. `evidence.expired`, `evidence.superseded`, or `evidence.revoked` immediately
   invalidates the exact tenant-scoped EvidenceVersion.
2. If no event arrives, the status lease becomes unusable at
   `ttl_expires_at`, which is the earlier of the status-check time plus the
   configured cache TTL and the evidence validity deadline.

This is an at-least-once delivery contract, not an exactly-once transport
claim. Consumers persist `event_id` and `event_fingerprint`. Repeating the same
pair is a no-op; reusing an ID with different content is an error. A newer
terminal event must advance the lifecycle sequence observed by the lease.

## TTL contract

A status lease is for one exact `tenant_id`, evidence ID, and semantic version.
It pins the source status fingerprint and lifecycle sequence, uses an HTTPS
status-query URI without embedded credentials, sets a maximum cache TTL of 24
hours, and fixes `fail_closed_on_ttl_expiry` to `true`.

`current` means only that the cache lease is still within its deadline. All
five CT-602 status axes remain independent and must still be evaluated. The
lease never means measured, reviewed, approved, authenticated, or certified.

## Terminal event rules

| CT-602 transition | CT-607 event | Downstream result |
|---|---|---|
| `published -> expired` | `evidence.expired` | Invalidate the exact version. |
| `published -> superseded` | `evidence.superseded` | Invalidate the old version and expose, but do not auto-activate, the exact replacement reference. |
| `published -> revoked` | `evidence.revoked` | Invalidate immediately; no replacement is implied. |

An invalidation event fingerprints the complete source lifecycle event. The
reference engine rejects non-terminal transitions, stale sequences, cross-
tenant or different-version delivery, invalid replacement references, unknown
fields, malformed chronology, and fingerprint changes. A verifier that has the
source lifecycle event can pass it to `verifyEvidenceInvalidationEvent` to
check the source ID, sequence, reference, transition, timestamp, replacement,
and fingerprint together.

## Offline exports

An offline export should display its export time, the lease deadline, and the
online status-query URI. After the deadline it must be presented as stale or
invalidated, even if the device never reconnects. The URI is a locator, not a
credential; production authentication and network delivery remain outside the
public module.

## Synthetic scenario

[`examples/evidence/downstream-invalidation-synthetic.mjs`](../../examples/evidence/downstream-invalidation-synthetic.mjs)
applies one supersession event twice to Marketplace, SLA, and Scheduler
projections and demonstrates TTL fallback for a disconnected export. It uses
only synthetic identifiers and makes no performance or certification claim.
