# Orchestrator candidate model

The candidate model joins a discovered inference instance with normalized load metrics, network evidence, geography, health, and freshness. It produces an immutable eligibility record and machine-readable exclusion reasons.

This layer does not rank candidates. It prevents incomplete, stale, mismatched, or degraded evidence from entering the later scoring stage. Null observations remain null and make the candidate ineligible; they are never replaced with optimistic defaults.
