# Multi-endpoint scale testing

CT-534 Phase 2 uses `buildScalePlan`, `runScalePlan`, and `summarizeScaleBatch` to compare a frozen single-endpoint topology with a declared multi-endpoint topology. The plan contains stable aliases only. Runtime URLs, credentials, hostnames, and private network details are injected at execution time and remain in restricted evidence.

The runner executes every topology, repetition, and concurrency stratum with bounded parallelism. It retains failed and missing attempts, reports successful request throughput, and calculates TTFT percentiles only from successful first-content observations. A complete run writes `plan.json`, `batch.json`, `summary.json`, and `SHA256SUMS` with restrictive file modes.

```bash
node scripts/run-scale-experiment.mjs \
  --environment=/restricted/environment.json \
  --prompts=examples/bench/ct-ttft-prompts-v1.jsonl \
  --endpoint=node-a=http://127.0.0.1:8000 \
  --endpoint=node-b=http://10.0.0.2:8000 \
  --topology=single-endpoint:node-a \
  --topology=all-endpoints:node-a,node-b \
  --concurrency=1,8,32,64 \
  --samples=64 \
  --repetitions=2 \
  --output=/restricted/scale-run
```

The first frozen dual-A10 run completed 1,024 of 1,024 attempts. At concurrency 64, the two-endpoint topology recorded 366.20 successful requests per second and 177.55 ms P95 TTFT; the single-endpoint topology recorded 198.83 successful requests per second and 326.32 ms P95 TTFT. The [public receipt](../../evidence/architecture/ct-534-a10-scale-20261022.json) binds those figures to restricted raw evidence hashes.

These measurements apply only to the frozen model, software, prompts, topology, and network. They are not a production capacity rating, an availability SLO, proof of linear scaling, or evidence for other accelerators or regions. The single-endpoint comparison used one named endpoint and therefore also includes any endpoint-specific asymmetry present during the run.
