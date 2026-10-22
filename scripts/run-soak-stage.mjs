#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSoakManifest } from "../packages/qa/soak-gate.mjs";
import { freezeEnvironment } from "../packages/poc/environment-freeze.mjs";
import { buildScalePlan, runScalePlan, summarizeScaleBatch } from "../packages/poc/scale-experiment.mjs";

function values(argv, name) {
  return argv.filter((entry) => entry.startsWith(`${name}=`)).map((entry) => entry.slice(name.length + 1));
}

function value(argv, name, fallback = "") {
  return values(argv, name).at(-1) ?? fallback;
}

function required(argv, name) {
  const result = value(argv, name);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function endpoint(entry) {
  const separator = entry.indexOf("=");
  if (separator < 1) throw new Error("--endpoint must use alias=http://host:port");
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}

async function sha256File(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

async function writeAtomic(path, value) {
  const temporary = `${path}.tmp.${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function appendJsonLine(path, value) {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.write(`${JSON.stringify(value)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * probability) - 1)];
}

const argv = process.argv.slice(2);
const manifestPath = resolve(required(argv, "--manifest"));
const environmentPath = resolve(required(argv, "--environment"));
const promptsPath = resolve(required(argv, "--prompts"));
const agentPath = resolve(required(argv, "--agent"));
const bpfPath = resolve(required(argv, "--bpf"));
const collectorPath = resolve(required(argv, "--collector"));
const monitorPath = resolve(required(argv, "--monitor"));
const runnerPath = fileURLToPath(import.meta.url);
const output = resolve(required(argv, "--output"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
validateSoakManifest(manifest);
async function verifyRuntimeArtifacts() {
  const actual = {
    agent_sha256: await sha256File(agentPath),
    bpf_sha256: await sha256File(bpfPath),
    prompt_dataset_sha256: await sha256File(promptsPath),
    collector_sha256: await sha256File(collectorPath),
    runner_sha256: await sha256File(runnerPath),
    monitor_sha256: await sha256File(monitorPath)
  };
  if (Object.entries(actual).some(([name, digest]) => digest !== manifest.artifacts[name])) throw new Error("runtime artifacts do not match the frozen soak manifest");
  return actual;
}
const runtimeArtifacts = await verifyRuntimeArtifacts();

const endpointEntries = values(argv, "--endpoint").map(endpoint);
const endpoints = new Map(endpointEntries);
if (endpointEntries.length !== endpoints.size || endpoints.size !== manifest.endpoint_aliases.length || manifest.endpoint_aliases.some((alias) => !endpoints.has(alias))) throw new Error("runtime endpoint aliases do not match the manifest");
for (const [alias, address] of endpoints) {
  const parsed = new URL(address);
  if (!manifest.endpoint_aliases.includes(alias) || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("runtime endpoint is invalid");
}
const environment = JSON.parse(await readFile(environmentPath, "utf8"));
const frozenEnvironment = freezeEnvironment(environment);
if (frozenEnvironment.environment_fingerprint !== manifest.environment_fingerprint || environment.model?.identifier !== manifest.model) throw new Error("environment does not match the frozen soak manifest");
const prompts = (await readFile(promptsPath, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const topologies = [
  { id: "single-endpoint", endpoint_ids: [manifest.endpoint_aliases[0]] },
  { id: "all-endpoints", endpoint_ids: manifest.endpoint_aliases }
];

await mkdir(resolve(output, "windows"), { recursive: true, mode: 0o700 });
const lockPath = resolve(output, "runner.lock");
let lock;
for (let attempt = 0; attempt < 2; attempt += 1) {
  try {
    lock = await open(lockPath, "wx", 0o600);
    await lock.write(`${process.pid}\n`);
    break;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number.parseInt(await readFile(lockPath, "utf8"), 10);
    let active = Number.isInteger(owner) && owner > 0;
    if (active) {
      try { process.kill(owner, 0); } catch { active = false; }
    }
    if (active || attempt > 0) throw new Error("another soak runner owns the output directory");
    await rm(lockPath, { force: true });
  }
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
const statePath = resolve(output, "state.json");
let state;
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
  if (state.manifest_fingerprint !== manifest.manifest_fingerprint) throw new Error("existing runner state belongs to another manifest");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  state = { schema_version: "1.0.0", task: "CT-581", manifest_fingerprint: manifest.manifest_fingerprint, next_window: 1, last_window_started_at: null };
  await writeAtomic(statePath, state);
}
try {
  const existingWindows = (await readFile(resolve(output, "workload-windows.jsonl"), "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const maximumWindow = Math.max(0, ...existingWindows.map((window) => Number.parseInt(String(window.window_id).slice("window-".length), 10) || 0));
  if (maximumWindow >= state.next_window) {
    state = { ...state, next_window: maximumWindow + 1, last_window_started_at: existingWindows.at(-1)?.started_at ?? state.last_window_started_at };
    await writeAtomic(statePath, state);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const deadline = Date.parse(manifest.started_at) + manifest.minimum_duration_seconds * 1000;
try {
  while (!stopping && Date.now() < deadline) {
    if (Date.now() < Date.parse(manifest.started_at)) {
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(30_000, Date.parse(manifest.started_at) - Date.now())));
      continue;
    }
    await verifyRuntimeArtifacts();
    const windowNumber = state.next_window;
    const windowId = `window-${String(windowNumber).padStart(6, "0")}`;
    const windowOutput = resolve(output, "windows", windowId);
    await mkdir(windowOutput, { recursive: true, mode: 0o700 });
    const startedAt = new Date().toISOString();
    const plan = buildScalePlan({ environment, prompts, topologies, concurrencyLevels: manifest.workload.concurrency_levels, samplesPerStratum: manifest.workload.samples_per_stratum, repetitions: manifest.workload.repetitions });
    const batch = await runScalePlan({ plan, endpoints, model: manifest.model, apiKey: process.env.VLLM_API_KEY });
    const summary = summarizeScaleBatch(batch);
    const finishedAt = new Date().toISOString();
    const successfulTtft = batch.samples.filter((sample) => sample.outcome?.success && Number.isFinite(sample.segments?.ttft_ms)).map((sample) => sample.segments.ttft_ms);
    const artifacts = new Map([
      ["plan.json", `${JSON.stringify(plan, null, 2)}\n`],
      ["batch.json", `${JSON.stringify(batch)}\n`],
      ["summary.json", `${JSON.stringify(summary, null, 2)}\n`]
    ]);
    for (const [name, bytes] of artifacts) await writeFile(resolve(windowOutput, name), bytes, { mode: 0o600 });
    const checksums = [...artifacts].map(([name, bytes]) => `${createHash("sha256").update(bytes).digest("hex")}  ${name}`).join("\n");
    await writeFile(resolve(windowOutput, "SHA256SUMS"), `${checksums}\n`, { mode: 0o600 });
    await appendJsonLine(resolve(output, "workload-windows.jsonl"), {
      schema_version: "1.0.0",
      task: "CT-581",
      data_origin: "measured",
      window_id: windowId,
      manifest_fingerprint: manifest.manifest_fingerprint,
      started_at: startedAt,
      finished_at: finishedAt,
      attempt_count: batch.sample_count,
      success_count: batch.success_count,
      failure_count: batch.failure_count,
      ttft_ms: { p50: percentile(successfulTtft, 0.5), p95: percentile(successfulTtft, 0.95), p99: percentile(successfulTtft, 0.99) },
      plan_sha256: `sha256:${batch.plan_sha256}`,
      batch_sha256: `sha256:${batch.batch_sha256}`,
      artifacts: {
        collector_sha256: runtimeArtifacts.collector_sha256,
        runner_sha256: runtimeArtifacts.runner_sha256,
        prompt_dataset_sha256: runtimeArtifacts.prompt_dataset_sha256
      },
      raw_evidence_visibility: "restricted"
    });
    state = { ...state, next_window: windowNumber + 1, last_window_started_at: startedAt };
    await writeAtomic(statePath, state);
    const nextAt = Date.parse(startedAt) + manifest.workload.cadence_seconds * 1000;
    while (!stopping && Date.now() < Math.min(nextAt, deadline)) await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(30_000, nextAt - Date.now(), deadline - Date.now())));
  }
  if (!stopping && Date.now() >= deadline) {
    const ledgerPath = resolve(output, "workload-windows.jsonl");
    const windows = (await readFile(ledgerPath, "utf8")).split(/\r?\n/u).filter(Boolean).length;
    await writeAtomic(resolve(output, "completed.json"), { schema_version: "1.0.0", task: "CT-581", completed_at: new Date().toISOString(), manifest_fingerprint: manifest.manifest_fingerprint, window_count: windows, workload_ledger_sha256: await sha256File(ledgerPath) });
  }
} finally {
  await lock?.close();
  await rm(lockPath, { force: true });
}
