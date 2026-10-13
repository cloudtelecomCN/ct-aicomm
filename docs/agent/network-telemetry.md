# Network telemetry

CT-507 associates every observation with a route identity derived from the original service endpoint, the effective redirect target, and the applied policy revision. This prevents measurements from different routes or policy generations from being merged accidentally.

The Agent reports measured smoothed RTT in microseconds, retransmit deltas, and connection-error deltas. A missing metric remains `null`; an event with no measured metric is rejected. The reporter keeps the latest measured RTT and cumulative retransmit and error counts per route without manufacturing defaults.

The `sockops` eBPF program emits RTT, retransmit, and TCP close events only for socket cookies previously selected by CT-505. A userspace Agent loader converts those kernel events and explicit connect failures into the versioned payload demonstrated in [`../../examples/agent/network-telemetry.json`](../../examples/agent/network-telemetry.json).
