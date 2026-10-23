# Independent review identity, organization, and conflicts v1

[中文](identity-organization-and-conflicts-v1.zh-CN.md)

CT-617 adds an immutable independence gate to one exact CT-616 engagement. It records pseudonymous subject identifiers, organization membership, ultimate-controller declarations, required role assignments, the payer and payee, conflict disclosures, and effective recusals. The gate is evaluated before later review work or opinion issuance.

## Required roles and separation

Every assessment assigns exactly one commissioner, evidence submitter, review lead, independence assessor, and opinion signer. The commissioner must match the engagement. The three reviewer roles must belong to the engagement's intended reviewer organization.

The reviewer roles must be held by different subjects. Neither the commissioner nor the evidence submitter may also act as review lead, independence assessor, or opinion signer. A role overlap produces the stable `subject-role-conflict` blocker.

## Ultimate control and payment

Each involved organization declares one ultimate controller. The opinion signer's controller is compared with the commissioner, evidence submitter, and payer controllers. A signer under the same ultimate controller cannot be eligible to sign an independent opinion. The gate records `same-ultimate-controller` and fails closed.

The payment disclosure records payer, payee, fee basis, and whether compensation depends on the outcome. The payee must be the intended reviewer organization, payer and payee must differ, and outcome-contingent payment is always blocking. A fixed fee does not by itself prove independence; it is only one disclosed fact.

## Conflicts and recusals

A conflict is `unresolved`, `recused`, or `disqualifying`. Unresolved and disqualifying conflicts block eligibility. A recused conflict must reference one exact recusal naming the affected subject and role, a different replacement subject, an effective time, and a reason. The current role assignment must already name that replacement. Orphaned, late, mismatched, or self-replacing recusals are rejected rather than treated as managed conflicts.

## Gate result

The result is either `eligible-on-declared-records` or `ineligible`. Eligibility is reproducibly derived from the disclosed records and never accepted as caller-supplied truth. `assertIndependentOpinionSignerEligible()` rejects an ineligible signer, which gives CT-620 a hard prerequisite without issuing an opinion in CT-617.

The assessment and its gate are content-fingerprinted. Any edit changes the fingerprint and requires a new immutable record.

## Trust boundary

`self-declared` means no supporting reference is supplied. `document-reference` requires checksum-bound references, but this package does not fetch those documents, authenticate a person, validate corporate ownership, or decide whether the referenced document is authoritative. Therefore a passing gate is explicitly `declared-records-only`; it is not external verification or certification of reviewer independence.

CT-617 does not authorize restricted evidence access, perform structural checks, recalculate statistics, rerun a workload, issue an opinion, modify a Passport, adjudicate an SLA, make a performance claim, or issue certification. CT-618–620 add separately governed review work and opinion lifecycle records.

## Run offline

```bash
node --test tests/review-independence-conflicts.test.mjs
node examples/review/identity-conflict-synthetic.mjs
```

The example is synthetic and performs no network access.
