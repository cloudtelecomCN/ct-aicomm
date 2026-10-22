# Versioned compliance rule packs

CT-561 defines a public, zero-dependency contract for mapping CT-Auditor controls to assessment-preparation references. A rule pack identifies its issuer, scope, semantic version, predecessor fingerprint, mappings, and assurance boundary. It is a navigation and evidence-location artifact, not a legal opinion or certificate.

## Public contract

- Schema: [`specs/compliance/compliance-rule-pack-v1.schema.json`](../../specs/compliance/compliance-rule-pack-v1.schema.json)
- Observation schema: [`specs/compliance/compliance-control-observation-v1.schema.json`](../../specs/compliance/compliance-control-observation-v1.schema.json)
- Mapping-report schema: [`specs/compliance/compliance-rule-mapping-report-v1.schema.json`](../../specs/compliance/compliance-rule-mapping-report-v1.schema.json)
- Runtime and types: [`packages/compliance/rule-pack.mjs`](../../packages/compliance/rule-pack.mjs) and [`rule-pack.d.ts`](../../packages/compliance/rule-pack.d.ts)
- Offline validator: [`scripts/validate-compliance-rule-pack.mjs`](../../scripts/validate-compliance-rule-pack.mjs)

The three synthetic reference packs cover MLPS preparation, data-boundary evidence, and customer-defined enterprise rules. They contain illustrative identifiers, not official control text:

- [`synthetic-mlps-preparation-v1.json`](../../examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json)
- [`synthetic-data-boundary-v1.json`](../../examples/compliance/rule-packs/synthetic-data-boundary-v1.json)
- [`synthetic-enterprise-baseline-v1.json`](../../examples/compliance/rule-packs/synthetic-enterprise-baseline-v1.json)

## Version and integrity model

`pack_version` is strict semantic versioning. Every non-initial version must name the exact predecessor in `supersedes`, including its canonical SHA-256 fingerprint. `verifyComplianceRulePackUpgrade` rejects a changed `pack_id`, a non-increasing version, or a broken predecessor link. `validateComplianceRulePack` recomputes the canonical fingerprint and rejects modified content.

Rule-pack changes never mutate an earlier pack. Operational systems should retain the pack ID, version, fingerprint, declaration version, observation input, generated mapping report, and review decision as separate immutable records.

## Mapping semantics

`mapComplianceRulePack` receives caller-supplied control observations under an independently supplied expected tenant, workload, declaration, and version context. It emits only:

- `evidence_present`: every mapped internal control has submitted evidence;
- `evidence_missing`: at least one mapped internal control explicitly lacks evidence;
- `not_evaluated`: at least one mapped internal control was not observed.

`mapped_without_observed_gaps` does not mean compliant, approved, certified, or legally sufficient. It means only that the supplied observations did not expose a missing item for that mapping. The report always sets `mapping_only: true`, `legal_conclusion: false`, `certification_issued: false`, and `external_assessment_performed: false`.

## Offline use

```bash
node scripts/validate-compliance-rule-pack.mjs examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json
```

For a new version, pass the exact prior pack with `--previous`. Customer mappings should use `authority_type: customer_defined`, keep internal policy text outside this public repository when confidential, and undergo named legal, security, and assessor review before adoption.

The website contract exposes the organization-scoped, read-only mapping surface at `GET /api/v1/workspace/compliance/declarations/{id}/versions/{version}/rule-mappings`. The service pins these public pack fingerprints while keeping tenant declarations and evidence private.
