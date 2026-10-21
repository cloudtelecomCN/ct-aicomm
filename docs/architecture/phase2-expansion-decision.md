# Phase 2 expansion decision

CT-534 selects **scale testing** as the immediate Phase 2 engineering priority, followed by Kubernetes validation. Multi-cloud remains deferred until one repeatable cluster delivery exists. XDP/DPDK remains on hold until measured network-only evidence identifies a material packet-processing bottleneck and a supported effect target.

The machine-readable [decision record](../../evidence/architecture/ct-534-phase2-expansion-decision-20261021.json) cites CT-523 through CT-526 and CT-530. Instance scheduling and the joint path showed bounded gains in one frozen environment. The eBPF network-only run proved real execution but did not establish a statistically supported TTFT improvement. That result argues for testing generalization and capacity before investing in a more invasive packet path.

This decision authorizes planning, not a broad performance claim. CT-527 independent review and CT-528 publication remain required before externally presenting the measured POC result as verified. Each expansion option has explicit entry gates and exit evidence so priorities can be revisited without rewriting prior evidence.
