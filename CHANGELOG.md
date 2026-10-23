# Changelog

All notable public changes to CT-AIComm are recorded in this file. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for tagged public releases.

## [Unreleased]

### Added

- Publish the deterministic CT-Advisor Data Gate and hard-constraint rules, schemas, reference implementation, fixed fingerprints, and bilingual boundary documentation. Unknown or unmapped hard constraints fail closed, excluded candidates retain explicit reasons, and the gate cannot score, rank, recommend, impute, or authorize execution.
- CT-656 CT-Advisor 2.0 public product contract with a frozen free-access matrix, maturity vocabulary, one explicit paid-package key, strict JSON Schema, bilingual documentation, and no private pricing or entitlement data.
- CT-657 versioned CT-Advisor task template registry with explicit maturity and enablement states, free-access and non-execution boundaries, strict public Schemas, and one synthetic fixture per template.
- CT-659 Requirement Passport 2.0 with multi-template field profiles, canonical units, explicit provenance and confidence, immutable frozen revisions, deterministic SHA-256 verification, and one non-claiming synthetic fixture per task template.
- CT-660 source-bound GPU, cloud-instance, region, network-path, software, and pricing catalog contracts with canonical units, validity and authorization checks, public/private isolation, deterministic SHA-256 verification, and explicitly synthetic fixtures.
- CT-661 deterministic Advisor sizing and cost formulas with interval arithmetic, canonical units, explicit unknown/not-applicable semantics, source-bound inputs, fixed synthetic expectations, and no inventory, performance, or execution claims.
- CT-662 Combination Builder public contracts with strict manual/CSV/JSON inputs, catalog-bound conflict detection, immutable fingerprints, and a 19-dimension side-by-side matrix that performs no constraints, scoring, ranking, recommendation, or execution.
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
- CT-614 checksum-bound Passport delivery packages with JSON, source CSV, deterministic human summaries, fixed statistics algorithms, and a symlink-safe offline verifier that independently recomputes every delivered statistic.
- CT-615 time-limited Passport sharing, append-only revocation, hash-referenced supplemental evidence, and buyer-scoped acceptance or rejection records that cannot mutate platform evidence status.
- CT-616 immutable Independent Run Review engagements with exact Passport and delivery bindings, explicit levels, tolerances, purposes, delivery agreements, and mandatory new engagement identities for every scope change.
- CT-617 immutable, declared-records-only independence assessments for identity, organization control, payment, role separation, conflicts, and recusals, with a fail-closed gate that prevents same-controller opinion signing.
- CT-618 immutable structure checklists, independent sample recalculation, exact tolerance coverage, and explainable difference registers bound to an eligible independence gate and active reviewer share.
- CT-619 immutable supervised later-execution records, complete supervision-window checks, and a derived seven-dimension environment difference register that never claims historical-state reproduction.
- CT-620 source-derived `consistent`, `deviation`, or `uncertain` opinions with role-separated issuance, append-only appeals, source-bound corrections, terminal withdrawal, and a complete fingerprint-chained history that sales and evidence submitters cannot alter.
- CT-621 read-only review workspaces, eligibility-gated scope marks that always display institution, date, scope, outcome, and limitations, plus a fixed five-file checksum-bound offline export without customer or source records.
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
