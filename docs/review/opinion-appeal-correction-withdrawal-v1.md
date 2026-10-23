# Opinion, appeal, correction, and withdrawal v1

[中文](opinion-appeal-correction-withdrawal-v1.zh-CN.md)

CT-620 adds a governed opinion lifecycle to the exact CT-616 through CT-619 records. It derives a bounded finding from verified recalculation and optional later-execution records, identifies the eligible CT-617 opinion signer, and retains every appeal, resolution, correction, and withdrawal in one append-only history.

## Derived outcomes

The caller cannot supply an outcome. The reference implementation derives exactly one of:

- `consistent`: no recalculated statistic is outside the declared tolerance and no attached later execution introduces a changed or unknown environment dimension;
- `deviation`: at least one recalculated statistic is outside the declared tolerance;
- `uncertain`: recalculation has no outside-tolerance result, but an attached later execution contains a changed or unknown environment dimension.

`deviation` takes precedence over `uncertain`. A later execution always remains a later execution; CT-620 never describes it as historical-state reproduction. The finding contains per-statistic and per-environment-dimension entries plus a separate finding fingerprint.

## Roles and authority

Only the exact `opinion-signer` made eligible by the CT-617 declared-records gate can issue an opinion, resolve an appeal, issue a correction, or withdraw an opinion. The evidence submitter and commissioner may file an appeal. A sales actor belonging to the commissioning organization may forward an appeal. Sales and the submitter cannot modify a finding, resolve an appeal, issue a correction, or withdraw an opinion.

An eligible CT-617 gate is still based on declared records. It does not externally authenticate the signer or certify independence.

## Append-only lifecycle

Every event has a monotonic sequence, canonical UTC time, exact opinion reference, prior-event fingerprint, and content fingerprint. The allowed events are:

1. `appeal-filed`: records the disputed current finding and requested remedy without changing it;
2. `appeal-resolved`: records `upheld`, `correction-required`, or `withdrawal-required` by the eligible signer;
3. `correction-issued`: requires a resolved correction-required appeal and a different verified source record; it creates a new current finding while retaining the original opinion;
4. `withdrawal-issued`: requires a resolved withdrawal-required appeal, marks the lifecycle withdrawn, and is terminal.

Correction never overwrites an earlier record. Projection returns the original opinion, every event, every appeal state, the current source-bound finding, and the terminal status. Reordering, deleting from a stored lifecycle, duplicating, backdating, or altering an event breaks the chain or lifecycle fingerprint.

## Trust boundary

CT-620 records a limited independent-review opinion. It does not authenticate principals, externally verify organization control or export authorization, certify reviewer independence, reproduce historical state, mutate a Passport, establish a performance claim, adjudicate an SLA, provide a legal conclusion, or issue certification. The included scenario is synthetic.

## Run offline

```bash
node --test tests/review-opinion-lifecycle.test.mjs
node examples/review/opinion-lifecycle-synthetic.mjs
```

The reference module is [`packages/independent-run-review/opinion.mjs`](../../packages/independent-run-review/opinion.mjs), its public types are in [`opinion.d.ts`](../../packages/independent-run-review/opinion.d.ts), and the closed schema is [`review-opinion-lifecycle-v1.schema.json`](../../specs/review/review-opinion-lifecycle-v1.schema.json).
