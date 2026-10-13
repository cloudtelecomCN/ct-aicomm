#!/usr/bin/env bash
set -euo pipefail

root=/
purge=0
force=0
while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; shift 2 ;;
    --purge) purge=1; shift ;;
    --force) force=1; shift ;;
    *) echo "uninstall: unknown argument: $1" >&2; exit 2 ;;
  esac
done

root=${root%/}
prefix="$root/usr/local/lib/ct-aicomm-agent"
unit="$root/etc/systemd/system/ct-aicomm-agent.service"
config_dir="$root/etc/ct-aicomm-agent"
state_dir="$root/var/lib/ct-aicomm-agent"
agent="$prefix/bin/ct-aicomm-agent"

if [[ -x $agent ]]; then
  if ! "$agent" restore --all; then
    if [[ $force -ne 1 ]]; then
      echo "uninstall: route restoration failed; rerun after recovery or use --force" >&2
      exit 1
    fi
    echo "uninstall: warning: route restoration failed and was forced" >&2
  fi
fi

if [[ $root == / ]]; then
  systemctl disable --now ct-aicomm-agent.service 2>/dev/null || true
fi
rm -f "$unit"
rm -rf "$prefix" "$state_dir"
if [[ $purge -eq 1 ]]; then
  rm -rf "$config_dir"
fi
if [[ $root == / ]]; then
  systemctl daemon-reload
fi

echo "uninstall: CT-AIComm Agent removed; configuration $([[ $purge -eq 1 ]] && echo purged || echo preserved)"
