# Kernel compatibility matrix

CT-583 treats compatibility as measured evidence rather than a version assumption. Each matrix row must record the distribution, architecture, kernel, cgroup mode, BTF and bpffs availability, BPF policy interface, required program types, exact preflight source hash, and whether the current object was compiled and verifier-loaded on that host.

The initial matrix currently contains one distinct platform: Ubuntu 22.04, x86_64, Linux 5.15.0-191-generic. Two independent A10 hosts passed installation preflight and reported `cgroup_sock_addr`, `sched_cls`, and `sock_ops` support. One host also compiled the current selector source with Clang 14; the other did not have Clang installed, so it is recorded as capability-probed rather than compile-verified.

The [public receipt](../../evidence/quality/ct-583-kernel-matrix-partial-20261022.json) is deliberately `partial`. Repeating the same kernel on a second host improves repeatability evidence but does not add a second compatibility row. CT-583 cannot pass until the supported matrix is tested on genuinely distinct target kernels and every unsupported row is rejected explicitly by preflight.
