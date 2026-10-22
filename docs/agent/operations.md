# Agent operations runbook

This CT-531 runbook covers a signed CT-AIComm Agent release on Ubuntu 22.04 or another Linux host that satisfies the published security boundary. Run production operations as root from a trusted console. Never place the release signing private key, control-plane credential, endpoint inventory, or diagnostic output containing customer data in the public repository.

## Install

1. Transfer `ct-aicomm-agent-release.tar.gz` and its separately published SHA-256 digest to the host.
2. Compare the archive digest through a second trusted channel.
3. Extract the archive and inspect `share/SHA256SUMS`, its Ed25519 signature, SBOM, and provenance.
4. Run preflight, install, configure, and diagnose:

```bash
tar -xzf ct-aicomm-agent-release.tar.gz
cd ct-aicomm-agent-release
sudo install/preflight.sh
sudo install/install-package.sh --no-start
sudoedit /etc/ct-aicomm-agent/agent.env
sudo systemctl enable --now ct-aicomm-agent.service
sudo install/diagnose.sh
```

Start in `CT_AGENT_MODE=observe_only`. Move to enforcement only after the registered Agent identity, control endpoint, approved selector policy, rollback state, and maintenance window are confirmed.

The systemd unit uses privileged `ExecStartPre` steps to grant only the Agent group traversal on the bpffs root and create `/sys/fs/bpf/ct-aicomm-agent` before dropping to the dedicated service account. Root remains the only identity with read/write access to the bpffs root, and the Agent can write only in its bounded pin namespace. Treat a failure to prepare that namespace as an installation failure; do not run the long-lived service as root.

## Upgrade

Keep the previous archive until validation is complete. The upgrader verifies the new signed bundle, retains the installed version, restarts the service, and restores the previous signed version if health verification fails.

```bash
cd new-ct-aicomm-agent-release
sudo install/upgrade-package.sh
sudo install/diagnose.sh
```

Do not bypass a signature, digest, preflight, or health failure. Preserve the old archive and `/var/lib/ct-aicomm-agent/install.manifest` with the incident record.

## Diagnose

`diagnose.sh` verifies managed files, installed hashes, the dedicated service user, systemd state, and bpffs without printing configuration values or credentials. Pair its output with these operator-owned checks:

```bash
sudo journalctl -u ct-aicomm-agent.service --since -30min
sudo systemctl status ct-aicomm-agent.service
sudo bpftool prog show
sudo bpftool map show
```

Redact hostnames, addresses, tokens, topology, model paths, map keys, and customer identifiers before sharing logs.

## Emergency recovery

The break-glass command stops automatic execution, requests restoration of the confirmed baseline, disables the service, and records the actor and reason. It does not automatically resume enforcement.

```bash
sudo install/emergency-recover.sh --actor operator-id --reason incident-ticket-id
sudo install/diagnose.sh
```

If the command fails, isolate the host from the control plane, preserve `/var/lib/ct-aicomm-agent`, restore the approved network baseline through the platform change procedure, and escalate. Do not use `uninstall.sh --force` until route state is independently confirmed.

## Remove

Normal removal restores routes first and preserves configuration. Purge only after evidence and configuration retention requirements are satisfied.

```bash
sudo install/uninstall.sh
sudo install/uninstall.sh --purge
```

## Acceptance record

Record archive SHA-256, release manifest SHA-256, Agent identity, host fingerprint, operator, timestamps, preflight and diagnostic outcomes, rollback readiness, final service state, and any exception. A successful installation is not evidence of production availability or performance.
