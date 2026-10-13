import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { freezeEnvironment, validateEnvironmentFreeze } from "../packages/poc/environment-freeze.mjs";

const example = JSON.parse(await readFile(new URL("../examples/poc/synthetic-environment-freeze.json", import.meta.url), "utf8"));

test("freezes a complete POC environment with a stable fingerprint", () => {
  assert.equal(validateEnvironmentFreeze(example), true);
  const first = freezeEnvironment(example);
  const reordered = freezeEnvironment(Object.fromEntries(Object.entries(example).reverse()));
  assert.match(first.environment_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.environment_fingerprint, reordered.environment_fingerprint);
});

test("rejects mutable versions and incomplete approval", () => {
  assert.throws(() => freezeEnvironment({ ...example, software: { ...example.software, vllm: "latest" } }), { code: "environment_not_frozen" });
  assert.throws(() => freezeEnvironment({ ...example, approval: { state: "pending" } }), { code: "environment_approval_missing" });
});

test("rejects an invalid experiment window or artifact digest", () => {
  assert.throws(() => freezeEnvironment({ ...example, experiment_window_end: example.experiment_window_start }), { code: "environment_window_invalid" });
  assert.throws(() => freezeEnvironment({ ...example, model: { ...example.model, artifact_sha256: "bad" } }), { code: "environment_hash_invalid" });
});
