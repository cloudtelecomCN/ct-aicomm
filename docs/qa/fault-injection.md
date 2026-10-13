# Fault injection gate

CT-519 defines a deterministic fail-static gate with five required scenarios: Agent disconnect, target failure, policy version conflict, stale metrics, and network jitter.

The runner accepts only evidence explicitly marked `simulated`. It rejects a run unless disconnected Agents prevent automatic execution, failed targets and excessive jitter produce confirmed rollback, stale policy revisions are rejected, stale metrics eliminate the candidate, and every scenario proves that no unapproved execution occurred.

The resulting report is immutable and fingerprinted. It is test evidence, not production performance evidence. CT-526 can use the same scenario names when recording real recovery time, error rate, and data-integrity observations in a POC environment.
