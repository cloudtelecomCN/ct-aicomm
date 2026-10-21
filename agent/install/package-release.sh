#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
agent=
bpf=
sbom=
provenance=
checksums=
signature=
public_key=
output=
while (($#)); do
  case "$1" in
    --agent-binary) agent=${2:?missing agent}; shift 2 ;;
    --bpf-object) bpf=${2:?missing BPF object}; shift 2 ;;
    --sbom) sbom=${2:?missing SBOM}; shift 2 ;;
    --provenance) provenance=${2:?missing provenance}; shift 2 ;;
    --checksums) checksums=${2:?missing checksums}; shift 2 ;;
    --signature) signature=${2:?missing signature}; shift 2 ;;
    --public-key) public_key=${2:?missing public key}; shift 2 ;;
    --output) output=${2:?missing output}; shift 2 ;;
    *) echo "package-release: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n $output ]] || { echo "package-release: --output is required" >&2; exit 2; }
command -v tar >/dev/null || { echo "package-release: tar is required" >&2; exit 1; }
bash "$script_dir/verify-release.sh" "$agent" "$bpf" "$sbom" "$provenance" "$checksums" "$signature" "$public_key"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
bundle="$work/ct-aicomm-agent-release"
install -d -m 0755 "$bundle/bin" "$bundle/lib" "$bundle/share" "$bundle/install" "$bundle/docs"
install -m 0755 "$agent" "$bundle/bin/ct-aicomm-agent"
install -m 0644 "$bpf" "$bundle/lib/ct_selector.bpf.o"
install -m 0644 "$sbom" "$bundle/share/ct-aicomm-agent.spdx.json"
install -m 0644 "$provenance" "$bundle/share/provenance.json"
install -m 0644 "$checksums" "$bundle/share/SHA256SUMS"
install -m 0644 "$signature" "$bundle/share/SHA256SUMS.sig"
install -m 0644 "$public_key" "$bundle/share/release-public-key.pem"
for file in diagnose.sh emergency-recover.sh install-package.sh install.sh preflight.sh uninstall.sh upgrade-package.sh upgrade.sh verify-release.sh; do
  install -m 0755 "$script_dir/$file" "$bundle/install/$file"
done
install -m 0644 "$script_dir/agent.env.example" "$bundle/install/agent.env.example"
install -m 0644 "$script_dir/ct-aicomm-agent.service.in" "$bundle/install/ct-aicomm-agent.service.in"
install -m 0644 "$script_dir/../../docs/agent/operations.md" "$bundle/docs/operations.md"
install -m 0644 "$script_dir/../../docs/agent/operations.zh-CN.md" "$bundle/docs/operations.zh-CN.md"
mkdir -p "$(dirname "$output")"
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner -czf "$output" -C "$work" ct-aicomm-agent-release
echo "package-release: $output"
