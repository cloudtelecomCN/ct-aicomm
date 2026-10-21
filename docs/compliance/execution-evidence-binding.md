# Execution evidence binding v1

[中文](execution-evidence-binding.zh-CN.md)

CT-556 defines one immutable binding for the exact policy, Agent build, selected route, trace bundle, and environment fingerprint used by an execution. A verifier must supply the authoritative active context; the binding is never accepted merely because its internal checksum is valid.

## Required boundary

- Every component carries the same `tenant_id` as the binding.
- Route and trace evidence also carry the same `execution_id`.
- Every component has an immutable ID, version, and SHA-256 fingerprint.
- `lock_fingerprint` covers the tenant, execution, and all five component references.
- `binding_fingerprint` covers the complete record, including origin and creation time.
- Verification compares every ID, version, and fingerprint with the caller's authoritative context and fails closed on any mismatch.

The verifier rejects a missing expected context, another tenant, another execution, a changed component version, a changed component fingerprint, unknown fields, or a modified binding. This prevents a valid policy or trace from being silently reused as evidence for a different tenant or software revision.

## Public contract

- Schema: [`../../specs/compliance/execution-evidence-binding-v1.schema.json`](../../specs/compliance/execution-evidence-binding-v1.schema.json)
- Reference implementation: [`../../packages/compliance/evidence-binding.mjs`](../../packages/compliance/evidence-binding.mjs)
- Type declarations: [`../../packages/compliance/evidence-binding.d.ts`](../../packages/compliance/evidence-binding.d.ts)
- Synthetic example: [`../../examples/compliance/synthetic-execution-evidence-binding.json`](../../examples/compliance/synthetic-execution-evidence-binding.json)

```js
import { verifyExecutionEvidenceBinding } from "@cloudtelecom/ct-aicomm-sdk";

const result = verifyExecutionEvidenceBinding(binding, activeContext);
```

`activeContext` must come from an authenticated tenant and execution lookup, not from the submitted binding.

## Evidence boundary

A valid binding proves integrity and exact-context matching for the referenced metadata. It does not prove that the underlying event occurred, that a person approved it, that the source artifacts are true, or that an external certification exists. Signature packaging, missing-evidence analysis, retention, and regulatory rule mapping are separate controls in later CT-Auditor tasks.
