# Controlled target redirect

CT-506 adds an explicit redirect map after the CT-505 traffic selector. A connection is eligible only when its cgroup ID and original destination port pass the selector and its complete original IPv4 endpoint exists in `redirect_routes`. The eBPF program then replaces the destination with the preloaded target and emits an event containing both endpoints and the applied revision. Every other connection continues unchanged.

The control-plane policy requires at least two unique, named target endpoints. `ControlledRedirector` rejects targets outside that allowlist, unchanged targets, and non-monotonic revisions. A successful switch returns the exact BPF map entry and a fingerprinted audit record containing the old target, new target, source endpoint, policy ID, revision, and timestamp.

This task deliberately does not make the map update autonomous. Loading the returned entry remains an Agent operation governed by the prepare/apply protocol introduced in CT-509. The example policy is available at [`../../examples/agent/redirect-policy.json`](../../examples/agent/redirect-policy.json).
