# Joint optimization experiment

CT-525 combines the CT-523 measured instance decision with CT-524 versioned eBPF path execution. Before each bounded request window, the runner collects fresh vLLM load/health and measured network evidence, applies the deterministic TTFT joint score, and sends each request through the selected candidate's logical cgroup route. Every sample records the selected instance, route identity, decision explanation, and applied policy revision.

The runner fails static when measured evidence is stale or incomplete, no candidate is eligible, or any candidate lacks a versioned logical route. Raw topology, map values, network probes, and request records remain restricted. A published result must compare the joint group with the frozen baseline and separately report interaction against the instance-only and network-only groups.

The first measured A10 run completed 200 decisions and requests with 100% success, splitting selections 101/99 across the two candidates. Stratified bootstrap against the 400-sample frozen baseline supported lower P50, P95, and P99 TTFT in this POC. The [public receipt](../../evidence/poc/ct-525-a10-joint-optimization-20261021.json) bounds that claim to the frozen environment and marks the cross-experiment interaction estimate as exploratory because the control routes were not identical.
