# Audit package v1

[中文](audit-package.zh-CN.md)

CT-558 defines a deterministic, offline-verifiable package that binds one data-path declaration, approval record, execution record, and rollback record to the same tenant, workload, and execution. It makes omission and byte-level tampering visible without importing production credentials or private infrastructure into the public SDK.

## Directory contract

```text
audit-package/
|-- manifest.json
|-- SHA256SUMS
`-- artifacts/
    |-- declaration.json
    |-- approval.json
    |-- execution.json
    `-- rollback.json
```

`manifest.json` is canonical JSON and lists exactly four artifacts in the order shown above. Each descriptor locks the artifact ID, media type, schema version, evidence origin, source fingerprint field, SHA-256 digest, and byte length. `SHA256SUMS` covers the manifest and every artifact. Extra, missing, duplicate, non-canonical, symlinked, or path-traversing content is rejected by the reference tools.

## Rebuild the synthetic example

```bash
node scripts/build-audit-package.mjs \
  examples/compliance/synthetic-audit-package-source/descriptor.json \
  /tmp/ct-audit-package

node scripts/verify-audit-package.mjs /tmp/ct-audit-package \
  --tenant tenant-synthetic-alpha \
  --workload workload-inference-synthetic \
  --execution execution-synthetic-001
```

The builder accepts local JSON inputs only and writes to a missing or empty output directory. Source paths must remain below the descriptor directory. The verifier scans the complete package directory before verification and rejects untracked files.

The checked-in [`synthetic-audit-package`](../../examples/compliance/synthetic-audit-package/) is generated from [`synthetic-audit-package-source`](../../examples/compliance/synthetic-audit-package-source/) and is suitable for contract testing only. Its approval and rollback records describe a synthetic exercise, not a production change.

## SDK API

```js
import { createAuditPackage, verifyAuditPackage } from "@cloudtelecom/ct-aicomm-sdk";

const built = createAuditPackage({
  packageId,
  tenantId,
  workloadId,
  executionId,
  artifacts
});

const result = verifyAuditPackage({
  manifestBytes: built.manifestBytes,
  checksumsBytes: built.checksumsText,
  files: built.files,
  expectedContext: {
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId
  }
});
```

Use an authenticated system of record to supply `expectedContext`. Context values copied from the submitted package are not authoritative.

## Public contract

- Schema: [`../../specs/compliance/audit-package-manifest-v1.schema.json`](../../specs/compliance/audit-package-manifest-v1.schema.json)
- Reference implementation: [`../../packages/compliance/audit-package.mjs`](../../packages/compliance/audit-package.mjs)
- Type declarations: [`../../packages/compliance/audit-package.d.ts`](../../packages/compliance/audit-package.d.ts)
- Builder: [`../../scripts/build-audit-package.mjs`](../../scripts/build-audit-package.mjs)
- Verifier: [`../../scripts/verify-audit-package.mjs`](../../scripts/verify-audit-package.mjs)

## Evidence boundary

A successful verification proves that the supplied package is internally complete, byte-consistent, and optionally matched to caller-supplied identifiers. A checksum is not a signature: an attacker who can replace every file can also recompute every checksum. Version 1 therefore reports `authenticity_verified`, `authorization_verified`, and `legal_or_certification_conclusion` as `false`. Trusted signing, identity validation, retention policy, and regulatory conclusions require separate controls.
