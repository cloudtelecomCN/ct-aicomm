# Human approval and automatic execution boundary

CT-517 defaults every execution to human approval. Automatic execution is available only when the scenario is explicitly allowlisted, risk is `low`, exactly one service is affected, rollback is ready, the selected candidate matches the decision explanation, the score is below the rule limit, and any cross-domain action is explicitly permitted.

Any failed condition returns `manual_approval_required` with machine-readable reasons. Manual approval enforces requester/approver separation, requires a justification, expires within at most one hour, and binds to the complete assessment fingerprint. Authorization verifies approval integrity, binding, and expiry immediately before execution.

The boundary assessment and authorization are fingerprinted artifacts for CT-511 audit. An allowlist entry is a narrow permission, not a global switch; scenarios absent from the list remain manual by default.
