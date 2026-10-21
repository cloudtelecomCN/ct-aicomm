# Instance scheduling experiment

CT-523 measures the independent effect of Connector and Orchestrator instance selection. The network path remains fixed; no Agent redirect or network policy change is allowed in this group.

`buildInstanceSchedulingPlan` stratifies the same versioned Prompt set across the frozen repetitions and concurrency levels. Before every bounded request window, `runInstanceSchedulingPlan` collects fresh vLLM load and health evidence for every discovered instance, builds the existing candidate model, applies the deterministic instance-only score, and records the complete decision explanation. The instance-only policy assigns weight only to queue evidence and health; fixed network, geography, and cost controls are retained in the evidence but cannot affect selection. Local in-window reservations prevent a concurrent batch from stampeding one instance. Every sample is bound to the selected candidate, decision receipt, plan, and CT-521 environment fingerprint.

If metrics are missing, stale, degraded, or no candidate is eligible, execution stops and the existing route remains unchanged. Results are not an optimization claim until paired analysis against the approved CT-522 baseline reports effect size, confidence intervals, success rate, and tail latency.

The first measured dual-A10 run is represented by a checksum-bound [public receipt](../../evidence/poc/ct-523-a10-instance-scheduling-20261021.json). Within that frozen POC only, the claim gate passed for P50, P95, P99, and success rate. The receipt publishes the measured effect and confidence intervals together with explicit limitations; raw samples and per-request decisions remain restricted.
