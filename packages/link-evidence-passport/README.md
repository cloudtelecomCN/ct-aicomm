# Link Evidence Passport contracts

[中文](README.zh-CN.md)

This zero-dependency package implements the CT-609 scenario-method freeze,
the CT-610 local-import and mandatory run-preflight contracts, and the CT-611
observation-normalization and quality contract. CT-612 adds immutable sealing,
exact replacement lineage, expiry, supersession, and revocation. CT-613 adds a
deterministic comparability gate, field-level differences, and an unranked view.

It exports:

- `createPassportScenarioMethodFreeze()` and
  `verifyPassportScenarioMethodFreeze()`;
- `createPassportRunPlan()` and `verifyPassportRunBinding()`;
- `createPassportLocalRunImport()` and `verifyPassportLocalRunImport()`;
- `createPassportRunPreflight()` and `verifyPassportRunPreflight()`;
- preflight-gated `startPassportRun()`;
- `assertPassportRunFreeze()` and `createPassportReplacementRun()`;
- `createPassportNormalizedObservation()` and
  `verifyPassportNormalizedObservation()` from `observation.mjs`.
- `createPassportEvidenceVersion()`, `createPassportReplacementVersion()`, and
  `verifyPassportEvidenceVersion()` from `versioning.mjs`;
- `createPassportVersionTerminalEvent()`,
  `verifyPassportVersionTerminalEvent()`, and
  `projectPassportEvidenceVersion()` from `versioning.mjs`.
- `createPassportComparison()` and `verifyPassportComparison()` from
  `comparison.mjs`.

The protected content covers the source and destination sites, direction,
protocol, workload configuration, exact Evidence Core Scope and Method
references, tool artifact, parameters, sampling, exclusions, requested
statistics, and environment prerequisites. Once a run is `started`, a different
freeze returns `passport_new_run_required`; a replacement must use a different
`run_id` and records the predecessor reference.

A run can enter `started` only when its exact plan and freeze have a verified
local import and a still-fresh preflight whose authorization, clock, budget,
concurrency, and hard stop-condition gates all pass. Failed checks create an
immutable failed record and leave the run `planned`; there is no public
unchecked start transition.

The package performs no network I/O, execution, measurement, authentication,
storage, or certification. Passing validation proves only structural and content
integrity of supplied records.

Normalized observations use a closed sample account, canonical Evidence Core
units, derived quality, and origin-specific source records. Measured, synthetic,
inferred, and declared records cannot be promoted or merged by changing a label.

Sealed passport versions bind exact observations in origin-separated sets.
Replacement versions reset independent review to `not-reviewed`, derive their
own freshness deadline, and never inherit policy acceptance. Expiry fails closed
even without event delivery; supersession and revocation are append-only terminal
events and do not mutate the sealed source.

Comparisons require exact authorization scope, direction, workload, method,
data-origin, and observation shape. Sites and protocol remain explicit comparison
dimensions. Method or workload drift is shown only as a difference and never
enters the default side-by-side metric view. The SDK applies no default ranking.

Run the synthetic scenario:

```bash
node examples/passport/scenario-method-freeze-synthetic.mjs
node examples/passport/local-import-preflight-synthetic.mjs
node examples/passport/observation-normalization-synthetic.mjs
node examples/passport/sealing-versioning-synthetic.mjs
node examples/passport/comparability-gate-synthetic.mjs
```
