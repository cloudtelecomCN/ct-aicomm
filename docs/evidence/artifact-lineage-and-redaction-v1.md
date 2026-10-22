# Artifact lineage and redacted derivation v1

[中文](artifact-lineage-and-redaction-v1.zh-CN.md)

Status: public contract for CT-605. This contract records how one restricted,
private Evidence Core Artifact becomes a separate public Artifact. It discloses
which source-content fields were hidden or transformed and how those decisions
limit public review, without copying private source values into the record.

## Contract

The source and derived objects remain ordinary Evidence Core `Artifact` objects.
The derived Artifact must be a new immutable identity, must be classified
`public`, and its `derived_from` array must contain the exact versioned reference
of the restricted source Artifact. Both objects must belong to the same tenant.

`ArtifactDerivationRecord` binds the following values:

- exact source and derived Artifact references;
- canonical object fingerprints and byte-content fingerprints for both objects;
- an externally anchored, versioned redaction policy fingerprint;
- ordered JSON Pointer declarations for every disclosed hidden or transformed
  source field;
- a deterministic summary and machine-readable public-review limitations; and
- a canonical fingerprint covering the entire record.

The record deliberately excludes Artifact storage locators, source-content
bytes, hidden values, replacement values, credentials, and signing keys.

## Redaction actions and review impact

| Action | Public meaning | Review impact |
| --- | --- | --- |
| `remove` | The source field is omitted. | The source value is unavailable. |
| `mask` | Only a non-sensitive shape is retained. | The source value is unavailable. |
| `pseudonymize` | The source identity is replaced. | Public and private identities cannot be joined without separate authority. |
| `generalize` | A coarser value is published. | Public review has reduced granularity. |
| `aggregate` | Multiple source values are summarized. | Individual source samples are unavailable. |

Each declaration contains only a source JSON Pointer, action, category, and
reason code. Unknown fields are rejected, so a caller cannot accidentally add a
`source_value` or `replacement_value` to the public record.

## Two verification levels

`inspectArtifactDerivationRecord(record)` is safe for public use. It verifies the
record fingerprint, deterministic summary, action-to-impact mapping, and trust
boundary. It does not claim that either referenced Artifact was supplied.

`verifyArtifactDerivationRecord({ record, sourceArtifact, derivedArtifact,
expectedPolicyFingerprint })` is for an authorized review environment. It also
recomputes both Artifact object fingerprints, verifies the exact `derived_from`
relationship, and optionally checks a caller-supplied policy anchor. Even this
operation does not read or verify the Artifact content bytes; those bytes require
separate access and content-integrity verification.

## Example

Run the synthetic, dependency-free scenario:

```sh
node examples/evidence/derivation-synthetic.mjs
```

The fixture contains no customer data and makes no measured-performance claim.
Passing inspection is not proof of source authenticity, publication authority,
legal approval, independent review, or certification.
