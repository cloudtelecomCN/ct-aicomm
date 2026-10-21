#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
root="$work/root"
fixture="$work/agent"
cat >"$fixture" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${CT_AGENT_TEST_LOG:?}"
EOF
chmod +x "$fixture"
printf 'test-bpf\n' >"$work/bpf.o"
export CT_AGENT_TEST_LOG="$work/agent.log"
bash "$script_dir/install.sh" --root "$root" --agent-binary "$fixture" --bpf-object "$work/bpf.o" --allow-unsigned-development
bash "$script_dir/diagnose.sh" --root "$root" | grep -q 'SUMMARY failures=0'
bash "$script_dir/emergency-recover.sh" --root "$root" --actor test-operator --reason test-recovery
grep -q '^restore --all$' "$CT_AGENT_TEST_LOG"
grep -q '^automatic_execution=disabled$' "$root/var/lib/ct-aicomm-agent/emergency-recovery.state"
echo "operations test: diagnostics and emergency recovery passed"
