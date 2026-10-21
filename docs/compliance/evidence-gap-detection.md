# Evidence gap detection v1

[中文](evidence-gap-detection.zh-CN.md)

CT-559 defines a fail-closed inspection contract for evidence requirements. It detects four machine-readable gap types before an application may emit `requirements_satisfied`:

| Type | Detection rule |
| --- | --- |
| `missing` | A policy requirement has no submitted evidence. |
| `stale` | Evidence age exceeds the requirement's explicit maximum age at the caller-supplied evaluation time. |
| `conflicting` | Records for one requirement carry more than one claim fingerprint. |
| `unsigned` | An evidence record has fewer acceptable verified signatures than the policy requires. |

Malformed input, unknown requirements, evidence-kind mismatches, future observations, duplicate identities, and tenant, workload, or execution mismatches are rejected instead of being converted into an optimistic report.

## Trust inputs stay outside the submission

The assessment file contains evidence records and signature-verification receipts. Three authoritative inputs are supplied separately by the caller:

- expected tenant, workload, and execution identifiers;
- the evaluation time used for freshness checks;
- the verifier IDs the caller trusts.

A signature-verification receipt counts only when its status is `verified`, its verifier is caller-trusted, its signer role is allowed by the requirement, and its verification time is between evidence observation and report evaluation. The public SDK does not validate raw signatures, operate a key authority, or authenticate a verifier. Callers must authenticate verifier receipts before passing them to this module. Merely writing a trusted verifier ID into a JSON file is not proof.

## Run the intentionally incomplete example

```bash
node scripts/inspect-evidence-gaps.mjs \
  examples/compliance/synthetic-evidence-gap-assessment.json \
  --tenant tenant-synthetic-alpha \
  --workload workload-inference-synthetic \
  --execution execution-synthetic-001 \
  --at 2026-10-22T12:00:00.000Z \
  --trusted-verifier synthetic-verifier-v1
```

The example contains one missing rollback record, one stale declaration, two conflicting approval claims, and one unsigned execution record. The CLI writes the report and exits with status `2`. That nonzero default prevents an incomplete report from passing a CI gate accidentally. Invalid input exits with status `1`; only a report with no gaps exits with status `0`.

The deterministic output is checked in at [`synthetic-evidence-gap-report.json`](../../examples/compliance/synthetic-evidence-gap-report.json). Both files are synthetic contract fixtures, not production evidence.

## SDK API

```js
import { inspectEvidenceGaps } from "@cloudtelecom/ct-aicomm-sdk";

const report = inspectEvidenceGaps(assessment, {
  expectedContext: {
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId
  },
  evaluatedAt: trustedClockNow,
  trustedVerifierIds: authenticatedVerifierIds
});
```

Input arrays are normalized into stable order. The report fingerprints the normalized policy, assessment, every gap, and the complete report so independent tooling can reproduce the same result.

## Public contract

- Assessment Schema: [`../../specs/compliance/evidence-gap-assessment-v1.schema.json`](../../specs/compliance/evidence-gap-assessment-v1.schema.json)
- Report Schema: [`../../specs/compliance/evidence-gap-report-v1.schema.json`](../../specs/compliance/evidence-gap-report-v1.schema.json)
- Reference implementation: [`../../packages/compliance/evidence-gap.mjs`](../../packages/compliance/evidence-gap.mjs)
- Type declarations: [`../../packages/compliance/evidence-gap.d.ts`](../../packages/compliance/evidence-gap.d.ts)
- Fail-closed CLI: [`../../scripts/inspect-evidence-gaps.mjs`](../../scripts/inspect-evidence-gaps.mjs)

## Conclusion boundary

`requirements_satisfied` means only that the submitted records passed the selected version of the declared evidence policy at the supplied time and under the supplied trust context. It does not approve an execution, establish that a legal basis is valid, authenticate the policy itself, or issue an external certification. Reports therefore always keep `authorization_verified` and `legal_or_certification_conclusion` set to `false`.
