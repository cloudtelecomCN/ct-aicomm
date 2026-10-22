# Evidence import and idempotency v1

[中文](import-and-idempotency-v1.zh-CN.md)

Status: public contract for CT-604. This contract imports one externally
anchored CT-603 bundle into a tenant-scoped identity ledger without copying raw
object content into the ledger.

## Validation order

An import is committed only after these gates pass in order:

1. valid attempt metadata and a tenant-bound idempotency key;
2. byte, object, content, manifest, and external-anchor verification from
   CT-603;
3. the CT-601 object envelope plus canonical unit and UTC time checks;
4. exact-version reference closure within one tenant; and
5. immutable identity comparison against objects already stored.

Producers must validate complete object payloads against the CT-601 Evidence
Core schema before import. The CT-604 reference importer independently checks
the exact top-level envelope, authorization envelope, identity, units, times,
and cross-object semantics needed to make the import decision fail closed.

The reference implementation performs no network access and needs no
credentials. A production service remains responsible for authentication,
authorization, durable transactions, retention, and tenant isolation.

## Units

Observation values and numeric Method parameters use the versioned canonical
unit catalog exported as `EVIDENCE_CANONICAL_UNITS`. v1 accepts:

`1`, `bit/s`, `byte/s`, `bytes`, `count`, `ms`, `ns`, `percent`, `request/s`,
`s`, `token/s`, and `us`.

Aliases such as `Mbps`, `%`, `milliseconds`, or locale-specific text are not
silently converted. A producer must convert the numeric value and declare the
canonical unit before import. Non-numeric Method parameters use `null`.

## Time rules

Every instant uses exact UTC serialization such as `2026-10-23T00:01:00.000Z`.
Creation, observation, actual-run, seal, review, and decision times cannot be
later than `received_at`. Authorization expiry, Scope validity, and planned
windows may be in the future, but every window and expiry must retain valid
ordering. An Observation must fall within its exact Run actual window.

## Reference closure

All references pin object type, ID, SemVer, and tenant. The importer rejects
floating, missing, wrong-type, and cross-tenant references. The Scope, Method,
Run, Observation, and Artifact references declared by EvidenceVersion must be
exactly the protected evidence-content set; undeclared or omitted content is a
failure.

## Idempotency and immutable versions

- Reusing one idempotency key for the same request returns the original record
  and does not add an attempt or object, whether that original result committed,
  replayed, or failed.
- Importing the same protected content under a new key adds a `replayed` record
  but no duplicate object.
- Reusing an idempotency key for different bytes creates a `rejected` record.
- Reusing an exact tenant, object type, object ID, and version with different
  content is rejected. The old fingerprint remains unchanged; changed content
  requires a new version.

## Failure records

Every processable rejection appends a strict
`evidence_import_record` containing stable error codes and JSON-style paths,
without raw content or credentials. Records form a SHA-256 chain through
`previous_record_fingerprint`. Invalid attempt IDs or malformed audit metadata
cannot be recorded safely and are rejected before ledger mutation.

## Trust boundary

A committed import confirms structural, integrity, semantic, and immutable
identity checks against the supplied external anchor. It does not prove content
authenticity, measurement truth, authorization, independent review,
performance validity, or certification. Every import record fixes those claims
to `false`; authoritative private services must evaluate them separately.

The checked-in scenario is synthetic and does not represent a production
measurement.
