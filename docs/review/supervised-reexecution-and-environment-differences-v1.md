# Supervised re-execution and environment differences v1

[中文](supervised-reexecution-and-environment-differences-v1.zh-CN.md)

CT-619 records a later execution supervised by the assigned review lead and binds it to one exact historical Passport delivery and CT-618 recalculation. It deliberately distinguishes a **later execution** from **historical state reproduction**. A later run may be useful evidence, but it cannot recreate an earlier environment merely because its known inputs match.

## Required chain

The record is created only when all of these inputs verify together:

1. a CT-616 engagement whose level is exactly `supervised-reexecution`;
2. a CT-617 assessment eligible on its declared records;
3. an active, time-limited Passport share naming the assigned review lead and reviewer organization;
4. the exact checksum-verified historical delivery and its immutable run reference;
5. a valid CT-618 recalculation bound to the same engagement, assessment, share, Passport, and delivery;
6. a new run that starts after both the historical delivery and recalculation; and
7. a live-observation window and event-log fingerprint covering the complete new run.

The share must remain active at run start, run completion, and record creation. The creator and supervisor must both be the assigned review lead.

## Seven environment dimensions

`compareIndependentReviewRunEnvironment()` derives the historical side from `freeze.json`; callers cannot submit their own historical classification. The register always contains exactly seven dimensions in this order:

1. sites;
2. protocol;
3. workload;
4. method;
5. compute;
6. software; and
7. network.

The current snapshot marks each dimension as `observed`, `declared`, or `unknown` and supplies a SHA-256 fingerprint for every known value. A known matching fingerprint becomes `same`, a known non-matching fingerprint becomes `changed`, and either side being unavailable becomes `unknown`.

The current Passport delivery has structured historical data for sites, protocol, workload, and method. It does not have structured compute, software, or network snapshots, so those three comparisons remain `unknown` even when the later run declares values. The implementation never upgrades unknown history into a match.

## Temporal meaning

Every CT-619 record uses `classification: later-execution` and `historical_state_reproduced: false`. Matching all known dimensions does not change that result. Different clocks, transient load, firmware state, network conditions, dependencies, or unrecorded configuration may still affect the later run.

The record preserves the later run fingerprint, artifact-manifest fingerprint, supervision window, event-log fingerprint, historical references, environment differences, and derived counts. It does not compare performance results or infer improvement or regression.

## Trust boundary

CT-619 records supervision but does not externally attest the supervisor, authenticate the named principal, verify organization control, verify export authorization, or certify reviewer independence. It does not issue an opinion, mutate Passport status, establish a performance claim, adjudicate an SLA, or issue certification.

[CT-620](./opinion-appeal-correction-withdrawal-v1.md) adds a separately fingerprinted, source-derived opinion plus append-only appeal, correction, and withdrawal history. It does not expand the CT-619 trust boundary.

All checked-in examples are synthetic. Their purpose is to exercise binding and failure behavior without credentials, customer data, private infrastructure, or external network access.

## Run offline

```bash
node --test tests/review-supervised-reexecution.test.mjs
node examples/review/supervised-reexecution-synthetic.mjs
```
