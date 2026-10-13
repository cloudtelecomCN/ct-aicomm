import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../docs/bench-reproduction/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("environment-fingerprint-v2.schema.json", root), "utf8"));
const example = JSON.parse(await readFile(new URL("synthetic-environment-v2.json", root), "utf8"));

assert.equal(schema.properties.schema_version.const, "2.0.0");
assert.equal(example.schema_version, "2.0.0");
for (const field of schema.required) assert.ok(Object.hasOwn(example, field), `missing field: ${field}`);
assert.equal(example.inference_server.name, "vllm");
assert.match(example.inference_server.version, /^0\.\d+\.\d+$/);
assert.ok(example.hardware.accelerators.length > 0);
assert.ok(example.network.interfaces.length > 0);
assert.ok(example.runtimes.some(({ name }) => name === "cuda"));

const hashes = [
  example.host.hostname_hash,
  example.kernel.command_line_sha256,
  example.inference_server.launch_config_sha256,
  example.model.artifact_sha256,
  example.model.tokenizer_sha256,
  example.network.route_table_sha256,
  ...example.artifacts.map(({ sha256 }) => sha256)
];
for (const hash of hashes) assert.match(hash, /^[a-f0-9]{64}$/);
console.log("Environment fingerprint v2 schema and synthetic example are valid.");
