# CT-Advisor formal evidence package contract v1

[中文](formal-evidence-package-contract-v1.zh-CN.md)

## Purpose

CT-666 freezes the public contract for the only paid CT-Advisor capability:

```text
GPU Decision & Evidence Package
capability_key: gpu_preprocurement_decision_evidence_package
```

The contract binds one existing free Basic Report to a fixed package profile. It defines the 13 customer deliverables, manifest fields, checksums, version compatibility, and product boundaries before private report, approval, packaging, quotation, or entitlement workflows are added.

Free resource discovery, sizing, combination comparison, analysis, recommendations, and Basic Report exports remain free. Creating this contract does not grant a paid entitlement and does not generate a formal package.

## Thirteen deliverables

| ID | Deliverable | Allowed formats | Implementation task |
|---|---|---|---|
| D01 | Project scope and responsibility boundary | PDF / DOCX | CT-667 |
| D02 | Requirement Passport | PDF / JSON | CT-667 |
| D03 | Candidate and Combination Matrix | XLSX / CSV / JSON | CT-667 |
| D04 | Data Source Ledger and Gap Register | PDF / CSV / JSON | CT-667 |
| D05 | Cost, performance, network, region, and risk analysis | PDF / JSON | CT-667 |
| D06 | Scenario, Pareto, and sensitivity results | PDF / CSV / JSON | CT-667 |
| D07 | Numbered GPU Decision Report | PDF / DOCX | CT-667 |
| D08 | Explainable Recommendation | PDF / JSON | CT-667 |
| D09 | Decision Record and approval record | PDF / JSON | CT-667 |
| D10 | Evidence Package aggregate container | ZIP + manifest + SHA256SUMS | CT-668 |
| D11 | Offline verification result | TXT / JSON | CT-668 |
| D12 | Raw data, transformed data, and complete exit package | ZIP | CT-668 |
| D13 | Version-matched product manual | PDF / HTML / Markdown | CT-673 |

Every item is required by the profile. A later implementation cannot silently drop an item or replace a machine-readable output with only a PDF.

## Manifest and checksum model

- `manifest.json` identifies the exact contract, profile, sources, package revision, and files.
- `SHA256SUMS` covers the exact bytes of every file inside the package.
- D10 represents the aggregate ZIP container. The ZIP cannot contain a checksum of itself, so the archive digest is delivered as an external sidecar. The manifest forbids a circular self-reference.
- Paths are relative, traversal is forbidden, and undeclared files must be rejected by the CT-668 verifier.
- Issued bytes are immutable. Any changed source or artifact creates a new package revision and an explicit supersession link; it never rewrites an issued package.

The manifest Schema is frozen now as a forward contract. Package assembly, checksum-set verification, tamper detection, and archive generation belong to CT-668.

## Compatibility policy

The Schema and artifact profile use Semantic Versioning with strict readers:

- a reader accepts the same major version only when it is not older than the document;
- patch changes are clarifications or non-structural fixes;
- additive optional fields require a minor version and explicit reader support;
- removals, renames, type changes, semantic changes, and required-field additions require a major version;
- unknown fields are rejected instead of ignored;
- issued documents are never silently migrated.

Every package records the exact Schema, profile, and minimum verifier versions. A verifier that does not support them must fail closed with an upgrade-required result.

## Public files

- `specs/advisor/formal-evidence-package-contract-v1.schema.json`
- `specs/advisor/formal-evidence-package-manifest-v1.schema.json`
- `packages/advisor/formal-evidence-package-contract.mjs`
- `scripts/verify-advisor-formal-package-contract.mjs`

Run the offline contract tests with:

```bash
npm test
```

## Boundaries

A frozen CT-666 contract is not a formal report, human decision, approval, independent review, certification, legal opinion, performance claim, or execution authorization. It contains no customer data, price, entitlement, service credential, or private scoring configuration.
