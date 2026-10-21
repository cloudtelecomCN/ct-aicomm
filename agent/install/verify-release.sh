#!/usr/bin/env bash
set -euo pipefail

agent=${1:?agent binary required}
bpf=${2:?BPF object required}
sbom=${3:?SBOM required}
provenance=${4:?provenance required}
checksums=${5:?checksums required}
signature=${6:?signature required}
public_key=${7:?public key required}

for file in "$agent" "$bpf" "$sbom" "$provenance" "$checksums" "$signature" "$public_key"; do
  [[ -f $file ]] || { echo "verify-release: missing file: $file" >&2; exit 1; }
done
command -v openssl >/dev/null || { echo "verify-release: openssl is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "verify-release: sha256sum is required" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
install -m 0755 "$agent" "$work/ct-aicomm-agent"
install -m 0644 "$bpf" "$work/ct_selector.bpf.o"
install -m 0644 "$sbom" "$work/ct-aicomm-agent.spdx.json"
install -m 0644 "$provenance" "$work/provenance.json"
install -m 0644 "$checksums" "$work/SHA256SUMS"

expected='ct-aicomm-agent ct-aicomm-agent.spdx.json ct_selector.bpf.o provenance.json'
actual=$(awk 'NF == 2 { sub(/^\*/, "", $2); print $2 }' "$work/SHA256SUMS" | sort | xargs)
[[ $actual == "$expected" ]] || { echo "verify-release: checksum manifest must contain exactly the four canonical artifacts" >&2; exit 1; }
openssl pkeyutl -verify -pubin -inkey "$public_key" -rawin -in "$checksums" -sigfile "$signature" >/dev/null
(cd "$work" && sha256sum --check --strict SHA256SUMS >/dev/null)

echo "verify-release: signature and artifact digests valid"
