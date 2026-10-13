#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=/
agent_binary=
bpf_object="$script_dir/../bpf/build/ct_selector.bpf.o"
no_start=0

while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; shift 2 ;;
    --agent-binary) agent_binary=${2:?missing agent binary}; shift 2 ;;
    --bpf-object) bpf_object=${2:?missing BPF object}; shift 2 ;;
    --no-start) no_start=1; shift ;;
    *) echo "install: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n $agent_binary && -x $agent_binary ]] || { echo "install: --agent-binary must be executable" >&2; exit 1; }
[[ -f $bpf_object ]] || { echo "install: BPF object not found: $bpf_object" >&2; exit 1; }

if [[ $root == / ]]; then
  "$script_dir/preflight.sh"
fi

root=${root%/}
prefix="$root/usr/local/lib/ct-aicomm-agent"
config_dir="$root/etc/ct-aicomm-agent"
unit_dir="$root/etc/systemd/system"
state_dir="$root/var/lib/ct-aicomm-agent"

install -d -m 0755 "$prefix/bin" "$prefix/lib" "$unit_dir" "$state_dir"
install -d -m 0750 "$config_dir"
install -m 0755 "$agent_binary" "$prefix/bin/ct-aicomm-agent"
install -m 0644 "$bpf_object" "$prefix/lib/ct_selector.bpf.o"
if [[ ! -e $config_dir/agent.env ]]; then
  install -m 0640 "$script_dir/agent.env.example" "$config_dir/agent.env"
fi
sed "s|@@PREFIX@@|/usr/local/lib/ct-aicomm-agent|g" "$script_dir/ct-aicomm-agent.service.in" >"$unit_dir/ct-aicomm-agent.service"
chmod 0644 "$unit_dir/ct-aicomm-agent.service"

{
  echo "agent_sha256=$(sha256sum "$prefix/bin/ct-aicomm-agent" | cut -d' ' -f1)"
  echo "bpf_sha256=$(sha256sum "$prefix/lib/ct_selector.bpf.o" | cut -d' ' -f1)"
} >"$state_dir/install.manifest"
chmod 0600 "$state_dir/install.manifest"

if [[ $root == / && $no_start -eq 0 ]]; then
  systemctl daemon-reload
  systemctl enable --now ct-aicomm-agent.service
fi

echo "install: CT-AIComm Agent installed"
