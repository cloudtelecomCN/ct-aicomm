# Enterprise pilot acceptance package

CT-533 defines one reviewable agreement for a CT-AIComm pilot. The machine-readable contract is [`../../specs/pilot/enterprise-pilot-acceptance-v1.schema.json`](../../specs/pilot/enterprise-pilot-acceptance-v1.schema.json), with a non-claimable synthetic template at [`../../examples/pilot/synthetic-enterprise-pilot.json`](../../examples/pilot/synthetic-enterprise-pilot.json).

## Required agreement

Before deployment, both parties must freeze the business question, in-scope and excluded services, dates, environment fingerprint, RACI ownership, metric definitions, target operators, minimum samples, required evidence, execution controls, data handling, and exit owner. Metrics must define exactly what is measured and cannot be replaced by marketing language after the run.

The pilot starts in `observe_only`. Human approval, a named change window, and a ready rollback path are mandatory. Automatic execution is restricted to the explicitly listed scope; an installation or recommendation is never execution authorization.

## Data boundary

The package separates allowed telemetry from prohibited credentials, payloads, prompts, customer identifiers, and unapproved topology. Encryption, role-bound access, export approval, retention, verified deletion, and evidence hashes are acceptance requirements rather than optional operating notes.

## Acceptance and exit

`accepted` requires measured evidence, customer and provider approvers, an independent review reference, and immutable evidence digests. Synthetic templates remain `draft` and `pending`, with `performance_claim_allowed: false` when validated.

At pilot end or a safety trigger, restore the baseline, uninstall the Agent, export the approved evidence package, delete restricted working data, close temporary access, and record completion. A qualified or rejected decision must retain exceptions; neither may be rewritten as an unconditional performance claim.
