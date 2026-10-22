import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { createSoakManifest } from "../packages/qa/soak-gate.mjs";
import { workloadFromSoakLoadProfile } from "../packages/qa/soak-load-profile.mjs";
import { checkSoakReadiness, writeSoakReadiness } from "../scripts/check-soak-readiness.mjs";
import { freezeEnvironment } from "../packages/poc/environment-freeze.mjs";

const execute = promisify(execFile);
const createManifestScript = fileURLToPath(new URL("../scripts/create-soak-manifest.mjs", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const prefixedSha256 = (bytes) => `sha256:${sha256(bytes)}`;

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "ct581-readiness-"));
  const paths = Object.fromEntries(["agent", "bpf", "prompts", "collector", "runner", "monitor"].map((name) => [name, join(directory, name)]));
  const bytes = {
    agent: Buffer.from("agent"),
    bpf: Buffer.from("bpf"),
    prompts: Buffer.from('{"id":"p1","class":"short","prompt":"hello"}\n'),
    collector: Buffer.from("collector"),
    runner: Buffer.from("runner"),
    monitor: Buffer.from("monitor"),
  };
  await Promise.all(Object.entries(paths).map(([name, path]) => writeFile(path, bytes[name])));
  const loadProfile = {
    schema_version: "1.0.0",
    id: "ct-581-seven-day-v1",
    stage: "seven_day",
    cadence_seconds: 900,
    concurrency: [1, 8, 32, 64],
    samples_per_stratum: 64,
    repetitions: 1,
    topologies: ["single-endpoint", "all-endpoints"],
  };
  const loadProfileBytes = Buffer.from(`${JSON.stringify(loadProfile, null, 2)}\n`);
  const loadProfilePath = join(directory, "load-profile.json");
  await writeFile(loadProfilePath, loadProfileBytes);
  const environment = {
    schema_version: "1.0.0",
    freeze_id: "ct-581-seven-day-fixture",
    status: "frozen",
    evidence_origin: "measured",
    frozen_at: "2029-12-31T23:50:00.000Z",
    experiment_window_start: "2030-01-01T00:00:00.000Z",
    experiment_window_end: "2030-01-09T00:00:00.000Z",
    model: { identifier: "example/model", revision: "fixture-revision", artifact_sha256: "a".repeat(64) },
    compute: { accelerator_model: "Example GPU", accelerator_count: 2 },
    software: { kernel: "6.1.0", driver: "1.0.0", runtime: "CUDA fixture", vllm: "0.31.0" },
    network: { topology: "two-node fixture", baseline_route: "fixture baseline", candidate_route: "observe-only fixture" },
    prompt_dataset: { id: "fixture-prompts", sha256: sha256(bytes.prompts) },
    load_profile: { id: loadProfile.id, sha256: sha256(loadProfileBytes), concurrency: [...loadProfile.concurrency] },
    artifacts: { collector_sha256: sha256(bytes.collector), agent_sha256: sha256(bytes.agent), orchestrator_sha256: "b".repeat(64) },
    approval: { state: "approved", approved_by: "fixture owner", approved_at: "2029-12-31T23:50:00.000Z" },
  };
  const environmentPath = join(directory, "environment.json");
  await writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);
  const manifest = createSoakManifest({
    stage: "seven_day",
    started_at: "2030-01-01T00:10:00.000Z",
    environment_fingerprint: freezeEnvironment(environment).environment_fingerprint,
    source_commit: "c".repeat(40),
    artifacts: {
      agent_sha256: prefixedSha256(bytes.agent),
      bpf_sha256: prefixedSha256(bytes.bpf),
      prompt_dataset_sha256: prefixedSha256(bytes.prompts),
      collector_sha256: prefixedSha256(bytes.collector),
      runner_sha256: prefixedSha256(bytes.runner),
      monitor_sha256: prefixedSha256(bytes.monitor),
    },
    model: environment.model.identifier,
    node_aliases: ["node-a", "node-b"],
    endpoint_aliases: ["endpoint-a", "endpoint-b"],
    workload: workloadFromSoakLoadProfile(loadProfile, "seven_day"),
    thresholds: {
      observation_interval_seconds: 60,
      maximum_observation_gap_seconds: 180,
      maximum_workload_gap_seconds: 1500,
      maximum_failure_ratio: 0.01,
      maximum_ttft_p95_drift_ratio: 0.25,
      maximum_agent_rss_growth_kib: 32768,
      maximum_agent_rss_growth_ratio: 0.25,
      maximum_vllm_rss_growth_kib: 1048576,
      maximum_gpu_memory_growth_mib: 1024,
    },
  });
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const nodeObservationPaths = new Map();
  for (const [offset, alias] of manifest.node_aliases.entries()) {
    const agentPid = 100 + offset;
    const vllmPid = 200 + offset;
    const observation = {
      schema_version: "1.0.0",
      task: "CT-581",
      data_origin: "measured",
      node_alias: alias,
      manifest_fingerprint: manifest.manifest_fingerprint,
      sequence: 1,
      observed_at: "2030-01-01T00:00:00.000Z",
      boot_id: `boot-${alias}`,
      services: {
        agent: { active_state: "active", sub_state: "running", main_pid: agentPid, restart_count: 0 },
        vllm: { active_state: "active", sub_state: "running", main_pid: vllmPid, restart_count: 0 },
      },
      processes: { agent: { pid: agentPid, rss_kib: 12000 }, vllm: { pid: vllmPid, rss_kib: 500000 } },
      agent_heartbeat: { status: "running", pid: agentPid, sequence: 10, observed_at: "2030-01-01T00:00:00.000Z", uptime_seconds: 600 },
      gpu: { memory_used_mib: 19000 },
      artifacts: { agent_sha256: manifest.artifacts.agent_sha256, bpf_sha256: manifest.artifacts.bpf_sha256, monitor_sha256: manifest.artifacts.monitor_sha256 },
    };
    const path = join(directory, `${alias}.json`);
    await writeFile(path, `${JSON.stringify(observation)}\n`);
    nodeObservationPaths.set(alias, path);
  }
  return { directory, paths, bytes, loadProfile, loadProfilePath, environment, environmentPath, manifest, manifestPath, nodeObservationPaths };
}

