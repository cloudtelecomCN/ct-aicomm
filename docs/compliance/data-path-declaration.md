# Data path declaration v1

[中文](data-path-declaration.zh-CN.md)

CT-557 defines a provider-neutral declaration for the exact regions, directed boundaries, encryption controls, and processing entities associated with one workload revision. The contract is descriptive: a valid declaration records what an operator asserts and proves file integrity, but it does not prove that traffic followed the path or that a legal basis is sufficient.

## Stable field semantics

| Field | Meaning in v1 |
|---|---|
| `tenant_id` | Tenant that owns the declaration. It is not accepted as authenticated merely because it appears in the file. |
| `workload_id` / `revision` | Immutable workload-scoped declaration identity. Context verification requires an exact match. |
| `data_categories` | Operator-defined category IDs with one frozen classification: `public`, `internal`, `confidential`, or `restricted`. |
| `ordered_region_ids` | Directed path order. Every declared region appears exactly once. |
| `regions` | Provider-neutral locations with jurisdiction code, provider region, and path roles. Jurisdiction codes use the ISO 3166-1/2 shape; the verifier does not claim an official code registry lookup. |
| `boundaries` | Exactly one directed edge for each adjacent region. A jurisdiction change requires `cross_jurisdiction: true`, the `jurisdiction` type, and an opaque `transfer_basis_ref`. |
| `encryption` | Explicit in-transit and at-rest settings. References identify controls or keys but never contain key material. |
| `processors` | Controllers, processors, and subprocessors, including purposes, data categories, regions, parent relationship, and optional agreement reference. |
| `declaration_fingerprint` | SHA-256 fingerprint over the canonical declaration body. |

The semantic verifier additionally checks unique IDs, complete path edges, region references, jurisdiction consistency, canonical set ordering, processor parent cycles, processor coverage for every category and processing/storage region, and coherent encryption settings. JSON Schema validates the closed shape and vocabulary; the semantic verifier validates relationships that JSON Schema cannot express reliably.

## JSON and YAML profile

The canonical example is available as both [JSON](../../examples/compliance/synthetic-data-path-declaration.json) and [YAML](../../examples/compliance/synthetic-data-path-declaration.yaml). The `.yaml` artifact deliberately uses the JSON-compatible YAML 1.2 profile. This keeps offline validation deterministic and forbids parser-dependent tags, anchors, aliases, and implicit scalar coercion. A consumer may author ordinary YAML 1.2 with a trusted parser, then pass the resulting plain object to the semantic verifier.

```bash
node scripts/validate-data-path-declaration.mjs examples/compliance/synthetic-data-path-declaration.json
node scripts/validate-data-path-declaration.mjs examples/compliance/synthetic-data-path-declaration.yaml \
  --tenant tenant-synthetic \
  --workload workload-inference-synthetic \
  --revision 1
```

Validation without expected context returns `context_verified: false`. The second command compares tenant, workload, and revision with caller-supplied authoritative context and returns `context_verified: true` only on an exact match.

## Public contract

- Schema: [`../../specs/compliance/data-path-declaration-v1.schema.json`](../../specs/compliance/data-path-declaration-v1.schema.json)
- Reference implementation: [`../../packages/compliance/data-path-declaration.mjs`](../../packages/compliance/data-path-declaration.mjs)
- Type declarations: [`../../packages/compliance/data-path-declaration.d.ts`](../../packages/compliance/data-path-declaration.d.ts)
- Offline CLI: [`../../scripts/validate-data-path-declaration.mjs`](../../scripts/validate-data-path-declaration.mjs)
- Synthetic JSON example: [`../../examples/compliance/synthetic-data-path-declaration.json`](../../examples/compliance/synthetic-data-path-declaration.json)
- Synthetic YAML example: [`../../examples/compliance/synthetic-data-path-declaration.yaml`](../../examples/compliance/synthetic-data-path-declaration.yaml)

## Assurance boundary

Passing validation proves that the declaration is closed, internally consistent, untampered, and, when expected context is supplied, bound to the requested tenant, workload, and revision. It does not prove network observation, processor identity, legal sufficiency, approval, regulatory compliance, or certification. CT-558 packages declarations with independent approval, execution, rollback, and checksum evidence.
