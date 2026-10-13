import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const methodology = JSON.parse(await readFile(new URL("../specs/bench/ttft-methodology-v1.json", import.meta.url), "utf8"));
const promptText = await readFile(new URL("../examples/bench/ct-ttft-prompts-v1.jsonl", import.meta.url), "utf8");
const prompts = promptText.trim().split(/\r?\n/).map((line) => JSON.parse(line));

assert.equal(methodology.methodology_version, "1.0.0");
assert.deepEqual(methodology.groups.map(({ id }) => id), ["baseline", "connector_only", "network_only", "joint"]);
assert.ok(methodology.execution.warmup_requests_per_target > 0);
assert.ok(methodology.execution.measured_requests_per_group_minimum >= 200);
assert.ok(methodology.execution.repetitions_minimum >= 3);
assert.equal(methodology.sample_policy.retain_all_attempts, true);
assert.equal(methodology.sample_policy.post_hoc_outlier_removal, false);
assert.equal(methodology.statistics.confidence_interval.level, 0.95);
assert.equal(methodology.provenance.synthetic_and_measured_must_not_be_aggregated, true);

const ids = new Set();
const classes = new Set();
for (const prompt of prompts) {
  assert.ok(prompt.id && prompt.class && prompt.prompt);
  assert.ok(!ids.has(prompt.id), `duplicate prompt id: ${prompt.id}`);
  ids.add(prompt.id);
  classes.add(prompt.class);
}
assert.deepEqual([...classes].sort(), [...methodology.dataset.prompt_classes].sort());
console.log("TTFT methodology v1 and prompt dataset are valid.");
