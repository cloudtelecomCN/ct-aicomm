# CT-Advisor Combination Builder v1

Status: public contract for CT-662. The implementation is deterministic, offline-capable, and uses synthetic fixtures only.

## Purpose

Combination Builder turns catalog resource references into a versioned `InfrastructureCombination`. A combination binds one GPU, cloud instance, region, network path, one or more software stacks, one or more pricing offers, and an explicit precision/topology/count configuration.

It supports side-by-side pre-procurement analysis. It does not apply customer constraints, score, rank, recommend, reserve capacity, deploy infrastructure, or change traffic.

## Inputs

- Manual JSON uses `infrastructure-combination-input-v1.schema.json`.
- JSON batch import accepts an array or a `{ schema_version, combinations }` bundle.
- CSV import requires the exact columns exported as `combinationCsvColumns`.
- CSV list fields use `|` between resource identifiers; RFC-style quoted fields and escaped double quotes are supported.
- One request contains 1-200 combinations. Every resource reference must use an immutable `advisor_resource_*` identifier.

## Deterministic checks

The builder resolves every reference against a supplied catalog snapshot and reports stable conflict codes for:

- missing resources and resource-type mismatches;
- duplicate references, combination keys, or complete signatures;
- expired, not-yet-effective, deprecated, or unauthorized resource sources;
- cloud-instance/GPU, cloud/region, network/region, software compatibility, and GPU-capacity conflicts;
- unsupported precision, pricing target/currency conflicts, and contradictory prices for the same target and billing unit.

An error produces `blocked`; warnings produce `needs_review`; an issue-free combination is `comparable`. A blocked combination must not be persisted by a conforming service.

## Comparison matrix

`buildCombinationComparison()` emits 19 ordered dimensions covering GPU, cloud, region, network, software, precision, topology, counts, currency, billing unit, and commitment. It reports unknown dimensions, mixed currencies, blocked rows, and duplicate signatures. It never emits a score or preferred row.

The output is intentionally the input boundary for later work:

- CT-663 applies data-readiness rules and hard constraints.
- CT-664 calculates multi-objective scenarios, Pareto sets, and sensitivity.

## Integrity

Each document contains:

- the normalized input digest;
- a signature digest over resource selections and configuration;
- immutable resolved resource and source digests;
- a content digest over the complete document;
- the builder version and evaluation timestamp.

Changing a stored field without recomputing the complete document fails `validateInfrastructureCombinationDocument()`.

## Product boundaries

Every combination states:

- `decision_support_only: true`
- `execution_authorized: false`
- `constraint_evaluation_performed: false`
- `ranking_performed: false`
- `performance_claim_allowed: false`

Every comparison states that constraints, scoring, ranking, recommendation, and execution are all absent.

## Run the contract tests

```bash
node --test tests/advisor-combination-builder.test.mjs
```

The fixtures are synthetic and do not represent vendor pricing, availability, benchmark results, or a purchasing recommendation.
