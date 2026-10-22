# Link Evidence Passport scenario and method freeze

[中文](README.zh-CN.md)

This zero-dependency package implements the CT-609 public contract for freezing
one link-evidence-passport scenario and method before a run starts.

It exports:

- `createPassportScenarioMethodFreeze()` and
  `verifyPassportScenarioMethodFreeze()`;
- `createPassportRunPlan()`, `startPassportRun()`, and
  `verifyPassportRunBinding()`;
- `assertPassportRunFreeze()` and `createPassportReplacementRun()`.

The protected content covers the source and destination sites, direction,
protocol, workload configuration, exact Evidence Core Scope and Method
references, tool artifact, parameters, sampling, exclusions, requested
statistics, and environment prerequisites. Once a run is `started`, a different
freeze returns `passport_new_run_required`; a replacement must use a different
`run_id` and records the predecessor reference.

The package performs no network I/O, execution, measurement, authentication,
storage, or certification. Passing validation proves only structural and content
integrity of supplied records.

Run the synthetic scenario:

```bash
node examples/passport/scenario-method-freeze-synthetic.mjs
```
