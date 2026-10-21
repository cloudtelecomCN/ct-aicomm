# Agent installation and removal

CT-508 packages a separately built Agent executable, the verified eBPF object, a root-owned environment file, and a hardened systemd unit. CT-529 requires signed artifacts, SBOM, and provenance; CT-531 adds the deterministic release archive and the bilingual [operations runbook](operations.md). The installer runs a Linux 5.15+, bpffs, root, and tool preflight on a real host.

```bash
tar -xzf ct-aicomm-agent-release.tar.gz
cd ct-aicomm-agent-release
sudo install/preflight.sh
sudo install/install-package.sh --no-start
```

The service receives only `CAP_BPF`, `CAP_NET_ADMIN`, and `CAP_PERFMON`, matching the threat model. Replace the values in `/etc/ct-aicomm-agent/agent.env` before enabling enforcement.

Removal calls `ct-aicomm-agent restore --all` before deleting managed files. If restoration fails, removal stops; `--force` is an explicit break-glass operation. Configuration is preserved unless `--purge` is supplied.

```bash
sudo agent/install/uninstall.sh
sudo agent/install/uninstall.sh --purge
```

The scripts support `--root` for repeatable package tests without modifying the host. CI tests repeatable installation, signed package creation, upgrade restoration, diagnostics, emergency recovery, removal, and purge. Production host installation never permits unsigned development mode.
