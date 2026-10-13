import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectorMapEntries, validateSelectorPolicy } from "../packages/agent-control/selector-policy.mjs";

test("builds deterministic allowlist map entries", async () => {
  const policy = JSON.parse(await readFile(new URL("../examples/agent/selector-policy.json", import.meta.url), "utf8"));
  const validated = validateSelectorPolicy(policy);
  assert.equal(validated.action, "identify_only");
  assert.equal(validated.default_effect, "pass_unmodified");
  const entries = selectorMapEntries(policy);
  assert.deepEqual(entries.allowed_cgroups.map(({ key }) => key), [1048577n]);
  assert.deepEqual(entries.allowed_destination_ports.map(({ key }) => key), [8000, 8443]);
});

test("rejects empty, duplicate, and invalid selectors", () => {
  assert.throws(() => validateSelectorPolicy({ schema_version: "1.0.0", cgroup_ids: [], destination_ports: [8000] }), (error) => error.code === "cgroup_allowlist_empty");
  assert.throws(() => validateSelectorPolicy({ schema_version: "1.0.0", cgroup_ids: [1, 1], destination_ports: [8000] }), (error) => error.code === "cgroup_duplicate");
  assert.throws(() => validateSelectorPolicy({ schema_version: "1.0.0", cgroup_ids: [1], destination_ports: [0] }), (error) => error.code === "destination_port_invalid");
});
