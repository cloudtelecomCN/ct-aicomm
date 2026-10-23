# Independent Run Review contracts

[中文](README.zh-CN.md)

This zero-dependency Node.js package implements the CT-616 engagement and scope contract plus the CT-617 identity, organization, and conflict gate. CT-616 binds a commission to one exact Link Evidence Passport version and one checksum-verified delivery manifest. CT-617 binds declared subjects, ultimate control, payment, role separation, conflicts, and recusals to that exact engagement.

The package creates immutable, fingerprinted records. If any scope field changes, the caller must create a new `engagement_id`, reference the exact prior engagement, and explain the change. Reusing an engagement identity or creating a no-op successor fails closed.

## Public API

- `createIndependentReviewEngagement(input)` creates an initial or successor engagement.
- `verifyIndependentReviewEngagement(input)` verifies the fingerprint, exact Passport and delivery bindings, active version state, and optional predecessor.
- `compareIndependentReviewScope({ baseline, candidate })` lists changed top-level scope fields and reports whether a new engagement satisfies the replacement rule.
- `createIndependentReviewIndependenceAssessment(input)` creates an immutable, declared-records-only independence gate.
- `verifyIndependentReviewIndependenceAssessment(input)` recomputes the gate from the exact engagement, organizations, roles, payment, conflicts, and recusals.
- `assertIndependentOpinionSignerEligible(input)` fails closed when common control, role overlap, contingent payment, or unmanaged conflict prevents later opinion signing.

## Trust boundary

An engagement records instructions only and does not establish reviewer independence. The CT-617 gate is declared-records-only: it does not authenticate either party, externally verify corporate control, certify reviewer independence, authorize access to restricted evidence, perform recalculation or execution, issue an opinion, mutate Passport status, adjudicate an SLA, make a performance claim, or issue certification. Those responsibilities require later, separately governed records.

See the CT-616 [engagement guide](../../docs/review/engagement-and-scope-v1.md), the CT-617 [identity and conflict guide](../../docs/review/identity-organization-and-conflicts-v1.md), and their synthetic examples.
