# Network-path-only experiment

CT-524 measures the eBPF data-plane effect independently from instance scheduling. The client endpoint, model artifact, prompt plan, generation parameters, repetitions, concurrency strata, and inference instance remain fixed. The baseline reaches that instance through a declared control route; the treatment sends the same logical destination through an isolated cgroup `connect4` redirect to the private VPC route.

`buildNetworkPathPlan` rejects an unchanged route, missing fixed-instance identity, synthetic environments, and invalid policy revisions. `runNetworkPathPlan` preserves failures and binds every sample to the candidate route and applied revision. Kernel program/object hashes, map snapshots, attach evidence, tunnel evidence, and raw samples stay in restricted storage; only a checksum-based receipt may be published.

A performance claim is allowed only after stratified comparison reports effect size, confidence intervals, tail latency, and success rate. The result applies only to the frozen POC topology and is not a general production claim.

The first measured A10 run completed 200 control and 200 eBPF-path requests with 100% success. Kernel execution was independently demonstrated while the logical endpoint had no listener. The P50 and P95 confidence intervals crossed zero, so the [public receipt](../../evidence/poc/ct-524-a10-network-path-20261021.json) records successful path execution but explicitly withholds a TTFT improvement claim.
