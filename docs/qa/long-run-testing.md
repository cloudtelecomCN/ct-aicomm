# Long-run stability gate

CT-581 is an evidence gate, not a duration claim inferred from a short test. It has three independent stages:

| Stage | Minimum duration | Meaning |
| --- | ---: | --- |
| `preflight` | 240 seconds | Verifies the workload, host monitor, Agent heartbeat, failure accounting, and evidence pipeline. |
| `seven_day` | 604,800 seconds | First release gate for the measured two-node environment. |
| `thirty_day` | 2,592,000 seconds | Extended operations gate. It is not implied by the seven-day result. |

## Frozen boundary

The immutable manifest binds the full Git commit, environment fingerprint, model, node and endpoint aliases, load strata, thresholds, and SHA-256 fingerprints for the prompt set, TTFT collector, soak runner, host monitor, Agent runtime, and eBPF object. The frozen experiment window must contain the whole requested stage. Runtime addresses, credentials, and raw samples remain restricted and never appear in the public manifest or receipt.

Agent `0.1.x` is deliberately observe-only. This gate can prove that its real eBPF programs remain loaded and attached without unexplained restarts or resource growth; it does not claim that enforcement or autonomous traffic redirection is enabled.

## Runbook

Build and install a signed Agent package on every measured node. Before a timed stage, run the real-kernel lifecycle check as root:

```bash
agent/install/test-kernel-runtime.sh \
  /usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  /usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o
```

Create the immutable manifest. The output path must not already exist:

```bash
node scripts/create-soak-manifest.mjs \
  --stage=seven_day \
  --started-at=2026-01-01T00:00:00.000Z \
  --source-commit=<full-40-character-commit> \
  --environment=<restricted-environment.json> \
  --prompts=<restricted-prompts.jsonl> \
  --agent=/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  --bpf=/usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o \
  --collector=packages/ttft-collector/collector.mjs \
  --runner=scripts/run-soak-stage.mjs \
  --monitor=scripts/soak_monitor.py \
  --output=<restricted-run>/manifest.json
```

Run one resumable host monitor per declared node:

```bash
python3 scripts/soak_monitor.py \
  --manifest=<restricted-run>/manifest.json \
  --node-alias=node-a \
  --output=<restricted-run>/node-a
```

Run the workload from the controller. Endpoint values are runtime-only inputs and must stay in restricted configuration:

```bash
node scripts/run-soak-stage.mjs \
  --manifest=<restricted-run>/manifest.json \
  --environment=<restricted-environment.json> \
  --prompts=<restricted-prompts.jsonl> \
  --agent=/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  --bpf=/usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o \
  --collector=packages/ttft-collector/collector.mjs \
  --monitor=scripts/soak_monitor.py \
  --endpoint=endpoint-a=<restricted-url> \
  --endpoint=endpoint-b=<restricted-url> \
  --output=<restricted-run>/workload
```

Only after the workload and every node monitor produce completion records may the public receipt be finalized:

```bash
node scripts/finalize-soak-stage.mjs \
  --manifest=<restricted-run>/manifest.json \
  --workload-windows=<restricted-run>/workload/workload-windows.jsonl \
  --workload-completion=<restricted-run>/workload/completed.json \
  --node-observations=node-a=<restricted-run>/node-a/observations.jsonl \
  --node-completion=node-a=<restricted-run>/node-a/completed.json \
  --node-observations=node-b=<restricted-run>/node-b/observations.jsonl \
  --node-completion=node-b=<restricted-run>/node-b/completed.json \
  --output=<restricted-run>/public-receipt.json
```

The finalizer verifies completion-record hashes before evaluating the gate. Missing or reordered ledger records, out-of-window samples, stale Agent heartbeats, inactive services, PID or boot changes, restarts, artifact drift, excess failure rate, TTFT drift, and resource growth all fail closed.

## Current status

The first short workload completed 10,240 of 10,240 attempts across 160 topology, repetition, and concurrency strata. Its active request window was approximately 244 seconds; surrounding GPU and process-CPU monitoring covered approximately 485 seconds, and both inference services reported zero restarts. The [public receipt](../../evidence/quality/ct-581-a10-soak-preflight-20261022.json) remains explicitly `partial`: it predates the complete Agent RSS and immutable-completion pipeline, and neither the seven-day nor thirty-day gate has passed.
