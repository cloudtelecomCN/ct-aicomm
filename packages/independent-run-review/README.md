# Independent Run Review contracts

[中文](README.zh-CN.md)

This zero-dependency Node.js package implements the CT-616 engagement and scope contract, the CT-617 identity, organization, and conflict gate, the CT-618 structure and statistical recalculation record, the CT-619 supervised re-execution record, and the CT-620 opinion lifecycle. CT-616 binds a commission to one exact Link Evidence Passport version and one checksum-verified delivery manifest. CT-617 binds declared subjects, ultimate control, payment, role separation, conflicts, and recusals to that exact engagement. CT-618 requires an active reviewer share, independently recalculates the authorized samples, applies the declared tolerance policy, and records every non-exact difference. CT-619 binds a later supervised run and derived seven-dimension environment register to the exact historical package without claiming historical-state reproduction. CT-620 derives the opinion finding from verified sources and retains appeals, corrections, and withdrawal in a fingerprint-chained history.

The package creates immutable, fingerprinted records. If any scope field changes, the caller must create a new `engagement_id`, reference the exact prior engagement, and explain the change. Reusing an engagement identity or creating a no-op successor fails closed.

## Public API

- `createIndependentReviewEngagement(input)` creates an initial or successor engagement.
- `verifyIndependentReviewEngagement(input)` verifies the fingerprint, exact Passport and delivery bindings, active version state, and optional predecessor.
- `compareIndependentReviewScope({ baseline, candidate })` lists changed top-level scope fields and reports whether a new engagement satisfies the replacement rule.
- `createIndependentReviewIndependenceAssessment(input)` creates an immutable, declared-records-only independence gate.
- `verifyIndependentReviewIndependenceAssessment(input)` recomputes the gate from the exact engagement, organizations, roles, payment, conflicts, and recusals.
- `assertIndependentOpinionSignerEligible(input)` fails closed when common control, role overlap, contingent payment, or unmanaged conflict prevents later opinion signing.
- `recalculateIndependentReviewStatistics({ delivery })` independently derives the fixed-profile values from the checksum-verified sample package.
- `createIndependentReviewRecalculation(input)` creates the seven-check structure result, per-statistic comparison, and immutable difference register.
- `verifyIndependentReviewRecalculation(input)` rebuilds every derived result from the exact engagement, independence assessment, active share, delivery, and submitted recalculation values.
- `compareIndependentReviewRunEnvironment(input)` derives the fixed seven-dimension difference register from the historical freeze and current snapshot.
- `createIndependentReviewSupervisedReexecution(input)` records one later run, complete supervision window, event-log fingerprint, and environment differences.
- `verifyIndependentReviewSupervisedReexecution(input)` rebuilds the historical bindings, temporal relation, supervision checks, environment classifications, and summary.
- `createIndependentReviewOpinion(input)` derives and signs one bounded `consistent`, `deviation`, or `uncertain` finding.
- `createIndependentReviewOpinionEvent(input)` appends a role-checked appeal, resolution, correction, or withdrawal event.
- `projectIndependentReviewOpinion(input)` projects the current finding without overwriting the original opinion.
- `createIndependentReviewOpinionLifecycle(input)` emits the opinion, complete event history, and current projection as one fingerprinted ledger.
- `verifyIndependentReviewOpinionLifecycle(input)` rebuilds every source and transition, including each correction source.

## Trust boundary

An engagement records instructions only and does not establish reviewer independence. The CT-617 gate is declared-records-only. CT-618 records limited structure and recalculation work, CT-619 records a later supervised execution and environment differences, and CT-620 issues only a bounded source-derived review opinion. Implementation, supervision, and signer identities remain declared, and an active share record is not external proof of authentication or export authorization. The package does not externally verify corporate control, attest supervision, certify reviewer independence, reproduce a historical state, mutate Passport status, adjudicate an SLA, make a performance claim, provide a legal conclusion, or issue certification.

See the CT-616 [engagement guide](../../docs/review/engagement-and-scope-v1.md), the CT-617 [identity and conflict guide](../../docs/review/identity-organization-and-conflicts-v1.md), the CT-618 [structure and recalculation guide](../../docs/review/structure-and-statistical-recalculation-v1.md), the CT-619 [supervised re-execution guide](../../docs/review/supervised-reexecution-and-environment-differences-v1.md), the CT-620 [opinion lifecycle guide](../../docs/review/opinion-appeal-correction-withdrawal-v1.md), and their synthetic examples.
