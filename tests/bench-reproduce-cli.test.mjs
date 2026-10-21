import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildBenchPackage, fingerprintEnvironment, parseJsonLines, verifyBenchPackage, writeBenchPackage } from "../packages/bench-reproduce/index.mjs";

const environment = { schema_version: "1.0.0", hardware: { cpu_model: "test" }, kernel: { os: "test", release: "1" } };
const exec = promisify(execFile);
function sample(id, success, fingerprint) {
  return { schema_version: "1.0.0", sample_id: id, request_id: `request-${id}`, trace_id: `trace-${id}`, data_origin: "synthetic", started_at: "2026-10-21T00:00:00Z", outcome: success ? { success: true, http_status: 200 } : { success: false, http_status: 503, failure_stage: "stream", failure_code: "synthetic_timeout" }, route: { protocol: "http", inference_instance: "synthetic" }, segments: success ? { ttft_ms: id === "a" ? 40 : 60, time_to_response_headers_ms: id === "a" ? 12 : 18 } : {}, evidence: { environment_fingerprint: fingerprint } };
}

test("generates report, stable CSV, and verifiable checksums while retaining failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "ct-bench-reproduce-"));
  const fingerprint = fingerprintEnvironment(environment);
  const samples = [sample("a", true, fingerprint), sample("b", true, fingerprint), sample("c", false, fingerprint)];
  const result = await writeBenchPackage(root, { samples, environment, dataOrigin: "synthetic", scenarioSlug: "inference-ttft", protocolSlug: "http" });
  assert.deepEqual(result.files, ["report.json", "raw-samples.csv", "SHA256SUMS"]);
  const report = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
  assert.deepEqual(report.sample_policy, { total: 3, successful: 2, failed: 1, failure_handling: "retain-and-report" });
  assert.equal(report.metrics.find((metric) => metric.name === "ttft_ms" && metric.percentile === "p50").value, 40);
  assert.match(await readFile(join(root, "raw-samples.csv"), "utf8"), /c,,,false,synthetic_timeout/);
  assert.equal((await verifyBenchPackage(root)).valid, true);
});

test("rejects mixed origins and environment mismatches", () => {
  const fingerprint = fingerprintEnvironment(environment);
  const mixed = [sample("a", true, fingerprint), { ...sample("b", true, fingerprint), data_origin: "measured" }];
  assert.throws(() => buildBenchPackage({ samples: mixed, environment, dataOrigin: "synthetic", scenarioSlug: "inference-ttft", protocolSlug: "http" }), /sample_origin_mismatch/);
  assert.throws(() => buildBenchPackage({ samples: [sample("a", true, `sha256:${"f".repeat(64)}`)], environment, dataOrigin: "synthetic", scenarioSlug: "inference-ttft", protocolSlug: "http" }), /sample_environment_mismatch/);
});

test("verification detects artifact tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "ct-bench-tamper-"));
  const fingerprint = fingerprintEnvironment(environment);
  await writeBenchPackage(root, { samples: [sample("a", true, fingerprint)], environment, dataOrigin: "synthetic", scenarioSlug: "inference-ttft", protocolSlug: "http" });
  await writeFile(join(root, "raw-samples.csv"), "tampered\n");
  await assert.rejects(() => verifyBenchPackage(root), /checksum_mismatch/);
});

test("JSONL parser reports the failing line", () => {
  assert.deepEqual(parseJsonLines('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
  assert.throws(() => parseJsonLines('{"a":1}\nnot-json\n'), /jsonl_invalid:2/);
});

test("all-failure packages retain failures without inventing latency", () => {
  const fingerprint = fingerprintEnvironment(environment);
  const built = buildBenchPackage({ samples: [sample("failed", false, fingerprint)], environment, dataOrigin: "synthetic", scenarioSlug: "inference-ttft", protocolSlug: "http" });
  assert.equal(built.report.metrics.some((metric) => metric.name === "ttft_ms"), false);
  assert.equal(built.report.metrics.find((metric) => metric.name === "request_success_rate").value, 0);
});

test("CLI fingerprints, generates, and verifies a package end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "ct-bench-cli-"));
  const environmentPath = join(root, "environment.json");
  const samplesPath = join(root, "samples.jsonl");
  const output = join(root, "output");
  await writeFile(environmentPath, JSON.stringify(environment));
  const fingerprint = fingerprintEnvironment(environment);
  await writeFile(samplesPath, `${JSON.stringify(sample("a", true, fingerprint))}\n${JSON.stringify(sample("b", false, fingerprint))}\n`);
  const cli = fileURLToPath(new URL("../packages/bench-reproduce/cli.mjs", import.meta.url));
  const fingerprintRun = await exec(process.execPath, [cli, `--fingerprint-environment=${environmentPath}`]);
  assert.equal(fingerprintRun.stdout.trim(), fingerprint);
  await exec(process.execPath, [cli, `--samples=${samplesPath}`, `--environment=${environmentPath}`, `--output=${output}`, "--data-origin=synthetic", "--scenario=inference-ttft", "--protocol=http"]);
  const verifyRun = await exec(process.execPath, [cli, `--verify=${output}`]);
  assert.deepEqual(JSON.parse(verifyRun.stdout), { valid: true, files: ["raw-samples.csv", "report.json"], data_origin: "synthetic", sample_count: 2, environment_fingerprint: fingerprint });
});
