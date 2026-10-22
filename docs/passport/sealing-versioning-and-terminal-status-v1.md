# Link Evidence Passport sealing, versioning, and terminal status v1

[中文](sealing-versioning-and-terminal-status-v1.zh-CN.md)

CT-612 turns one exact frozen run and its normalized observations into an
immutable passport version. It also defines append-only expiry, supersession,
and revocation events. These contracts preserve evidence history; they do not
authenticate an actor, approve a policy, assert performance, or issue a
certification.

## Public contracts

- [`evidence-version-v1.schema.json`](../../specs/passport/evidence-version-v1.schema.json)
  defines the sealed version.
- [`version-terminal-event-v1.schema.json`](../../specs/passport/version-terminal-event-v1.schema.json)
  defines one terminal event for an exact version.
- [`versioning.mjs`](../../packages/link-evidence-passport/versioning.mjs)
  creates and verifies versions, replacements, terminal events, and status
  projections.
- [`sealing-versioning-synthetic.mjs`](../../examples/passport/sealing-versioning-synthetic.mjs)
  is an offline synthetic example, not a benchmark result.

## Sealing rules

A version can be sealed only after the frozen run window ends. Every included
observation must:

1. pass the CT-611 normalization verifier;
2. bind the exact started run and scenario-method freeze;
3. exist before `sealed_at`; and
4. appear exactly once in its original `measured`, `synthetic`, `inferred`, or
   `declared` group.

The version fingerprint protects the exact run, freeze, grouped observation
references, authorization scope, validity interval, initial status axes, and
lineage. Any later content change requires another semantic version; an old
record is never edited in place.

`freshness_ttl_seconds` deterministically produces `valid_until`. The version
cannot outlive its authorization scope. A consumer that receives no terminal
event still fails closed at `valid_until` when it evaluates the projection.

## Version-local status

The initial status belongs only to the newly sealed content:

| Axis | Initial value |
|---|---|
| Measurement validity | Derived from this version's verified observation qualities |
| Content integrity | `passed` after every exact observation fingerprint is verified |
| Independent review | `not-reviewed` |
| Freshness | `valid` until this version's own `valid_until` |
| Policy decision | `manual-review` |

A replacement therefore never inherits the predecessor's review conclusion,
freshness, or policy decision. Reviews and policy decisions must reference the
new exact version independently.

## Terminal states

Only one append-only terminal event is valid for a sealed version:

| State | Required reason | Actor role | Additional rule |
|---|---|---|---|
| `expired` | `validity_elapsed` | system or operator | Event time is at or after `valid_until` |
| `superseded` | `replacement_published` | publisher | Exact higher version is already sealed and points back to this version |
| `revoked` | `revocation_authorized` | publisher or operator | No replacement is implied |

Supersession and revocation must occur before expiry. A terminal event records a
decision without mutating the sealed source. Replaying more than one terminal
event is rejected.

## Boundary

Passing these validators proves structural consistency and canonical content
integrity of caller-supplied records only. The module performs no measurement,
network I/O, identity authentication, trusted signing, storage, delivery, legal
review, or certification.

Run the synthetic example and tests:

```bash
node examples/passport/sealing-versioning-synthetic.mjs
node --test tests/passport-sealing-versioning.test.mjs
```
