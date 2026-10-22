#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=/
install_args=()
health_check=

while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; install_args+=("$1" "$2"); shift 2 ;;
    --agent-binary|--bpf-object|--sbom|--provenance|--checksums|--signature|--public-key) install_args+=("$1" "${2:?missing value}"); shift 2 ;;
    --health-check) health_check=${2:?missing health check}; shift 2 ;;
    --no-start) shift ;;
    *) echo "upgrade: unknown argument: $1" >&2; exit 2 ;;
  esac
done

host_root=0
if [[ $root == / ]]; then host_root=1; fi

if [[ -n $health_check ]] && ((host_root)); then
  echo "upgrade: custom health checks are forbidden for the host root" >&2
  exit 2
fi
if [[ -n $health_check && ! -x $health_check ]]; then
  echo "upgrade: health check must be an executable file" >&2
  exit 2
fi

root=${root%/}
prefix="$root/usr/local/lib/ct-aicomm-agent"
state_dir="$root/var/lib/ct-aicomm-agent"
backup="$state_dir/upgrade-backup"
[[ -d $prefix ]] || { echo "upgrade: existing installation not found" >&2; exit 1; }

rm -rf "$backup"
install -d -m 0700 "$backup"
cp -a "$prefix" "$backup/prefix"
[[ -f $state_dir/install.manifest ]] && cp -a "$state_dir/install.manifest" "$backup/install.manifest"

restore() {
  rm -rf "$prefix"
  cp -a "$backup/prefix" "$prefix"
  [[ -f $backup/install.manifest ]] && cp -a "$backup/install.manifest" "$state_dir/install.manifest"
  if ((host_root)); then
    systemctl daemon-reload
    systemctl restart ct-aicomm-agent.service || true
  fi
}
trap 'echo "upgrade: failed; restoring previous signed version" >&2; restore' ERR

bash "$script_dir/install.sh" "${install_args[@]}" --no-start
if ((host_root)); then
  systemctl daemon-reload
  systemctl restart ct-aicomm-agent.service
  systemctl is-active --quiet ct-aicomm-agent.service
elif [[ -n $health_check ]]; then
  "$health_check" "$root"
fi
trap - ERR
rm -rf "$backup"
echo "upgrade: signed release installed and healthy"
