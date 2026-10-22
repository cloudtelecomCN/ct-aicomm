#!/usr/bin/env bash
set -euo pipefail

root=/
actor=${SUDO_USER:-${USER:-operator}}
reason=operator_emergency_recovery
while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; shift 2 ;;
    --actor) actor=${2:?missing actor}; shift 2 ;;
    --reason) reason=${2:?missing reason}; shift 2 ;;
    *) echo "emergency-recover: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ $actor =~ ^[A-Za-z0-9._:@-]{1,128}$ ]] || { echo "emergency-recover: invalid actor" >&2; exit 2; }
[[ ${#reason} -ge 3 && ${#reason} -le 200 ]] || { echo "emergency-recover: reason must be 3-200 characters" >&2; exit 2; }
host_root=0
if [[ $root == / ]]; then host_root=1; fi
root=${root%/}
agent="$root/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent"
state="$root/var/lib/ct-aicomm-agent"
[[ -x $agent ]] || { echo "emergency-recover: installed Agent not found" >&2; exit 1; }
if ((host_root)); then
  [[ ${EUID} -eq 0 ]] || { echo "emergency-recover: root is required" >&2; exit 1; }
  if systemctl is-active --quiet ct-aicomm-agent.service; then
    systemctl stop ct-aicomm-agent.service
  else
    "$agent" restore --all
  fi
  systemctl disable ct-aicomm-agent.service >/dev/null 2>&1 || true
  ! systemctl is-active --quiet ct-aicomm-agent.service || { echo "emergency-recover: service remains active" >&2; exit 1; }
else
  "$agent" restore --all
fi
install -d -m 0700 "$state"
printf 'activated_at=%s\nactor=%s\nreason=%s\nautomatic_execution=disabled\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$actor" "$reason" >"$state/emergency-recovery.state"
chmod 0600 "$state/emergency-recovery.state"
echo "emergency-recover: baseline restoration requested and automatic execution disabled"
