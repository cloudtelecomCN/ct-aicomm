# Link Evidence Passport observation normalization and quality v1

Status: public working contract for CT-611. Version: `1.0.0`.

CT-611 turns one aggregate result from an exact started Passport run into an
immutable, content-addressed observation. It makes unit conversion, attempted
samples, failures, exclusions, source origin, and derived quality explicit.
The contract performs no measurement, authenticates no principal, and issues
no performance or certification conclusion.

## Public artifacts

- [`normalized-observation-v1.schema.json`](../../specs/passport/normalized-observation-v1.schema.json)
  defines the strict record.
- [`observation.mjs`](../../packages/link-evidence-passport/observation.mjs)
  creates and verifies records without network access or credentials.
- [`observation.d.ts`](../../packages/link-evidence-passport/observation.d.ts)
  publishes the TypeScript boundary.
- [`observation-normalization-synthetic.mjs`](../../examples/passport/observation-normalization-synthetic.mjs)
  is an offline synthetic example, not a benchmark result.

## Exact run and method binding

Creation and verification both require the exact `started` Run and its exact
scenario-method Freeze. The record pins their versions and fingerprints. Its
metric and aggregation must be present in the frozen method, every exclusion
must use a frozen exclusion rule, and `observed_at` must fall inside the
started run window. A free-standing record cannot prove those relationships.

## Versioned unit rules

The SDK converts a declared source unit through
`PASSPORT_OBSERVATION_UNIT_RULES` and records the source value, source unit,
normalized value, Evidence Core canonical unit, and conversion factor. It does
not guess from a metric name or silently accept locale-specific aliases.

| Quantity | Accepted source units | Canonical unit |
|---|---|---|
| Duration | `ns`, `us`, `ms`, `s` | `ms` |
| Bit rate | `bit/s`, `kbit/s`, `Mbit/s`, `Gbit/s` | `bit/s` |
| Byte rate | `byte/s`, `KiB/s`, `MiB/s`, `GiB/s` | `byte/s` |
| Bytes | `bytes`, `KiB`, `MiB`, `GiB` | `bytes` |
| Ratio | `1` | `1` |
| Percentage | `percent`, `%` | `percent` |
| Count and rates | `count`, `request/s`, `token/s` | same unit |

An unsupported unit fails closed. A record with zero included samples must use
`null` for both source and normalized values; it cannot manufacture an
aggregate from failures.

## Closed sample accounting

The following equalities are mandatory:

```text
attempted = successful + failed
successful = included + excluded
sum(failure.count) = failed
sum(exclusion.count) = excluded
```

Failed samples remain represented by a machine-readable code, stage, and
count. Exclusions remain represented by the exact rule ID frozen before the
run. Neither category may disappear from the denominator without disclosure.

## Origin separation

The four origins are mutually exclusive and use different source evidence:

| Origin | Required source kind | Required provenance | Derived quality ceiling |
|---|---|---|---|
| `measured` | `instrument` | one content-addressed source Artifact | `valid` or `partial` |
| `synthetic` | `generator` | one content-addressed generated Artifact | `valid` or `partial`, still synthetic |
| `inferred` | `derivation` | one or more exact input Observation references | `unknown` |
| `declared` | `attestation` | a named declarant | `unknown` |

A synthetic-only Freeze rejects measured, inferred, and declared records. A
measured-only Freeze rejects every non-measured origin. A hybrid Freeze may
contain separately labelled records, but no record changes origin during
normalization.

## Derived quality

The caller cannot choose quality. The SDK derives it deterministically:

- zero included samples: `invalid`;
- inferred or declared origin with included values: `unknown`;
- retained failures or exclusions: `partial`;
- otherwise measured or synthetic evidence: `valid`.

Quality flags retain the reason. Even `valid` means only that this structural
contract and its sample accounting passed. The boundary always keeps
`performance_claim_allowed: false` and `certification_issued: false`.

## Security and privacy boundary

The public implementation stores references, counts, fingerprints, and
bounded labels. It stores no source path, raw payload, endpoint, credential,
customer topology, or signing key. Production authentication, durable storage,
Artifact access, measurement execution, and authorization enforcement remain
outside this offline reference implementation.
