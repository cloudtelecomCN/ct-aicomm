# TTFT methodology v1

The machine-readable protocol is [`../../specs/bench/ttft-methodology-v1.json`](../../specs/bench/ttft-methodology-v1.json), with the versioned prompt set in [`../../examples/bench/ct-ttft-prompts-v1.jsonl`](../../examples/bench/ct-ttft-prompts-v1.jsonl).

The protocol compares four groups: unchanged baseline, instance selection only, network path only, and joint optimization. Model artifacts, prompts, generation parameters, runtime versions, hardware, concurrency, and test window remain controlled within each comparison.

Warmup observations are not measured. Every measured attempt is retained. Failed attempts contribute to success rate but not latency percentiles, and must include a failure code. Post-hoc outlier removal is prohibited. Results report p50, p95, p99, effect size, and a 95% bootstrap confidence interval. A performance improvement is not claimed when that interval includes zero.

Synthetic and measured observations are never aggregated. Negative and no-improvement outcomes are published under the same evidence rules as positive outcomes.
