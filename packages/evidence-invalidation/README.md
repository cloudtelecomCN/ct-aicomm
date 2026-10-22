# Evidence downstream invalidation

[中文](README.zh-CN.md)

This zero-dependency CT-607 reference module turns CT-602 terminal lifecycle
events into fingerprinted, at-least-once invalidation events and enforces a
bounded status-cache TTL for downstream products.

```js
import {
  consumeEvidenceInvalidationEvent,
  createEvidenceDownstreamProjection,
  createEvidenceInvalidationEvent,
  createEvidenceTtlContract,
  evaluateEvidenceDownstreamTtl
} from "./index.mjs";
```

Duplicate delivery of the same event is idempotent. Reuse of an event ID with
different content fails closed. A consumer that misses every event still
invalidates its local projection at `ttl_expires_at`; it must obtain a new
authoritative lease before treating the version as current again.

`current` means only that the cached status lease has not expired. It does not
mean valid, reviewed, authorized, certified, or suitable for scheduling. The
module does not publish to a broker, authenticate a status endpoint, fetch
customer data, or attest that any consumer received an event.