function readinessOptions(value, overrides = {}) {
  return {
    manifestPath: value.manifestPath,
    environmentPath: value.environmentPath,
    loadProfilePath: value.loadProfilePath,
    promptsPath: value.paths.prompts,
    agentPath: value.paths.agent,
    bpfPath: value.paths.bpf,
    collectorPath: value.paths.collector,
    runnerPath: value.paths.runner,
    monitorPath: value.paths.monitor,
    endpoints: new Map([["endpoint-a", "http://127.0.0.1:8000"], ["endpoint-b", "http://127.0.0.2:8000"]]),
    nodeObservationPaths: value.nodeObservationPaths,
    outputRoot: value.directory,
    minimumFreeBytes: 1024,
    now: new Date("2030-01-01T00:00:30.000Z"),
    apiKey: "fixture-secret",
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: value.manifest.model }] }), { status: 200, headers: { "content-type": "application/json" } }),
    statfsImpl: async () => ({ bavail: 1_000_000n, bsize: 4096n }),
    ...overrides,
  };
}

test("passes a no-workload launch gate without disclosing endpoints or credentials", async () => {
  const value = await fixture();
  try {
    const probes = [];
    const result = await checkSoakReadiness(readinessOptions(value, {
      fetchImpl: async (url, options) => {
        probes.push({ url: String(url), options });
        return new Response(JSON.stringify({ data: [{ id: value.manifest.model }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    }));
    assert.equal(result.status, "ready");
    assert.equal(result.stage, "seven_day");
    assert.equal(result.endpoints.length, 2);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.evidence_boundary.runtime_endpoints_disclosed, false);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /127\.0\.0\.[12]|fixture-secret/u);
    assert.match(result.readiness_fingerprint, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(probes.length, 2);
    assert.ok(probes.every((probe) => probe.url.endsWith("/v1/models") && probe.options.method === "GET" && probe.options.redirect === "error"));
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("writes a restricted readiness artifact without replacing prior evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ct581-readiness-output-"));
  const outputPath = join(directory, "nested", "readiness.json");
  const result = { schema_version: "1.0.0", status: "ready", readiness_fingerprint: `sha256:${"a".repeat(64)}` };
  try {
    assert.equal(await writeSoakReadiness(outputPath, result), outputPath);
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), result);
    await assert.rejects(writeSoakReadiness(outputPath, result), { code: "EEXIST" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails closed for stale node evidence, missing models, artifact drift, and insufficient disk", async () => {
  const value = await fixture();
  try {
    const nodeAPath = value.nodeObservationPaths.get("node-a");
    const nodeA = JSON.parse(await readFile(nodeAPath, "utf8"));
    nodeA.agent_heartbeat.observed_at = "2029-12-31T23:00:00.000Z";
    await writeFile(nodeAPath, `${JSON.stringify(nodeA)}\n`);
    await assert.rejects(checkSoakReadiness(readinessOptions(value)), { code: "soak_readiness_observation_stale" });

    nodeA.agent_heartbeat.observed_at = "2030-01-01T00:00:00.000Z";
    await writeFile(nodeAPath, `${JSON.stringify(nodeA)}\n`);
    await assert.rejects(checkSoakReadiness(readinessOptions(value, { fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) })), { code: "soak_readiness_model_missing" });

    await writeFile(value.paths.agent, "changed-agent");
    await assert.rejects(checkSoakReadiness(readinessOptions(value)), { code: "soak_readiness_artifact_mismatch" });
    await writeFile(value.paths.agent, value.bytes.agent);

    await assert.rejects(checkSoakReadiness(readinessOptions(value, { statfsImpl: async () => ({ bavail: 1n, bsize: 1n }) })), { code: "soak_readiness_disk_insufficient" });

    const nodeBPath = value.nodeObservationPaths.get("node-b");
    const nodeB = JSON.parse(await readFile(nodeBPath, "utf8"));
    nodeB.gpu.memory_used_mib = -1;
    await writeFile(nodeBPath, `${JSON.stringify(nodeB)}\n`);
    await assert.rejects(checkSoakReadiness(readinessOptions(value)), { code: "soak_readiness_resource_invalid" });
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("creates the immutable manifest from the hash-bound load profile", async () => {
  const value = await fixture();
  try {
    const outputPath = join(value.directory, "created-manifest.json");
    await execute(process.execPath, [
      createManifestScript,
      "--stage=seven_day",
      "--started-at=2030-01-01T00:10:00.000Z",
      `--source-commit=${"d".repeat(40)}`,
      `--environment=${value.environmentPath}`,
      `--load-profile=${value.loadProfilePath}`,
      `--prompts=${value.paths.prompts}`,
      `--agent=${value.paths.agent}`,
      `--bpf=${value.paths.bpf}`,
      `--collector=${value.paths.collector}`,
      `--runner=${value.paths.runner}`,
      `--monitor=${value.paths.monitor}`,
      `--output=${outputPath}`,
    ], { windowsHide: true });
    const created = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(created.workload, workloadFromSoakLoadProfile(value.loadProfile, "seven_day"));

    await writeFile(value.loadProfilePath, `${JSON.stringify({ ...value.loadProfile, cadence_seconds: 60 }, null, 2)}\n`);
    await assert.rejects(execute(process.execPath, [
      createManifestScript,
      "--stage=seven_day",
      "--started-at=2030-01-01T00:10:00.000Z",
      `--source-commit=${"d".repeat(40)}`,
      `--environment=${value.environmentPath}`,
      `--load-profile=${value.loadProfilePath}`,
      `--prompts=${value.paths.prompts}`,
      `--agent=${value.paths.agent}`,
      `--bpf=${value.paths.bpf}`,
      `--collector=${value.paths.collector}`,
      `--runner=${value.paths.runner}`,
      `--monitor=${value.paths.monitor}`,
      `--output=${join(value.directory, "tampered-manifest.json")}`,
    ], { windowsHide: true }), /load profile does not match the frozen environment/u);
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});
