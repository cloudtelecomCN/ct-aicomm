# Link Evidence Passport scenario and method freeze v1

[中文](scenario-and-method-freeze-v1.zh-CN.md)

Status: public working contract for CT-609. Version: `1.0.0`.

## Purpose

A Link Evidence Passport must say what question a run attempted to answer before
it presents any result. CT-609 freezes that question as one content-addressed
record:

- exactly one source site and one destination site;
- traffic direction;
- exact protocol identifier, version, and optional profile;
- workload class, name, exact version, origin, and configuration fingerprint;
- exact Evidence Core Scope and Method versions;
- method tool, tool artifact, parameters, sampling plan, warm-up count,
  exclusions, requested statistics, and environment prerequisites.

The freeze makes silent parameter drift visible. It does not make the sites,
method, workload, or later measurements true.

## Records

The contract publishes two strict Draft 2020-12 JSON Schemas:

1. [`scenario-method-freeze-v1.schema.json`](../../specs/passport/scenario-method-freeze-v1.schema.json)
   describes the protected scenario and method template.
2. [`run-freeze-binding-v1.schema.json`](../../specs/passport/run-freeze-binding-v1.schema.json)
   binds one exact run version to one exact freeze fingerprint.

Both reject unknown fields and floating `latest` versions. Canonicalized content
is protected with SHA-256. References are tenant-scoped and pin exact semantic
versions.

## Run rule

The lifecycle is deliberately narrow:

1. Create and verify one scenario-method freeze.
2. Create a `planned` run binding to its exact fingerprint.
3. Start the run by producing a new binding version with state `started` and a
   canonical UTC `started_at` inside the planned window.
4. Compare every subsequent scenario or method candidate with the started
   binding.
5. If any protected field differs, return `passport_new_run_required`.
6. Create a different `run_id`, reference the started predecessor, and bind the
   new run to the changed freeze.

Reusing the old `run_id` for changed parameters is rejected. The old run remains
unchanged and reviewable. A new run may also intentionally repeat the same
freeze; the rule prevents hidden change, not legitimate repetition.

## Protected change examples

Changing any of the following changes the freeze fingerprint:

- either site, site role, region, or direction;
- protocol identifier, exact version, or profile;
- workload class, name, version, origin, or configuration fingerprint;
- Scope or Method object identity or version;
- tool version or artifact fingerprint;
- any parameter value or unit;
- sample count, interval, warm-up count, exclusion, statistic, or prerequisite.

Array order is normalized before hashing, so reordering identical parameters is
not treated as a material change. Duplicate site identities, parameter names,
rule IDs, statistics, and prerequisites are rejected.

## Relationship to Evidence Core

CT-609 does not replace the Evidence Core `Scope`, `Method`, or `Run` objects.
It adds a passport-specific freeze and run binding around exact Scope and Method
references. CT-610 now attaches authorization, clock, budget, concurrency, and
stop-condition preflight evidence without redefining the frozen question. The
public start transition requires that passed preflight.

## Public and private boundary

The schemas, reference implementation, types, documentation, and synthetic
scenario are public. Real tenant identities, customer topology, endpoint
addresses, credentials, raw observations, and operational run state remain in
authorized private systems. A future public passport must use a separately
derived public projection rather than publishing this tenant-scoped record.

This contract performs no network I/O and does not:

- start traffic or execute a benchmark;
- authenticate a principal or authorize a run;
- verify a measurement source or environment;
- establish comparability with another run;
- permit a performance claim;
- issue independent review or certification.

## Run the synthetic scenario

```bash
node examples/passport/scenario-method-freeze-synthetic.mjs
```

The scenario changes the target sample count after a run starts, verifies the
stable `passport_new_run_required` error, rejects reuse of the original
`run_id`, and creates a replacement plan. It uses no external network,
production endpoint, customer data, or measured result.
