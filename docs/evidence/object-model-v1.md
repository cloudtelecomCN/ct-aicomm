# Evidence Core object model v1

[中文](object-model-v1.zh-CN.md)

CT-601 defines the public, vendor-neutral object vocabulary shared by CT-AIComm evidence products. It gives Link Evidence Passport, review, SLA, scheduling, residency, and public benchmark workflows one stable interchange boundary instead of separate data models.

The normative contract is [`specs/evidence/evidence-object-v1.schema.json`](../../specs/evidence/evidence-object-v1.schema.json). It uses JSON Schema Draft 2020-12 and validates one object at a time.

## Trust boundary

Schema conformance proves only that a document has the declared structure. It does not prove that:

- a measurement happened;
- an observation is accurate;
- a reviewer is independent;
- an export was authorized by an authoritative service;
- a policy outcome is correct; or
- a product, organization, link, or environment is certified.

Those claims require separate runtime context, authorization, integrity verification, review, and customer acceptance. The checked-in examples are deterministic synthetic fixtures and do not authorize performance claims.

## Common envelope

Every object carries the following fields. Object-specific IDs use the same rules but retain distinct names such as `scope_id` or `run_id`.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | string | Contract version. v1 objects use `1.0.0`. |
| `object_type` | enum | One of the nine object discriminators. |
| object-specific ID | string | Stable identifier within its tenant and object type. |
| `version` | SemVer string | Immutable version of this object. |
| `tenant_id` | string | Tenant boundary asserted by the document; services must still authorize it. |
| `created_by` | string | Principal identifier asserted as the creator. |
| `created_at` | UTC date-time | Creation instant with a trailing `Z`. |
| `authorization_scope` | object | Intended visibility, purpose, recipients, and expiry. It is not an access token. |

`additionalProperties` is `false` for every object and nested structured object. Unknown fields are rejected rather than silently retained. New fields require a versioned schema release.

## Object dictionary

### Scope

Freezes the question being examined: sites, logical endpoints, direction, purpose, validity window, and workload class. A bidirectional claim cannot be inferred from a unidirectional Scope.

### Method

Freezes the tool and artifact fingerprint, typed parameters, sampling plan, exclusions, requested statistics, and environment prerequisites. A material method change creates a new version.

### Run

Records one planned and actual execution window, pinned Scope and Method references, environment fingerprint, workload origin, clock condition, terminal status, and exit reason. Failed and cancelled runs remain representable.

### Observation

Records a metric value with unit, observation point, sample count, origin, quality, aggregation, and limitations. `measured`, `synthetic`, `inferred`, and `declared` are separate origins and must not be promoted implicitly.

### Artifact

Describes a content-addressed log, configuration, method file, report, or sample file. It records media type, SHA-256 fingerprint, size, logical storage locator, classification, and derivation references. The locator is not an authorization grant.

### EvidenceVersion

Pins Scope, Method, Run, Observation, and Artifact versions into one sealed manifest. It records an explicit boundary, origin, limitations, five independent status axes, seal time, and content fingerprint.

The five status axes are:

| Axis | Values |
|---|---|
| Measurement validity | `sufficient`, `partial`, `invalid`, `unknown` |
| Content integrity | `passed`, `failed`, `unverifiable` |
| Independent review | `not-reviewed`, `in-progress`, `consistent`, `deviation`, `uncertain` |
| Freshness | `valid`, `expiring`, `expired`, `unknown` |
| Policy decision | `accepted`, `rejected`, `manual-review` |

No axis is a universal pass mark. [CT-602](status-and-lifecycle-v1.md) defines allowed lifecycle and state transitions; CT-601 only freezes the vocabulary.

### Review

Binds a reviewer, organization, relationship disclosure, exact EvidenceVersion, review scope, method, findings, conclusion, and conclusion time. An account difference does not establish organizational independence.

### PolicyDecision

Keeps a consumer-specific decision separate from evidence facts. It pins the rule version and fingerprint, exact evidence inputs, outcome, reason, and decision time.

### ExportGrant

Records the intended recipient, purpose, JSON Pointer field scope, expiry, watermark, and grant state for named resources. Authoritative services must still authenticate the recipient and check current revocation state.

## Reference rules

Every `objectReference` pins `object_type`, `object_id`, `version`, and `tenant_id`. Consumers must reject:

- missing or floating versions;
- references to another tenant;
- references whose object type does not match the containing field;
- content whose fingerprint differs from its sealed manifest; and
- revoked, replaced, expired, or unauthorized objects according to authoritative state.

Cross-object and authoritative-state checks belong to CT-602 through CT-607. JSON Schema cannot establish them by itself.

## Versioning rules

1. `schema_version` follows Semantic Versioning. A breaking field or meaning change increments the major version.
2. `version` identifies one immutable business object version. Changing referenced content, semantics, authorization scope, or a protected field creates a new version.
3. A reference always pins an exact object version. `latest` and unversioned references are forbidden.
4. A replacement does not erase the prior version or inherit its review automatically.
5. Unknown fields are rejected. Experimental fields require a separately versioned schema, not an ad hoc property.
6. Dates are UTC instants; numeric observations always carry an explicit unit.

## Synthetic fixtures

The nine examples under [`examples/evidence/v1/`](../../examples/evidence/v1/) form one coherent synthetic graph. They use no customer names, routable endpoints, credentials, private topology, or measured production result.

The synthetic `EvidenceVersion` deliberately reports content integrity as `unverifiable`. CT-601 defines the fingerprint field but does not claim that the placeholder digest has been recomputed; CT-603 adds the canonical manifest and offline verifier that can move this axis to `passed`.
