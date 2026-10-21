# cgroup/tc traffic identification

The CT-DataPlane Agent selector uses two read-only classification stages:

1. `cgroup/connect4` accepts all connections unchanged but records sockets only when both the current cgroup ID and destination port are explicitly allowlisted.
2. `tc/egress` looks up the socket cookie and emits metadata only for previously selected sockets. Every packet returns `TC_ACT_OK`.

The program does not redirect, drop, mirror, or capture payloads. Non-selected processes and ports pass without event generation. The selector policy defaults to `pass_unmodified`, rejects empty allowlists, and creates deterministic BPF map entries.

Source: [`../../agent/bpf/ct_selector.bpf.c`](../../agent/bpf/ct_selector.bpf.c)

The egress program uses the standard `classifier` ELF section so it can be loaded by the libbpf version shipped with Ubuntu 22.04 as well as newer toolchains; it is attached at the tc egress hook by the loader.

Stack-backed event records are fully zero-initialized before map insertion. This includes compiler-added padding and keeps kernel verifier behavior deterministic across supported toolchains.

Linux compilation is enforced by the eBPF GitHub workflow. Loading and attaching the program still requires a compatible Linux test node with BTF, cgroup v2, and the capabilities defined by the Agent security boundary.
