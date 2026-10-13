# Two-phase policy execution

CT-509 separates policy validation from network mutation. `prepare_policy` verifies the complete policy fingerprint, route binding, expiry, and a revision newer than the active state. It stores one immutable prepared transaction and returns a receipt without changing traffic.

`apply_policy` is accepted only when its policy ID, revision, fingerprint, and prepare receipt all match that transaction and the lease is still valid. The execution callback runs only after those checks. A missing preparation, stale revision, expired lease, altered payload, or mismatched receipt is rejected before any map update.

Preparation is intentionally single-slot: a newer accepted preparation supersedes an older uncommitted one. After successful application the slot is cleared and the active revision advances. Rollback history and circuit-breaker behavior are added in CT-512 and CT-513.
