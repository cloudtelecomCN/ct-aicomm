# Fault injection gate

CT-519 defines a deterministic fail-static gate with five required scenarios: Agent disconnect, target failure, policy version conflict, stale metrics, and network jitter.

The runner accepts only evidence explicitly marked `simulated`. It rejects a run unless disconnected Agents prevent automatic execution, failed targets and excessive jitter produce confirmed rollback, stale policy revisions are rejected, stale metrics eliminate the candidate, and every scenario proves that no unapproved execution occurred.

The resulting report is immutable and fingerprinted. It is test evidence, not production performance evidence. CT-526 can use the same scenario names when recording real recovery time, error rate, and data-integrity observations in a POC environment.

CT-526 uses a separate measured contract in [`../../packages/qa/measured-fault-experiment.mjs`](../../packages/qa/measured-fault-experiment.mjs). Every required scenario must report measured recovery time, request and error counts, a mathematically consistent error rate, before/after state fingerprints, and confirmed data integrity. Scenario-specific fail-static and rollback assertions remain mandatory; a simulated CT-519 result cannot pass the CT-526 gate.

The first dual-node A10 run contained all five required faults across 50 probes, preserved data integrity, and recorded a maximum recovery time of 780.98 ms. The [public receipt](../../evidence/poc/ct-526-a10-stability-rollback-20261021.json) publishes scenario-level recovery and error rates plus restricted evidence hashes. It does not claim a production availability SLO.
