#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$script_dir/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/dist" "$work/root"

sign_bundle() {
  local agent=$1
  local dist=$2
  mkdir -p "$dist"
  (cd "$repo" && node scripts/generate-agent-sbom.mjs --output "$dist/ct-aicomm-agent.spdx.json")
  (cd "$repo" && SOURCE_COMMIT=${SOURCE_COMMIT:-0000000000000000000000000000000000000000} node scripts/generate-agent-provenance.mjs --agent "$agent" --bpf "$work/ct_selector.bpf.o" --sbom "$dist/ct-aicomm-agent.spdx.json" --output "$dist/provenance.json")
  (cd "$repo" && node scripts/create-release-checksums.mjs --agent "$agent" --bpf "$work/ct_selector.bpf.o" --sbom "$dist/ct-aicomm-agent.spdx.json" --provenance "$dist/provenance.json" --output "$dist/SHA256SUMS")
  openssl pkeyutl -sign -inkey "$work/release-private-key.pem" -rawin -in "$dist/SHA256SUMS" -out "$dist/SHA256SUMS.sig"
}

install -m 0755 "$repo/agent/bin/ct-aicomm-agent" "$work/ct-aicomm-agent"
printf 'verified-bpf-object\n' >"$work/ct_selector.bpf.o"

openssl genpkey -algorithm ED25519 -out "$work/release-private-key.pem" >/dev/null 2>&1
openssl pkey -in "$work/release-private-key.pem" -pubout -out "$work/dist/release-public-key.pem" >/dev/null 2>&1
sign_bundle "$work/ct-aicomm-agent" "$work/dist"

bash "$script_dir/verify-release.sh" "$work/ct-aicomm-agent" "$work/ct_selector.bpf.o" "$work/dist/ct-aicomm-agent.spdx.json" "$work/dist/provenance.json" "$work/dist/SHA256SUMS" "$work/dist/SHA256SUMS.sig" "$work/dist/release-public-key.pem"
bash "$script_dir/package-release.sh" --agent-binary "$work/ct-aicomm-agent" --bpf-object "$work/ct_selector.bpf.o" --sbom "$work/dist/ct-aicomm-agent.spdx.json" --provenance "$work/dist/provenance.json" --checksums "$work/dist/SHA256SUMS" --signature "$work/dist/SHA256SUMS.sig" --public-key "$work/dist/release-public-key.pem" --output "$work/ct-aicomm-agent-release.tar.gz"
bash "$script_dir/package-release.sh" --agent-binary "$work/ct-aicomm-agent" --bpf-object "$work/ct_selector.bpf.o" --sbom "$work/dist/ct-aicomm-agent.spdx.json" --provenance "$work/dist/provenance.json" --checksums "$work/dist/SHA256SUMS" --signature "$work/dist/SHA256SUMS.sig" --public-key "$work/dist/release-public-key.pem" --output "$work/ct-aicomm-agent-release-repeat.tar.gz"
cmp "$work/ct-aicomm-agent-release.tar.gz" "$work/ct-aicomm-agent-release-repeat.tar.gz"
tar -tzf "$work/ct-aicomm-agent-release.tar.gz" | grep -q '^ct-aicomm-agent-release/install/install-package.sh$'
mkdir -p "$work/extracted"
tar -xzf "$work/ct-aicomm-agent-release.tar.gz" -C "$work/extracted"
bash "$work/extracted/ct-aicomm-agent-release/install/install-package.sh" --root "$work/package-root"
test -f "$work/package-root/usr/local/lib/ct-aicomm-agent/share/provenance.json"
bash "$script_dir/install.sh" --root "$work/root" --agent-binary "$work/ct-aicomm-agent" --bpf-object "$work/ct_selector.bpf.o" --sbom "$work/dist/ct-aicomm-agent.spdx.json" --provenance "$work/dist/provenance.json" --checksums "$work/dist/SHA256SUMS" --signature "$work/dist/SHA256SUMS.sig" --public-key "$work/dist/release-public-key.pem"
test -f "$work/root/usr/local/lib/ct-aicomm-agent/share/ct-aicomm-agent.spdx.json"
grep -q '^release_manifest_sha256=' "$work/root/var/lib/ct-aicomm-agent/install.manifest"
bash "$script_dir/upgrade.sh" --root "$work/root" --agent-binary "$work/ct-aicomm-agent" --bpf-object "$work/ct_selector.bpf.o" --sbom "$work/dist/ct-aicomm-agent.spdx.json" --provenance "$work/dist/provenance.json" --checksums "$work/dist/SHA256SUMS" --signature "$work/dist/SHA256SUMS.sig" --public-key "$work/dist/release-public-key.pem"
test ! -e "$work/root/var/lib/ct-aicomm-agent/upgrade-backup"

old_agent_sha=$(sha256sum "$work/root/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent" | cut -d' ' -f1)
cat >"$work/ct-aicomm-agent-v2" <<'EOF'
#!/usr/bin/env bash
echo v2
EOF
chmod +x "$work/ct-aicomm-agent-v2"
mkdir -p "$work/dist-v2"
cp "$work/dist/release-public-key.pem" "$work/dist-v2/release-public-key.pem"
sign_bundle "$work/ct-aicomm-agent-v2" "$work/dist-v2"
cat >"$work/fail-health" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$work/fail-health"
if bash "$script_dir/upgrade.sh" --root "$work/root" --health-check "$work/fail-health" --agent-binary "$work/ct-aicomm-agent-v2" --bpf-object "$work/ct_selector.bpf.o" --sbom "$work/dist-v2/ct-aicomm-agent.spdx.json" --provenance "$work/dist-v2/provenance.json" --checksums "$work/dist-v2/SHA256SUMS" --signature "$work/dist-v2/SHA256SUMS.sig" --public-key "$work/dist-v2/release-public-key.pem" >/dev/null 2>&1; then
  echo "supply-chain test: unhealthy upgrade was accepted" >&2
  exit 1
fi
restored_agent_sha=$(sha256sum "$work/root/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent" | cut -d' ' -f1)
test "$old_agent_sha" = "$restored_agent_sha"

printf 'tampered\n' >>"$work/ct_selector.bpf.o"
if bash "$script_dir/verify-release.sh" "$work/ct-aicomm-agent" "$work/ct_selector.bpf.o" "$work/dist/ct-aicomm-agent.spdx.json" "$work/dist/provenance.json" "$work/dist/SHA256SUMS" "$work/dist/SHA256SUMS.sig" "$work/dist/release-public-key.pem" >/dev/null 2>&1; then
  echo "supply-chain test: tampered artifact was accepted" >&2
  exit 1
fi

echo "supply-chain test: signed install accepted, unhealthy upgrade restored, and tampered artifact rejected"
