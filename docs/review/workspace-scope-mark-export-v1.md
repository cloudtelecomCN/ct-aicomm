# Independent Run Review workspace, scope mark, and export v1

[中文](workspace-scope-mark-export-v1.zh-CN.md)

CT-621 turns the CT-616 through CT-620 records into a bounded read model that a buyer can inspect and export. It does not create a hosted tenant, authenticate a user, persist customer data, or issue certification. Those operational responsibilities belong to the private commercial workspace.

## Public records

The public contract defines three immutable records:

1. `independent_review_workspace_snapshot` presents the exact engagement, independence assessment, recalculation, optional supervised re-execution, and current opinion lifecycle as six workflow steps.
2. `independent_review_scope_mark` presents the reviewer institution, opinion date, exact Passport and delivery scope, outcome, and every limitation required for display.
3. `independent_review_workspace_export_manifest` binds the workspace, mark, human-readable boundary, and checksums into a five-file offline package.

Every record is tenant-bound and fingerprinted. The workspace is a read model. It performs no control action and persists no customer data.

## Scope-mark eligibility

A scope mark may be created only when the verified opinion lifecycle is currently `issued` or `corrected` and has no open appeal. An opinion under appeal, awaiting correction or withdrawal, or already withdrawn blocks mark creation. A withdrawn workspace remains visible with its full history, but it cannot produce a new active mark.

This is a scope-bound opinion mark, not a pass badge. The mark always displays the institution, date, scope, outcome, and limitations:

- the declared reviewer institution;
- the effective opinion date;
- the review level, exact Passport version, and intended use;
- the current source-derived outcome;
- a limitation stating that the result is not certification, legal advice, SLA adjudication, or a performance guarantee.

The machine-readable limitation list also states that identity was not authenticated, organization control and export authorization were not externally verified, reviewer independence was not certified, and historical state was not reproduced.

## Offline export

`createIndependentReviewWorkspaceExport()` creates:

```text
README.md
SHA256SUMS
manifest.json
scope-mark.json
workspace.json
```

`verifyIndependentReviewWorkspaceExport()` verifies the exact file set, SHA-256 values, record fingerprints, and reference bindings without network access. The compact export deliberately contains no raw samples, customer identifiers, credentials, private storage locations, or source review records. It therefore verifies package integrity, not the underlying source work. A recipient who needs source re-verification must obtain the separately authorized CT-616 through CT-620 records and evidence package.

## Public API

- `createIndependentReviewWorkspace(input)` derives one workspace from a fully verified opinion lifecycle.
- `verifyIndependentReviewWorkspace(input)` reproduces the workspace from the exact source records.
- `createIndependentReviewScopeMark(input)` creates a mark only when the current lifecycle is eligible.
- `verifyIndependentReviewScopeMark(input)` reproduces the mark from the verified workspace and sources.
- `createIndependentReviewWorkspaceExport(input)` creates the compact five-file package.
- `verifyIndependentReviewWorkspaceExport({ files })` verifies package integrity offline.

## Trust boundary

CT-621 does not authenticate a principal, verify corporate control, establish export authorization, attach a trusted signature, certify reviewer independence, reproduce historical state, guarantee performance, adjudicate an SLA, provide a legal conclusion, or issue certification. The institution name is a declared display value bound to the exact opinion signer organization. Production identity, authorization, storage, retention, revocation delivery, and customer access must be implemented by the private hosted or customer-managed workspace.

Run the synthetic, offline example:

```bash
node examples/review/workspace-scope-mark-synthetic.mjs
```
