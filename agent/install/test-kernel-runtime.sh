#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
agent=${1:-$script_dir/../bin/ct-aicomm-agent}
bpf_object=${2:-$script_dir/../bpf/build/ct_selector.bpf.o}
cgroup=/sys/fs/cgroup/ct-aicomm-agent-test-$$
pin_root=/sys/fs/bpf/ct-aicomm-agent-test-$$
state_dir=$(mktemp -d)
agent_pid=

cleanup() {
  if [[ -n $agent_pid ]]; then
    kill -TERM "$agent_pid" >/dev/null 2>&1 || true
    wait "$agent_pid" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$pin_root" "$state_dir"
  rmdir "$cgroup" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ ${EUID} -eq 0 ]] || { echo "kernel runtime test: root is required" >&2; exit 1; }
[[ -x $agent ]] || { echo "kernel runtime test: Agent is not executable" >&2; exit 1; }
[[ -f $bpf_object ]] || { echo "kernel runtime test: BPF object is missing" >&2; exit 1; }
mkdir "$cgroup"

CT_AGENT_TEST_MODE=1 \
CT_AGENT_ID=kernel-runtime-test \
CT_AGENT_MODE=observe_only \
CT_AGENT_CGROUP_PATH="$cgroup" \
CT_AGENT_PIN_ROOT="$pin_root" \
CT_AGENT_STATE_DIR="$state_dir" \
CT_AGENT_DESTINATION_PORTS=8000 \
CT_AGENT_HEARTBEAT_INTERVAL_SECONDS=1 \
  "$agent" run --bpf-object "$bpf_object" >"$state_dir/stdout.log" 2>"$state_dir/stderr.log" &
agent_pid=$!

for _ in $(seq 1 50); do
  [[ -s $state_dir/heartbeat.json ]] && break
  if ! kill -0 "$agent_pid" 2>/dev/null; then
    cat "$state_dir/stderr.log" >&2
    exit 1
  fi
  sleep 0.1
done
[[ -s $state_dir/heartbeat.json ]] || { cat "$state_dir/stderr.log" >&2; exit 1; }

CT_AGENT_TEST_MODE=1 \
CT_AGENT_CGROUP_PATH="$cgroup" \
CT_AGENT_PIN_ROOT="$pin_root" \
CT_AGENT_STATE_DIR="$state_dir" \
  "$agent" health >/dev/null
cgroup_state=$(bpftool cgroup show "$cgroup")
grep -Eq '[[:space:]]connect4[[:space:]]' <<<"$cgroup_state"
grep -Eq '[[:space:]]sock_ops[[:space:]]' <<<"$cgroup_state"
connect_program=$(bpftool prog show pinned "$pin_root/programs/cgroup_connect4")
sockops_program=$(bpftool prog show pinned "$pin_root/programs/sockops")
grep -q 'cgroup_sock_addr' <<<"$connect_program"
grep -q 'sock_ops' <<<"$sockops_program"

kill -TERM "$agent_pid"
wait "$agent_pid"
agent_pid=
[[ ! -e $pin_root ]]
echo "kernel runtime test: real eBPF load, attach, health, and restore passed"
