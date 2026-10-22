# Tenant export authorization and download audit v1

[中文](tenant-export-authorization-v1.zh-CN.md)

Status: public contract for CT-606. This contract turns an Evidence Core
`ExportGrant` into a fail-closed, tenant-scoped authorization decision and an
append-only delivery audit record. It is designed for an authoritative service
to call before exporting selected evidence fields.

## Trust boundary

The public module is a deterministic policy engine, not an identity provider,
object store, or download service. It does not authenticate a principal, fetch
private evidence, issue a URL or token, transmit bytes, validate legal authority,
or certify a result.

An authoritative deployment must supply:

- the current immutable `ExportGrant` from its trusted tenant store;
- the tenant, principal, organization, purpose, exact versioned resource, and
  requested JSON Pointer fields from the export request;
- a SHA-256 fingerprint of the authenticated request context; and
- the same fingerprint as an external trusted anchor, obtained independently
  from the authenticated gateway or authorization service.

If that anchor is absent or differs, the public engine denies the request. A
matching fingerprint proves only that the two caller-supplied contexts agree;
the event therefore keeps `principal_authentication_verified: false`.

## Fail-closed decision

`evaluateEvidenceExportRequest()` allows a request only when all checks pass:

1. ledger, grant, request, resource, and grant resources belong to one tenant;
2. the grant is `active`, its visibility is `shared`, and its recipient
   organization is included in `authorization_scope.recipients`;
3. the request time is on or after grant creation and strictly before the
   earliest declared expiry;
4. principal and organization match the named recipient exactly;
5. purpose and exact versioned resource match the grant; and
6. every requested JSON Pointer is either an allowed pointer or its descendant.

Pointer matching is segment-aware: `/boundary` authorizes
`/boundary/data_origin`, but never `/boundaryOther`. Unknown fields, duplicate
pointers, malformed timestamps, and malformed fingerprints are rejected before
a decision is appended.

A denial records all applicable machine-readable reason codes. Cross-tenant and
out-of-scope field attempts are audit events, not silent failures.

## Delivery audit

An allowed decision has `download_performed: false`. The transport layer may
later call `recordEvidenceExportDelivery()` exactly once with either:

- `delivered`, a positive byte count, and the exported content fingerprint; or
- `failed`, zero bytes, and a non-sensitive error code.

A successful delivery must occur before authorization expiry. The audit record
contains no export bytes, source values, storage locator, download URL,
credential, cookie, bearer token, or signing key. It retains only bounded
metadata and fingerprints.

Every event commits to the preceding event fingerprint. Reusing the same event
ID with the same request is idempotent; reusing it for different input fails.
This detects local mutation and truncation when the expected head is retained,
but it is not a digital signature or external transparency log.

## Public API

```js
import {
  createEvidenceExportAuditLedger,
  evaluateEvidenceExportRequest,
  recordEvidenceExportDelivery,
  verifyEvidenceExportAuditLedger
} from "@cloudtelecom/ct-aicomm-sdk";
```

`verifyEvidenceExportAuditLedger()` verifies canonical event structure,
fingerprints, chain order, authorization-to-delivery linkage, and the one-receipt
rule. Its result deliberately reports principal authentication, transport
attestation, and certification as `false`.

## Example

Run the synthetic, dependency-free scenario:

```sh
node examples/evidence/export-authorization-synthetic.mjs
```

The fixture contains no customer data and makes no measured-performance claim.
Production services must additionally enforce tenant database isolation, current
revocation state, authenticated identity, download rate limits, storage access,
and retention policy.
