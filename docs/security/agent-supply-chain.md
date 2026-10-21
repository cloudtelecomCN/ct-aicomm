# Agent supply chain

CT-529 release bundles contain exactly four digest-bound artifacts: `ct-aicomm-agent`, `ct_selector.bpf.o`, `ct-aicomm-agent.spdx.json`, and `provenance.json`. `SHA256SUMS` is signed with an offline Ed25519 release key. Production installation requires the bundle signature, public key, SBOM, and provenance statement; missing, extra, altered, or unsigned artifacts are rejected before installation.

`scripts/audit-agent-dependencies.mjs` scans runtime imports in the Agent control plane and release scripts. The current implementation permits only Node.js built-ins and repository-relative modules and has no third-party runtime dependencies. The upgrader retains the previous signed installation until the new service passes its health check and restores it on failure. Custom health checks are limited to isolated-root testing and cannot replace the production systemd check.

The deterministic SPDX 2.3 generator inventories Agent and control-protocol source files. The in-toto/SLSA v1 statement binds the three generated artifacts to the full Git commit and builder identity. The installer preserves the signed metadata beside the runtime and records their digests in a root-readable state manifest.

The systemd unit runs as the dedicated `ct-aicomm-agent` account with only `CAP_BPF`, `CAP_NET_ADMIN`, and `CAP_PERFMON`. Namespace, device, kernel-module, control-group, clock, process, address-family, syscall, and filesystem restrictions are enforced. `upgrade.sh` accepts only another verified bundle, keeps the prior signed installation until health succeeds, and restores it on any failure.

Unsigned development mode is available only for an alternate filesystem root used by tests; it is explicitly forbidden for `/`. The weekly GitHub Actions update policy covers workflow dependencies, while the supply-chain workflow tests valid signature acceptance, tamper rejection, installation, and upgrade rollback boundaries.
