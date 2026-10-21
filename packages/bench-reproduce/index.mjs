import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export const BENCH_REPRODUCE_VERSION = "1.0.0";
export const CSV_HEADER = "sample_id,ttft_ms,connection_setup_ms,success,failure_code";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }

export function fingerprintEnvironment(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) throw new Error("environment_invalid");
  return `sha256:${digest(JSON.stringify(canonical(environment)))}`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function validateSamples(samples, dataOrigin, environmentFingerprint) {
  if (!Array.isArray(samples) || samples.length === 0) throw new Error("samples_empty");
  const ids = new Set();
  for (const [index, sample] of samples.entries()) {
    if (!sample || typeof sample !== "object" || sample.schema_version !== "1.0.0") throw new Error(`sample_invalid:${index}`);
    if (sample.data_origin !== dataOrigin) throw new Error(`sample_origin_mismatch:${index}`);
    if (sample.evidence?.environment_fingerprint !== environmentFingerprint) throw new Error(`sample_environment_mismatch:${index}`);
    if (typeof sample.sample_id !== "string" || sample.sample_id.length === 0 || ids.has(sample.sample_id)) throw new Error(`sample_id_invalid:${index}`);
    ids.add(sample.sample_id);
    if (sample.outcome?.success === true && !(Number.isFinite(sample.segments?.ttft_ms) && sample.segments.ttft_ms >= 0)) throw new Error(`sample_ttft_invalid:${index}`);
    if (sample.outcome?.success === false && (typeof sample.outcome.failure_code !== "string" || sample.outcome.failure_code.length === 0)) throw new Error(`sample_failure_code_missing:${index}`);
  }
}

export function buildBenchPackage({ samples, environment, dataOrigin, scenarioSlug, protocolSlug, methodologyVersion = "1.0.0" }) {
  if (!new Set(["synthetic", "hybrid", "measured"]).has(dataOrigin)) throw new Error("data_origin_invalid");
  if (!scenarioSlug || !protocolSlug || !methodologyVersion) throw new Error("report_identity_missing");
  const environmentFingerprint = fingerprintEnvironment(environment);
  validateSamples(samples, dataOrigin, environmentFingerprint);
  const successful = samples.filter((sample) => sample.outcome.success === true);
  const ttft = successful.map((sample) => sample.segments.ttft_ms);
  const setup = successful.map((sample) => sample.segments.time_to_response_headers_ms).filter(Number.isFinite);
  const metrics = ttft.length > 0 ? [50, 95, 99].map((p) => ({ name: "ttft_ms", value: percentile(ttft, p), unit: "ms", sample_count: ttft.length, percentile: `p${p}` })) : [];
  metrics.push({ name: "request_success_rate", value: (successful.length / samples.length) * 100, unit: "percent", sample_count: samples.length, percentile: "" });
  if (setup.length > 0) metrics.push({ name: "connection_setup_ms", value: percentile(setup, 50), unit: "ms", sample_count: setup.length, percentile: "p50" });
  const report = { schema_version: "1.0.0", methodology_version: methodologyVersion, data_origin: dataOrigin, scenario_slug: scenarioSlug, protocol_slug: protocolSlug, environment_fingerprint: environmentFingerprint, environment, sample_policy: { total: samples.length, successful: successful.length, failed: samples.length - successful.length, failure_handling: "retain-and-report" }, metrics, artifacts: { raw_csv: "raw-samples.csv", report_json: "report.json" } };
  const rows = samples.map((sample) => [sample.sample_id, sample.outcome.success ? sample.segments.ttft_ms : null, sample.outcome.success ? sample.segments.time_to_response_headers_ms : null, sample.outcome.success, sample.outcome.success ? "" : sample.outcome.failure_code].map(csvCell).join(","));
  return Object.freeze({ report: Object.freeze(report), csv: `${CSV_HEADER}\n${rows.join("\n")}\n` });
}

export async function writeBenchPackage(outputDirectory, input) {
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const built = buildBenchPackage(input);
  const reportText = `${JSON.stringify(built.report, null, 2)}\n`;
  await writeFile(join(output, "report.json"), reportText, { flag: "wx" });
  await writeFile(join(output, "raw-samples.csv"), built.csv, { flag: "wx" });
  const sums = [`${digest(Buffer.from(built.csv))}  raw-samples.csv`, `${digest(Buffer.from(reportText))}  report.json`].sort((a, b) => a.split("  ")[1].localeCompare(b.split("  ")[1]));
  await writeFile(join(output, "SHA256SUMS"), `${sums.join("\n")}\n`, { flag: "wx" });
  return Object.freeze({ output, files: Object.freeze(["report.json", "raw-samples.csv", "SHA256SUMS"]), environment_fingerprint: built.report.environment_fingerprint });
}

export async function verifyBenchPackage(directory) {
  const root = resolve(directory);
  const lines = (await readFile(join(root, "SHA256SUMS"), "utf8")).trim().split(/\r?\n/);
  const verified = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match || !new Set(["report.json", "raw-samples.csv"]).has(match[2])) throw new Error("checksum_manifest_invalid");
    if (digest(await readFile(join(root, basename(match[2])))) !== match[1]) throw new Error(`checksum_mismatch:${match[2]}`);
    verified.push(match[2]);
  }
  if (verified.length !== 2 || new Set(verified).size !== 2) throw new Error("checksum_manifest_incomplete");
  const report = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
  if (report.environment_fingerprint !== fingerprintEnvironment(report.environment)) throw new Error("report_environment_mismatch");
  const rows = (await readFile(join(root, "raw-samples.csv"), "utf8")).trim().split(/\r?\n/);
  if (rows[0] !== CSV_HEADER || rows.length - 1 !== report.sample_policy.total) throw new Error("report_sample_count_mismatch");
  return Object.freeze({ valid: true, files: Object.freeze(verified.sort()), data_origin: report.data_origin, sample_count: report.sample_policy.total, environment_fingerprint: report.environment_fingerprint });
}

export function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`jsonl_invalid:${index + 1}`); }
  });
}
