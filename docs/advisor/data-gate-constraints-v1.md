# CT-Advisor Data Gate and Hard Constraints v1

The Data Gate determines whether a frozen Requirement Passport and immutable infrastructure combinations are sufficiently complete and comparable for later analysis. It is deterministic, fail-closed, and performs no scoring, ranking, recommendation, or execution.

## Inputs

- One digest-verified, frozen Requirement Passport v2.
- One to 500 immutable Infrastructure Combination v1 documents.
- The versioned Requirement Field Registry v2.
- The frozen `ct-advisor-data-readiness-hard-constraints` ruleset v1.

At least two candidates must remain eligible after hard-constraint evaluation. Unknown hard values, unknown hard-input provenance, unsupported units, and unmapped hard fields block analysis. Unknown candidate dimensions make that candidate indeterminate. A failed hard constraint excludes the candidate and is retained with an explicit reason.

## Result states

- `ready`: no blocking issues or warnings.
- `ready_with_gaps`: analysis may continue, but warnings such as synthetic provenance remain visible.
- `blocked`: analysis must not continue until the blocking issues are resolved.

The result binds the exact Passport revision, candidate digests, ruleset digest, timestamp, issues, and candidate outcomes under a content SHA-256. Reordering caller input cannot change the result.

## Safety boundary

The Data Gate always reports:

- hard constraints precede any future scoring;
- scoring, ranking, and recommendation were not performed;
- unknown values were not imputed;
- execution was not authorized.

Synthetic fixtures prove reproducibility of the software contract only. They are not measured production evidence and cannot support procurement-performance claims.

## Public artifacts

- Rules: `examples/advisor/data-readiness-rules-v1.json`
- Rules schema: `specs/advisor/data-readiness-rules-v1.schema.json`
- Result schema: `specs/advisor/data-gate-result-v1.schema.json`
- Reference implementation: `packages/advisor/data-gate-constraints.mjs`
- Fixed fingerprint: `examples/advisor/data-gate-fixed-expected-v1.json`
- Offline contract tests: `tests/advisor-data-gate-constraints.test.mjs`
