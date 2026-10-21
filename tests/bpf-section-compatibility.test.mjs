import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses libbpf-compatible program section names", async () => {
  const source = await readFile(new URL("../agent/bpf/ct_selector.bpf.c", import.meta.url), "utf8");
  assert.match(source, /SEC\("cgroup\/connect4"\)/);
  assert.match(source, /SEC\("classifier"\)/);
  assert.match(source, /SEC\("sockops"\)/);
  assert.doesNotMatch(source, /SEC\("tc\/egress"\)/);
});

test("zero-initializes selector events before map insertion", async () => {
  const source = await readFile(new URL("../agent/bpf/ct_selector.bpf.c", import.meta.url), "utf8");
  assert.match(source, /struct selector_event event;\s*__builtin_memset\(&event, 0, sizeof\(event\)\);/);
  assert.match(source, /bpf_map_update_elem\(&selected_sockets, &cookie, &event, BPF_ANY\)/);
});
