#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(mktemp -d)
fixture=$(mktemp -d)
trap 'rm -rf "$root" "$fixture"' EXIT

cat >"$fixture/agent" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"${CT_AGENT_TEST_LOG:?}"
EOF
chmod +x "$fixture/agent"
printf 'test-bpf-object\n' >"$fixture/selector.o"
export CT_AGENT_TEST_LOG="$fixture/agent.log"

"$script_dir/install.sh" --root "$root" --agent-binary "$fixture/agent" --bpf-object "$fixture/selector.o" --allow-unsigned-development
printf 'CT_AGENT_MODE=enforce\n' >"$root/etc/ct-aicomm-agent/agent.env"
"$script_dir/install.sh" --root "$root" --agent-binary "$fixture/agent" --bpf-object "$fixture/selector.o" --allow-unsigned-development

grep -q '^CT_AGENT_MODE=enforce$' "$root/etc/ct-aicomm-agent/agent.env"
grep -q 'CapabilityBoundingSet=CAP_BPF CAP_NET_ADMIN CAP_PERFMON' "$root/etc/systemd/system/ct-aicomm-agent.service"
grep -q '^User=ct-aicomm-agent$' "$root/etc/systemd/system/ct-aicomm-agent.service"
grep -q '^ExecStartPre=+/usr/bin/chgrp ct-aicomm-agent /sys/fs/bpf$' "$root/etc/systemd/system/ct-aicomm-agent.service"
grep -q '^ExecStartPre=+/usr/bin/chmod 1710 /sys/fs/bpf$' "$root/etc/systemd/system/ct-aicomm-agent.service"
grep -q '^ExecStartPre=+/usr/bin/install -d -o ct-aicomm-agent -g ct-aicomm-agent -m 0750 /sys/fs/bpf/ct-aicomm-agent$' "$root/etc/systemd/system/ct-aicomm-agent.service"
grep -q '^SystemCallFilter=@system-service bpf$' "$root/etc/systemd/system/ct-aicomm-agent.service"
test -x "$root/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent"
test -f "$root/var/lib/ct-aicomm-agent/install.manifest"
grep -q '^development_unsigned=true$' "$root/var/lib/ct-aicomm-agent/install.manifest"

"$script_dir/uninstall.sh" --root "$root"
grep -q '^restore --all$' "$CT_AGENT_TEST_LOG"
test -f "$root/etc/ct-aicomm-agent/agent.env"
test ! -e "$root/usr/local/lib/ct-aicomm-agent"
"$script_dir/uninstall.sh" --root "$root" --purge
test ! -e "$root/etc/ct-aicomm-agent"

echo "install test: repeatable install, restore, uninstall, and purge passed"
