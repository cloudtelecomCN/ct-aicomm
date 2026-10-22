# Evidence Query API and SDK v1

[中文](query-api-and-sdk-v1.zh-CN.md)

Status: CT-608 public contract, version 1.0.0.

## Purpose

CT-608 closes the Evidence Core phase with one portable read-only layer. It lets a
consumer list public evidence projections, fetch one exact version, and refresh
that version's point-in-time status without learning tenant identity, private
topology, storage location, credentials, or customer data.

The OpenAPI document is a contract, not a claim that a hosted endpoint already
exists. It intentionally has no `servers` entry. A deployment chooses its own
host and remains responsible for authentication, authorization, rate limiting,
retention, logging, and storage controls.

## Public operations

| Operation | Route | Contract |
|---|---|---|
| List | `GET /evidence-versions` | Stable filters and a cursor bound to the complete query |
| Exact record | `GET /evidence-versions/{evidenceId}/versions/{version}` | Exact semantic version only; no mutable `latest` alias |
| Status | `GET /evidence-versions/{evidenceId}/versions/{version}/status` | Lifecycle plus five independent status axes at `checked_at` |

The contract contains no `POST`, `PUT`, `PATCH`, or `DELETE` operation. The
status response says `cache_freshness_only: true`; HTTP cache freshness must not
be interpreted as evidence validity. CT-607 remains the downstream invalidation
and bounded-TTL contract.

## Public projection

Every query record is strict and requires `visibility: public`. It exposes:

- exact evidence ID, semantic version, content fingerprint, and publication time;
- lifecycle plus measurement, integrity, review, freshness, and policy axes;
- explicit `synthetic`, `hybrid`, or `measured` origin and limitations;
- public site labels, direction, workload class, and protocol label;
- versioned method identity and bounded metric summaries;
- HTTPS links to the exact record, status, and optional public manifest.

It never exposes tenant IDs, creators, principals, organizations, private
endpoint IDs, storage locators, export recipients, credentials, contact fields,
or raw restricted artifacts. Unknown fields fail closed instead of being
silently copied into a response.

Only a `measured` record may set `performance_claim_allowed: true`. Passing the
schema still does not prove the measurement, authenticate the publisher, or
establish independent review or certification.

## Filters and pagination

List filters cover data origin, lifecycle, every status axis, workload class,
protocol, and exact public site label. The reference SDK normalizes all filters,
sorts by publication time, evidence ID, and version, and fingerprints the full
query including page size. A cursor can be replayed only with the same normalized
query. It is an opaque pagination value, not an authorization token.

## Error model

Every JSON error has one stable envelope:

```json
{
  "schema_version": "1.0.0",
  "response_type": "evidence_query_error",
  "error": {
    "code": "not_found",
    "message": "The exact public evidence version was not found.",
    "request_id": "request-synthetic-ct608",
    "retryable": false,
    "field": null
  }
}
```

The public error does not include stack traces, SQL or object-store details,
tenant context, endpoint inventory, submitted values, or credentials. The
versioned codes are `invalid_request`, `invalid_cursor`, `version_required`,
`not_found`, `rate_limited`, `temporarily_unavailable`, `response_invalid`,
`private_field_forbidden`, and `field_unknown`.

## SDK usage

```js
import {
  buildEvidenceQueryRequest,
  getEvidenceQueryRecord,
  queryEvidenceRecords
} from "../../packages/evidence-query/index.mjs";

const page = queryEvidenceRecords(publicRecords, {
  data_origin: "synthetic",
  workload_class: "inference",
  limit: 25
});

const exact = getEvidenceQueryRecord(publicRecords, {
  evidence_id: "evidence-synthetic-ct608-a",
  version: "1.0.0"
});

const request = buildEvidenceQueryRequest({
  baseUrl: "https://evidence.example.invalid/v1/",
  operation: "get",
  evidenceId: exact.evidence_id,
  version: exact.version
});
```

`buildEvidenceQueryRequest()` returns a frozen `GET` descriptor. It performs no
network request, attaches no credential, and does not discover a production
endpoint. The caller supplies and governs its transport separately.

## Repository boundary

| Public `cloudtelecomCN/ct-aicomm` | Private service implementation |
|---|---|
| OpenAPI, JSON Schemas, types, reference filters, request descriptors, tests, synthetic examples | Identity, tenant membership, policy enforcement, private indexes, customer records, topology, credentials, deployment configuration |
| Public projection validation | Authorization before projection and audit of access decisions |
| Offline deterministic pagination | Cursor signing, abuse controls, production cache, availability, retention |

The synthetic scenario contains no real customer, endpoint, topology, or
performance data. Its values demonstrate the contract only.

## Files

- `specs/evidence/evidence-query-api-v1.openapi.json`
- `specs/evidence/evidence-query-record-v1.schema.json`
- `specs/evidence/evidence-query-status-v1.schema.json`
- `specs/evidence/evidence-query-error-v1.schema.json`
- `packages/evidence-query/index.mjs`
- `packages/evidence-query/index.d.ts`
- `examples/evidence/query-api-synthetic.mjs`
