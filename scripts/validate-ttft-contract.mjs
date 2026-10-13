import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../docs/bench-reproduction/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("ttft-sample.schema.json", root), "utf8"));
const sample = JSON.parse(await readFile(new URL("synthetic-ttft-sample.json", root), "utf8"));

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.properties.schema_version.const, "1.0.0");
assert.equal(sample.schema_version, schema.properties.schema_version.const);
assert.equal(sample.data_origin, "synthetic");
assert.equal(sample.clock.duration_source, "monotonic");
assert.match(sample.trace_id, /^[a-f0-9]{32}$/);
assert.match(sample.evidence.environment_fingerprint, /^sha256:[a-f0-9]{64}$/);
assert.match(sample.evidence.raw_record_sha256, /^[a-f0-9]{64}$/);

for (const field of schema.required) {
  assert.ok(Object.hasOwn(sample, field), `missing required field: ${field}`);
}
for (const field of schema.properties.segments.required) {
  assert.ok(Object.hasOwn(sample.segments, field), `missing required segment: ${field}`);
  assert.ok(sample.segments[field] >= 0, `negative segment: ${field}`);
}

const segmentTotal = Object.entries(sample.segments)
  .filter(([name]) => name !== "ttft_ms")
  .reduce((total, [, value]) => total + value, 0);
assert.ok(Math.abs(segmentTotal - sample.segments.ttft_ms) <= 0.001, "TTFT must equal the declared segment total");
assert.equal(sample.outcome.success, true);
assert.ok(!Object.hasOwn(sample.outcome, "failure_code"));

console.log("TTFT sample v1 contract and synthetic example are valid.");
