# Changelog

All notable public changes to CT-AIComm are recorded in this file. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for tagged public releases.

## [Unreleased]

### Added

- Truthful bootstrap governance, a machine-readable role roster, and a public external reviewer or maintainer admission, permission, review, and exit process.
- CT-556 execution evidence binding v1 with tenant, execution, component-version, and fingerprint locks for policy, Agent, route, trace, and environment evidence.
- CT-557 data path declaration v1 with stable region, directed-boundary, encryption, processor, JSON/YAML, and authoritative-context validation contracts.
- CT-558 audit package v1 with a closed declaration, approval, execution, and rollback artifact set, deterministic SHA-256 manifests, offline builder and verifier CLIs, and explicit authenticity boundaries.
- CT-559 fail-closed evidence gap detection v1 for missing, stale, conflicting, and unsigned records, with caller-supplied trust context and deterministic reports.

## [0.1.0] - 2026-10-22

### Added

- Public API, SDK, CT-DSL, Registry, Agent control, telemetry, and connector contracts.
- Reproducible CT-Bench evidence schemas, synthetic examples, and offline contributor scenarios.
- Source-released CT-DataPlane Agent and vLLM connector reference implementations with explicit execution and evidence boundaries.
- Registry contribution provenance, signed entry history verification, and independent review contracts.
- Bilingual security reporting, contributor, operations, and governance documentation.
- Deterministic source archive, SPDX 2.3 source SBOM, SHA-256 manifest, Sigstore keyless signature bundle, and GitHub build provenance for every tagged release.

### Evidence boundary

- This release contains synthetic examples and software contracts. It does not contain measured production performance results and does not authorize a production performance claim.
- Recommendations, readiness artifacts, and passing tests are not execution authorization, external certification, or proof of a successful production run.

[0.1.0]: https://github.com/cloudtelecomCN/ct-aicomm/releases/tag/v0.1.0
