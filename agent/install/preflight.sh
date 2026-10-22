#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "preflight: root is required" >&2
  exit 1
fi

kernel_major=$(uname -r | cut -d. -f1)
kernel_minor=$(uname -r | cut -d. -f2 | sed 's/[^0-9].*//')
if (( kernel_major < 5 || (kernel_major == 5 && kernel_minor < 15) )); then
  echo "preflight: Linux kernel 5.15 or newer is required" >&2
  exit 1
fi

if ! mountpoint -q /sys/fs/bpf; then
  echo "preflight: bpffs must be mounted at /sys/fs/bpf" >&2
  exit 1
fi

for command in systemctl sha256sum install bpftool stat; do
  command -v "$command" >/dev/null || { echo "preflight: missing command: $command" >&2; exit 1; }
done

if [[ ! -e /proc/sys/kernel/unprivileged_bpf_disabled ]]; then
  echo "preflight: kernel BPF policy interface is unavailable" >&2
  exit 1
fi

echo "preflight: kernel, bpffs, and install prerequisites are ready"
