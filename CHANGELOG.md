# Changelog

All notable public changes to CT-AIComm are recorded in this file. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for tagged public releases.

## [Unreleased]

### Added

- CT-601 Evidence Core object model v1 with nine strict, tenant-scoped object contracts, exact-version references, bilingual field dictionaries, and synthetic fixtures that make no performance or independence claim.
- CT-602 non-collapsing five-axis status and append-only lifecycle v1 with deterministic transitions, stable error codes, terminal-state enforcement, exact-version supersession, and a synthetic replay history.
- CT-603 RFC 8785 content fingerprints, strict manifests, canonical SHA-256 checksums, a symlink-safe offline verifier, and a deterministically anchored synthetic Evidence Core bundle.
- CT-604 tenant-scoped import and idempotency contract with canonical units, UTC chronology, exact-reference closure, immutable versions, deduplicated replay, and append-only failure records.
- CT-605 restricted-to-public Artifact lineage with exact-version derivation, canonical object and content fingerprints, value-free redaction disclosures, deterministic review impact, and separate public inspection versus authorized verification.
- CT-606 fail-closed tenant export authorization with exact recipient, purpose, versioned resource, segment-aware field and time checks, plus an append-only, value-free delivery audit chain.
- CT-607 fingerprinted terminal status events, idempotent at-least-once downstream consumption, and a bounded fail-closed TTL fallback.
- CT-608 standalone read-only Evidence Query OpenAPI, strict public projections, exact-version SDK lookup, query-bound pagination, stable errors, and bilingual integration guidance.
- CT-609 Link Evidence Passport scenario and method freeze contracts for exact sites, direction, protocol, workload, and method parameters, with immutable run bindings and mandatory replacement runs after execution starts.
- CT-610 offline local-run imports and a mandatory five-gate preflight for authorization, clock, budget, concurrency, and hard stop conditions; failed or expired preflights cannot transition a run to started.
- CT-611 canonical observation units, closed sample accounting, retained failure and exclusion reasons, derived quality, and strict separation of measured, synthetic, inferred, and declared sources.
- CT-612 immutable Link Evidence Passport versions, version-local review and freshness, exact replacement lineage, fail-closed expiry, and append-only supersession and revocation.
- CT-613 deterministic Passport comparison groups, field-level version differences, lifecycle and quality gates, and unranked side-by-side views that exclude method or workload drift.
- Truthful bootstrap governance, a machine-readable role roster, and a public external reviewer or maintainer admission, permission, review, and exit process.
- CT-556 execution evidence binding v1 with tenant, execution, component-version, and fingerprint locks for policy, Agent, route, trace, and environment evidence.
- CT-557 data path declaration v1 with stable region, directed-boundary, encryption, processor, JSON/YAML, and authoritative-context validation contracts.
- CT-558 audit package v1 with a closed declaration, approval, execution, and rollback artifact set, deterministic SHA-256 manifests, offline builder and verifier CLIs, and explicit authenticity boundaries.
- CT-559 fail-closed evidence gap detection v1 for missing, stale, conflicting, and unsigned records, with caller-supplied trust context and deterministic reports.
- CT-560 consolidated external-assessment workspace API contract with seven ordered stages, redacted delivery evidence, and explicit importer/verifier responsibility separation.
- CT-561 versioned compliance rule packs for MLPS preparation, data boundaries, and enterprise mappings, with deterministic upgrade chains and explicit non-certification reports.

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
