# Independent Run Review engagement and scope v1

[中文](engagement-and-scope-v1.zh-CN.md)

CT-616 defines the immutable instruction record that precedes independent review work. It closes a common evidence gap: a request to "review this result" is too ambiguous unless the exact evidence version, delivery, review level, tolerances, purpose, and expected outputs are fixed before work starts.

## Exact evidence binding

Every engagement references:

- one exact `passport_evidence_version`, including its content fingerprint;
- one exact `passport_delivery_manifest`, after offline package verification;
- the tenant shared by both records; and
- an active, sealed Passport state at the engagement creation time.

An engagement cannot silently move to a replacement Passport or a different delivery. A new evidence version therefore requires a new engagement.

## Review levels

| Level | Agreed outputs | What CT-616 proves |
|---|---|---|
| `structure-only` | scope record and structure checklist | only that a structure review was commissioned |
| `statistical-recalculation` | structure outputs, recalculation report, difference register | only that recalculation was commissioned |
| `supervised-reexecution` | recalculation outputs, supervised-run reference, environment differences | only that a future supervised execution was commissioned |

The level controls the required delivery list. CT-616 does not create any of those findings.

## Tolerance and purpose

Tolerance must be explicit:

- `exact` permits no tolerance rules; or
- `declared-thresholds` requires one or more metric, unit, comparison, and threshold rules.

The purpose records an intended-use category and a bounded statement. Every engagement explicitly prohibits use as certification, a legal conclusion, a performance guarantee, production-control authorization, or SLA adjudication.

## Delivery agreement

The agreement fixes a due time, delivery mode, formats, languages, and level-specific deliverables. It contains no bearer secret or artifact bytes. Authorization to access restricted evidence remains a separate decision.

## Scope replacement rule

The following fields form the immutable scope:

1. Passport reference.
2. Delivery reference.
3. Review level.
4. Tolerance policy.
5. Purpose.
6. Delivery agreement.

Any scope change requires a new engagement. The successor must use a different `engagement_id`, point to the exact previous fingerprint, state a reason, and change at least one scope field. The implementation rejects same-ID changes and no-op successors.

## Trust boundary

A valid engagement means only that a structurally complete, fingerprinted instruction exists. It does not prove identity, organization, conflicts of interest, reviewer independence, evidence access authorization, review performance, an opinion, SLA breach, performance, or certification. [CT-617](./identity-organization-and-conflicts-v1.md) provides a separate, declared-records-only identity, organization, payment, separation-of-duties, conflict, and recusal gate. [CT-618](./structure-and-statistical-recalculation-v1.md) separately records bounded structure checks and statistical recalculation; [CT-619](./supervised-reexecution-and-environment-differences-v1.md) records a later supervised execution and environment differences without claiming historical-state reproduction; [CT-620](./opinion-appeal-correction-withdrawal-v1.md) adds the governed opinion lifecycle.

## Offline example

```bash
node examples/review/engagement-scope-synthetic.mjs
node --test tests/review-engagement-scope.test.mjs
```

The example uses synthetic evidence, makes no production claim, and requires no credentials or external network.
