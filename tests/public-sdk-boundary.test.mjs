import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import * as sdk from "../sdk/index.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);

test("public SDK exports exactly the versioned manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../sdk/package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, manifest.sdk_version);
  assert.equal(pkg.private, true);
  assert.deepEqual(Object.keys(sdk).sort(), [...manifest.exports].sort());
});

test("public telemetry example is accepted and receives a stable route identity", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/agent/network-telemetry.json", import.meta.url), "utf8"));
  const event = sdk.normalizeNetworkTelemetry(example);
  assert.match(event.route_id, /^route-[a-f0-9]{24}$/);
  assert.equal(event.source, "kernel");
});

test("public SDK example runs without dependencies and keeps synthetic origin explicit", async () => {
  const { stdout } = await exec(process.execPath, ["examples/sdk/validate-public-evidence.mjs"], { cwd: root });
  const output = JSON.parse(stdout);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.performance_claim_allowed, false);
  assert.equal(output.metrics.health, "ready");
});

test("public metric schemas retain evidence boundaries", async () => {
  const telemetry = JSON.parse(await readFile(new URL("../specs/agent/network-telemetry-v1.schema.json", import.meta.url), "utf8"));
  const metrics = JSON.parse(await readFile(new URL("../specs/connectors/vllm-metrics-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(telemetry.additionalProperties, false);
  assert.equal(metrics.additionalProperties, false);
  assert.equal(metrics.properties.evidence.properties.aggregate_only.const, true);
  assert.equal(metrics.properties.evidence.properties.per_request_correlation_allowed.const, false);
});
