# Link Evidence Passport comparability gate and version differences v1

[中文](comparability-gate-and-version-diff-v1.zh-CN.md)

CT-613 defines a deterministic, offline gate for comparing immutable CT-612
passport versions. It answers three separate questions without collapsing them:

1. do the versions belong to the same comparison group;
2. may their normalized metric rows be shown side by side; and
3. are their lifecycle and measurement states eligible for an explicit ranking
   policy supplied by a separate caller?

Passing this gate means only that the supplied records use compatible comparison
semantics. It is not a performance conclusion, equivalence finding, independent
review, certification, or authorization to publish a leaderboard.

## Exact group rule

The frozen `ct-passport-default-comparability-v1` rule requires exact equality
for:

- authorization scope;
- scenario direction;
- the complete workload identity and configuration fingerprint;
- the complete method template, including tool artifact, parameters, sampling,
  exclusions, statistics, and environment prerequisites;
- the declared data origin; and
- the observation shape: origin, observation point, metric, aggregation, and
  normalized unit.

Sites and protocol are declared comparison dimensions. They may differ while two
versions remain in the same group, because comparing links or protocol choices is
often the purpose of the view. The difference list still exposes those changes as
`comparison_dimension`; it does not imply that the choices are equivalent.

A version with a different method or workload never enters the default
side-by-side metric view or ranking. It remains visible only in the
`difference-only` section with stable blocker codes and field-level differences.
Direction, data-origin, unit, metric-shape, and authorization-scope drift are
handled the same way.

## Version and field differences

Each candidate contains JSON Pointer paths classified as:

- `comparison_dimension` for sites and protocol;
- `ranking_blocker` for exact-group fields;
- `eligibility` for lifecycle or measurement-status differences; or
- `metadata` for version, validity, identity, and fingerprint differences.

Values are encoded as canonical JSON strings so another implementation can
display or hash the exact difference without guessing at formatting. The complete
comparison is immutable and protected by a canonical SHA-256 content fingerprint.

## View and ranking boundary

Same-group versions enter `side-by-side-unranked`. Versions outside the group
enter `difference-only` and are omitted from metric rows. Active versions with
`sufficient` measurement validity and only `valid` observations are marked
`ranking_eligible`, but the reference SDK still sets
`default_ranking_applied: false`. A consumer must supply and disclose a separate
ranking objective, direction, tie rule, and publication policy.

The evaluator projects expiry, supersession, and revocation from the terminal
event history supplied by the caller. Expired or otherwise inactive versions fail
ranking eligibility closed. The package does not retrieve an authoritative event
stream; production callers must provide a complete, authorized history.

## Offline example

```bash
node examples/passport/comparability-gate-synthetic.mjs
```

The example creates one exact-group candidate, one workload-drift candidate, and
one method-drift candidate. All data is synthetic, no external network is used,
and the output authorizes no performance or certification claim.
