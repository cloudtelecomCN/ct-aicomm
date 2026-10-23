# Independent Run Review engagement

[中文](README.zh-CN.md)

This zero-dependency Node.js package implements the CT-616 engagement and scope contract. It binds a commission to one exact Link Evidence Passport version and one checksum-verified delivery manifest, then records the agreed review level, tolerances, intended use, prohibited uses, and delivery outputs.

The package creates immutable, fingerprinted records. If any scope field changes, the caller must create a new `engagement_id`, reference the exact prior engagement, and explain the change. Reusing an engagement identity or creating a no-op successor fails closed.

## Public API

- `createIndependentReviewEngagement(input)` creates an initial or successor engagement.
- `verifyIndependentReviewEngagement(input)` verifies the fingerprint, exact Passport and delivery bindings, active version state, and optional predecessor.
- `compareIndependentReviewScope({ baseline, candidate })` lists changed top-level scope fields and reports whether a new engagement satisfies the replacement rule.

## Trust boundary

An engagement records instructions only. It does not establish reviewer independence, authenticate either party, authorize access to restricted evidence, perform recalculation or execution, issue an opinion, mutate Passport status, adjudicate an SLA, make a performance claim, or issue certification. Those responsibilities require later, separately governed records.

See the [bilingual integration guide](../../docs/review/engagement-and-scope-v1.md) and the [synthetic example](../../examples/review/engagement-scope-synthetic.mjs).
