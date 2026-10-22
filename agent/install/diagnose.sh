#!/usr/bin/env bash
set -u

root=/
while (($#)); do
  case "$1" in
    --root) root=${2:?missing root}; shift 2 ;;
    *) echo "diagnose: unknown argument: $1" >&2; exit 2 ;;
  esac
done
host_root=0
if [[ $root == / ]]; then host_root=1; fi
root=${root%/}
prefix="$root/usr/local/lib/ct-aicomm-agent"
state="$root/var/lib/ct-aicomm-agent"
config="$root/etc/ct-aicomm-agent/agent.env"
unit="$root/etc/systemd/system/ct-aicomm-agent.service"
failures=0

check_file() {
  if [[ -f $1 ]]; then echo "PASS file $2"; else echo "FAIL file $2"; failures=$((failures + 1)); fi
}
check_hash() {
  local key=$1 file=$2 expected actual
  expected=$(sed -n "s/^${key}=//p" "$state/install.manifest" 2>/dev/null)
  actual=$([[ -f $file ]] && sha256sum "$file" | cut -d' ' -f1)
  if [[ -n $expected && $expected == "$actual" ]]; then echo "PASS digest $key"; else echo "FAIL digest $key"; failures=$((failures + 1)); fi
}

check_file "$prefix/bin/ct-aicomm-agent" agent
check_file "$prefix/lib/ct_selector.bpf.o" bpf
check_file "$state/install.manifest" manifest
check_file "$config" config
check_file "$unit" service_unit
if [[ -f $state/install.manifest ]]; then
  check_hash agent_sha256 "$prefix/bin/ct-aicomm-agent"
  check_hash bpf_sha256 "$prefix/lib/ct_selector.bpf.o"
  if grep -q '^development_unsigned=true$' "$state/install.manifest"; then
    if ((host_root)); then echo "FAIL unsigned_host_install"; failures=$((failures + 1)); else echo "PASS isolated_unsigned_test_install"; fi
  else
    check_hash sbom_sha256 "$prefix/share/ct-aicomm-agent.spdx.json"
    check_hash provenance_sha256 "$prefix/share/provenance.json"
    check_hash release_manifest_sha256 "$prefix/share/SHA256SUMS"
  fi
fi
if ((host_root)); then
  id ct-aicomm-agent >/dev/null 2>&1 && echo "PASS service_user" || { echo "FAIL service_user"; failures=$((failures + 1)); }
  systemctl is-active --quiet ct-aicomm-agent.service && echo "PASS service_active" || { echo "FAIL service_active"; failures=$((failures + 1)); }
  mountpoint -q /sys/fs/bpf && echo "PASS bpffs" || { echo "FAIL bpffs"; failures=$((failures + 1)); }
fi
echo "SUMMARY failures=$failures"
exit "$failures"
