# Baseline collection gate

CT-522 uses `buildBaselinePlan` and `runBaselinePlan` to collect the unchanged-route baseline. The plan requires a CT-521 manifest whose evidence origin is `measured`; the published synthetic freeze cannot pass this gate.

The batch retains every attempt, including failures, and binds all samples to one environment fingerprint and one deterministic plan hash. Reaching the requested sample count means collection is structurally complete, not that performance has improved. Statistical comparison starts only after all experimental groups are available.

The default methodology requires at least 200 measured requests per group and three repetitions. Production runs should load the versioned Prompt dataset, keep credentials in `VLLM_API_KEY`, and store the resulting JSON and raw samples in the restricted POC evidence location before publishing checksum-only references.

The first dual-node A10 baseline completed 200 measured requests per node with no failed attempts. Its checksum-only [public receipt](../../evidence/poc/ct-522-a10-dual-node-baseline-20261021.json) binds both restricted raw batches to the approved CT-521 environment. This is a baseline-completeness record, not an optimization claim.
