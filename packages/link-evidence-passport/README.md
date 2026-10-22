# Link Evidence Passport contracts

[中文](README.zh-CN.md)

This zero-dependency package implements the CT-609 scenario-method freeze and
the CT-610 local-import and mandatory run-preflight contracts.

It exports:

- `createPassportScenarioMethodFreeze()` and
  `verifyPassportScenarioMethodFreeze()`;
- `createPassportRunPlan()` and `verifyPassportRunBinding()`;
- `createPassportLocalRunImport()` and `verifyPassportLocalRunImport()`;
- `createPassportRunPreflight()` and `verifyPassportRunPreflight()`;
- preflight-gated `startPassportRun()`;
- `assertPassportRunFreeze()` and `createPassportReplacementRun()`.

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

Run the synthetic scenario:

```bash
node examples/passport/scenario-method-freeze-synthetic.mjs
node examples/passport/local-import-preflight-synthetic.mjs
```
