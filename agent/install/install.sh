#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=/
agent_binary=
bpf_object="$script_dir/../bpf/build/ct_selector.bpf.o"
sbom=
provenance=
checksums=
signature=
public_key=
allow_unsigned_development=0
no_start=0

while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; shift 2 ;;
    --agent-binary) agent_binary=${2:?missing agent binary}; shift 2 ;;
    --bpf-object) bpf_object=${2:?missing BPF object}; shift 2 ;;
    --sbom) sbom=${2:?missing SBOM}; shift 2 ;;
    --provenance) provenance=${2:?missing provenance}; shift 2 ;;
    --checksums) checksums=${2:?missing checksums}; shift 2 ;;
    --signature) signature=${2:?missing signature}; shift 2 ;;
    --public-key) public_key=${2:?missing public key}; shift 2 ;;
    --allow-unsigned-development) allow_unsigned_development=1; shift ;;
    --no-start) no_start=1; shift ;;
    *) echo "install: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n $agent_binary && -x $agent_binary ]] || { echo "install: --agent-binary must be executable" >&2; exit 1; }
[[ -f $bpf_object ]] || { echo "install: BPF object not found: $bpf_object" >&2; exit 1; }

if ((allow_unsigned_development)); then
  [[ $root != / ]] || { echo "install: unsigned development mode is forbidden for the host root" >&2; exit 1; }
else
  bash "$script_dir/verify-release.sh" "$agent_binary" "$bpf_object" "$sbom" "$provenance" "$checksums" "$signature" "$public_key"
fi

if [[ $root == / ]]; then
  "$script_dir/preflight.sh"
  if ! id -u ct-aicomm-agent >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/ct-aicomm-agent --shell /usr/sbin/nologin --user-group ct-aicomm-agent
  fi
fi

root=${root%/}
prefix="$root/usr/local/lib/ct-aicomm-agent"
config_dir="$root/etc/ct-aicomm-agent"
unit_dir="$root/etc/systemd/system"
state_dir="$root/var/lib/ct-aicomm-agent"

install -d -m 0755 "$prefix/bin" "$prefix/lib" "$prefix/share" "$unit_dir" "$state_dir"
install -d -m 0750 "$config_dir"
install -m 0755 "$agent_binary" "$prefix/bin/ct-aicomm-agent"
install -m 0644 "$bpf_object" "$prefix/lib/ct_selector.bpf.o"
if ((!allow_unsigned_development)); then
  install -m 0644 "$sbom" "$prefix/share/ct-aicomm-agent.spdx.json"
  install -m 0644 "$provenance" "$prefix/share/provenance.json"
  install -m 0644 "$checksums" "$prefix/share/SHA256SUMS"
  install -m 0644 "$signature" "$prefix/share/SHA256SUMS.sig"
  install -m 0644 "$public_key" "$prefix/share/release-public-key.pem"
fi
if [[ ! -e $config_dir/agent.env ]]; then
  install -m 0640 "$script_dir/agent.env.example" "$config_dir/agent.env"
fi
sed "s|@@PREFIX@@|/usr/local/lib/ct-aicomm-agent|g" "$script_dir/ct-aicomm-agent.service.in" >"$unit_dir/ct-aicomm-agent.service"
chmod 0644 "$unit_dir/ct-aicomm-agent.service"

{
  echo "agent_sha256=$(sha256sum "$prefix/bin/ct-aicomm-agent" | cut -d' ' -f1)"
  echo "bpf_sha256=$(sha256sum "$prefix/lib/ct_selector.bpf.o" | cut -d' ' -f1)"
  if ((!allow_unsigned_development)); then
    echo "sbom_sha256=$(sha256sum "$prefix/share/ct-aicomm-agent.spdx.json" | cut -d' ' -f1)"
    echo "provenance_sha256=$(sha256sum "$prefix/share/provenance.json" | cut -d' ' -f1)"
    echo "release_manifest_sha256=$(sha256sum "$prefix/share/SHA256SUMS" | cut -d' ' -f1)"
  else
    echo "development_unsigned=true"
  fi
} >"$state_dir/install.manifest"
chmod 0600 "$state_dir/install.manifest"

if [[ $root == / ]]; then
  chown -R ct-aicomm-agent:ct-aicomm-agent "$state_dir"
  chown root:ct-aicomm-agent "$config_dir" "$config_dir/agent.env"
fi

if [[ $root == / && $no_start -eq 0 ]]; then
  systemctl daemon-reload
  systemctl enable --now ct-aicomm-agent.service
fi

echo "install: CT-AIComm Agent installed"
