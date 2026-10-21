#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
bundle=$(cd "$script_dir/.." && pwd)
exec bash "$script_dir/upgrade.sh" \
  --agent-binary "$bundle/bin/ct-aicomm-agent" \
  --bpf-object "$bundle/lib/ct_selector.bpf.o" \
  --sbom "$bundle/share/ct-aicomm-agent.spdx.json" \
  --provenance "$bundle/share/provenance.json" \
  --checksums "$bundle/share/SHA256SUMS" \
  --signature "$bundle/share/SHA256SUMS.sig" \
  --public-key "$bundle/share/release-public-key.pem" \
  "$@"
