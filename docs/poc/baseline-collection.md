# Baseline collection gate

CT-522 uses `buildBaselinePlan` and `runBaselinePlan` to collect the unchanged-route baseline. The plan requires a CT-521 manifest whose evidence origin is `measured`; the published synthetic freeze cannot pass this gate.

The batch retains every attempt, including failures, and binds all samples to one environment fingerprint and one deterministic plan hash. Reaching the requested sample count means collection is structurally complete, not that performance has improved. Statistical comparison starts only after all experimental groups are available.

The default methodology requires at least 200 measured requests per group and three repetitions. Production runs should load the versioned Prompt dataset, keep credentials in `VLLM_API_KEY`, and store the resulting JSON and raw samples in the restricted POC evidence location before publishing checksum-only references.
