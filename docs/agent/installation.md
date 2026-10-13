# Agent installation and removal

CT-508 packages a separately built Agent executable, the verified eBPF object, a root-owned environment file, and a hardened systemd unit. The installer runs a Linux 5.15+, bpffs, root, and tool preflight on a real host. Re-running it updates managed artifacts while preserving the operator configuration.

```bash
sudo agent/install/install.sh \
  --agent-binary ./build/ct-aicomm-agent \
  --bpf-object ./agent/bpf/build/ct_selector.bpf.o
```

The service receives only `CAP_BPF`, `CAP_NET_ADMIN`, and `CAP_PERFMON`, matching the threat model. Replace the values in `/etc/ct-aicomm-agent/agent.env` before enabling enforcement.

Removal calls `ct-aicomm-agent restore --all` before deleting managed files. If restoration fails, removal stops; `--force` is an explicit break-glass operation. Configuration is preserved unless `--purge` is supplied.

```bash
sudo agent/install/uninstall.sh
sudo agent/install/uninstall.sh --purge
```

The scripts support `--root` for repeatable package tests without modifying the host. CI runs [`../../agent/install/test-install.sh`](../../agent/install/test-install.sh) twice through the install path and twice through removal.
