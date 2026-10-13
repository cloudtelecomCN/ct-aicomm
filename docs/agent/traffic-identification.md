# cgroup/tc traffic identification

The CT-DataPlane Agent selector uses two read-only classification stages:

1. `cgroup/connect4` accepts all connections unchanged but records sockets only when both the current cgroup ID and destination port are explicitly allowlisted.
2. `tc/egress` looks up the socket cookie and emits metadata only for previously selected sockets. Every packet returns `TC_ACT_OK`.

The program does not redirect, drop, mirror, or capture payloads. Non-selected processes and ports pass without event generation. The selector policy defaults to `pass_unmodified`, rejects empty allowlists, and creates deterministic BPF map entries.

Source: [`../../agent/bpf/ct_selector.bpf.c`](../../agent/bpf/ct_selector.bpf.c)

Linux compilation is enforced by the eBPF GitHub workflow. Loading and attaching the program still requires a compatible Linux test node with BTF, cgroup v2, and the capabilities defined by the Agent security boundary.
