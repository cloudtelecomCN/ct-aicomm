#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$script_dir/../.." && pwd)
work=$(mktemp -d)
agent_pid=
cleanup() {
  if [[ -n $agent_pid ]]; then
    kill -TERM "$agent_pid" >/dev/null 2>&1 || true
    wait "$agent_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/bin" "$work/cgroup" "$work/state"
printf 'fixture-bpf-object\n' >"$work/selector.o"

cat >"$work/bin/bpftool" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${CT_AGENT_FAKE_LOG:?}"
if [[ ${1:-} == prog && ${2:-} == loadall ]]; then
  mkdir -p "$4" "$6"
  touch "$4/cgroup_connect4" "$4/classifier" "$4/sockops"
  touch "$6/allowed_cgroups" "$6/allowed_destination_ports" "$6/redirect_routes"
fi
EOF
chmod +x "$work/bin/bpftool"

export CT_AGENT_TEST_MODE=1
export CT_AGENT_BPFTOOL="$work/bin/bpftool"
export CT_AGENT_FAKE_LOG="$work/bpftool.log"
export CT_AGENT_ID=runtime-test-agent
export CT_AGENT_MODE=observe_only
export CT_AGENT_CGROUP_PATH="$work/cgroup"
export CT_AGENT_PIN_ROOT="$work/tmp/pins/runtime"
export CT_AGENT_STATE_DIR="$work/state"
export CT_AGENT_DESTINATION_PORTS=8000,18000
export CT_AGENT_HEARTBEAT_INTERVAL_SECONDS=1

"$repo/agent/bin/ct-aicomm-agent" run --bpf-object "$work/selector.o" >"$work/stdout.log" 2>"$work/stderr.log" &
agent_pid=$!
for _ in $(seq 1 50); do
  [[ -s $work/state/heartbeat.json ]] && break
  sleep 0.1
done
[[ -s $work/state/heartbeat.json ]]
"$repo/agent/bin/ct-aicomm-agent" health >"$work/health.json"
grep -q '"status":"running"' "$work/health.json"
grep -q 'map update pinned .*allowed_cgroups' "$work/bpftool.log"
grep -q 'map update pinned .*allowed_destination_ports' "$work/bpftool.log"
grep -q 'cgroup attach .* connect4 pinned' "$work/bpftool.log"
grep -q 'cgroup attach .* sock_ops pinned' "$work/bpftool.log"

kill -TERM "$agent_pid"
runtime_status=0
wait "$agent_pid" || runtime_status=$?
[[ $runtime_status == 0 ]]
agent_pid=
grep -q '^stopped$' "$work/state/status"
[[ ! -e $work/tmp/pins/runtime ]]

if CT_AGENT_MODE=enforce "$repo/agent/bin/ct-aicomm-agent" run --bpf-object "$work/selector.o" >"$work/enforce.out" 2>"$work/enforce.err"; then
  echo "runtime test: unapproved enforcement mode was accepted" >&2
  exit 1
fi
grep -q 'permits only CT_AGENT_MODE=observe_only' "$work/enforce.err"

echo "runtime test: load, attach, heartbeat, health, restore, and fail-closed mode gate passed"
