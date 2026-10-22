#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSoakManifest } from "../packages/qa/soak-gate.mjs";
import { validateSoakLoadProfile, workloadFromSoakLoadProfile } from "../packages/qa/soak-load-profile.mjs";
import { freezeEnvironment } from "../packages/poc/environment-freeze.mjs";

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

async function fileHash(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

const argv = process.argv.slice(2);
const environmentPath = resolve(required(argv, "--environment"));
const loadProfilePath = resolve(required(argv, "--load-profile"));
const promptsPath = resolve(required(argv, "--prompts"));
const agentPath = resolve(required(argv, "--agent"));
const bpfPath = resolve(required(argv, "--bpf"));
const collectorPath = resolve(required(argv, "--collector"));
const runnerPath = resolve(required(argv, "--runner"));
const monitorPath = resolve(required(argv, "--monitor"));
const outputPath = resolve(required(argv, "--output"));
const environment = JSON.parse(await readFile(environmentPath, "utf8"));
const frozen = freezeEnvironment(environment);
const stage = value(argv, "--stage", "seven_day");
const loadProfile = JSON.parse(await readFile(loadProfilePath, "utf8"));
validateSoakLoadProfile(loadProfile, stage);
const loadProfileHash = await fileHash(loadProfilePath);
if (loadProfileHash.slice("sha256:".length) !== environment.load_profile?.sha256 || loadProfile.id !== environment.load_profile?.id) throw new Error("load profile does not match the frozen environment");
if (JSON.stringify(loadProfile.concurrency) !== JSON.stringify(environment.load_profile?.concurrency)) throw new Error("load profile concurrency does not match the frozen environment");
const promptHash = await fileHash(promptsPath);
if (promptHash.slice("sha256:".length) !== environment.prompt_dataset?.sha256) throw new Error("prompt dataset does not match the frozen environment");
const agentHash = await fileHash(agentPath);
const collectorHash = await fileHash(collectorPath);
if (agentHash.slice("sha256:".length) !== environment.artifacts?.agent_sha256) throw new Error("Agent does not match the frozen environment");
if (collectorHash.slice("sha256:".length) !== environment.artifacts?.collector_sha256) throw new Error("collector does not match the frozen environment");

const manifest = createSoakManifest({
  stage,
  started_at: value(argv, "--started-at", new Date().toISOString()),
  environment_fingerprint: frozen.environment_fingerprint,
  source_commit: required(argv, "--source-commit"),
  artifacts: {
    agent_sha256: agentHash,
    bpf_sha256: await fileHash(bpfPath),
    prompt_dataset_sha256: promptHash,
    collector_sha256: collectorHash,
    runner_sha256: await fileHash(runnerPath),
    monitor_sha256: await fileHash(monitorPath)
  },
  model: value(argv, "--model", environment.model?.identifier),
  node_aliases: value(argv, "--nodes", "node-a,node-b").split(",").filter(Boolean),
  endpoint_aliases: value(argv, "--endpoints", "endpoint-a,endpoint-b").split(",").filter(Boolean),
  workload: workloadFromSoakLoadProfile(loadProfile, stage),
  thresholds: {
    observation_interval_seconds: Number.parseInt(value(argv, "--observation-interval-seconds", "60"), 10),
    maximum_observation_gap_seconds: Number.parseInt(value(argv, "--maximum-observation-gap-seconds", "180"), 10),
    maximum_workload_gap_seconds: Number.parseInt(value(argv, "--maximum-workload-gap-seconds", "1500"), 10),
    maximum_failure_ratio: Number.parseFloat(value(argv, "--maximum-failure-ratio", "0.01")),
    maximum_ttft_p95_drift_ratio: Number.parseFloat(value(argv, "--maximum-ttft-drift-ratio", "0.25")),
    maximum_agent_rss_growth_kib: Number.parseInt(value(argv, "--maximum-agent-rss-growth-kib", "32768"), 10),
    maximum_agent_rss_growth_ratio: Number.parseFloat(value(argv, "--maximum-agent-rss-growth-ratio", "0.25")),
    maximum_vllm_rss_growth_kib: Number.parseInt(value(argv, "--maximum-vllm-rss-growth-kib", "1048576"), 10),
    maximum_gpu_memory_growth_mib: Number.parseInt(value(argv, "--maximum-gpu-memory-growth-mib", "1024"), 10)
  }
});
if (Date.parse(manifest.started_at) < Date.parse(environment.experiment_window_start) || Date.parse(manifest.planned_finish_at) > Date.parse(environment.experiment_window_end)) {
  throw new Error("soak stage is outside the frozen experiment window");
}

await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: outputPath, manifest_fingerprint: manifest.manifest_fingerprint })}\n`);
