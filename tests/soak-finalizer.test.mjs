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

const execute = promisify(execFile);
const digest = (character) => `sha256:${character.repeat(64)}`;
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fixtureManifest() {
  return createSoakManifest({
    stage: "preflight",
    started_at: "2026-01-01T00:00:00.000Z",
    environment_fingerprint: digest("a"),
    source_commit: "b".repeat(40),
    artifacts: { agent_sha256: digest("c"), bpf_sha256: digest("d"), prompt_dataset_sha256: digest("e"), collector_sha256: digest("f"), runner_sha256: digest("1"), monitor_sha256: digest("2") },
    model: "example/model",
    node_aliases: ["node-a", "node-b"],
    endpoint_aliases: ["endpoint-a", "endpoint-b"],
    workload: { cadence_seconds: 60, concurrency_levels: [1], samples_per_stratum: 1, repetitions: 1 },
    thresholds: { observation_interval_seconds: 60, maximum_observation_gap_seconds: 70, maximum_workload_gap_seconds: 70, maximum_failure_ratio: 0, maximum_ttft_p95_drift_ratio: 0.25, maximum_agent_rss_growth_kib: 1024, maximum_agent_rss_growth_ratio: 0.25, maximum_vllm_rss_growth_kib: 1024, maximum_gpu_memory_growth_mib: 128 }
  });
}

function records(manifest) {
  const windows = [];
  const nodes = new Map(manifest.node_aliases.map((alias) => [alias, []]));
  for (let minute = 0; minute <= 4; minute += 1) {
    const at = new Date(Date.parse(manifest.started_at) + minute * 60_000).toISOString();
    windows.push({ schema_version: "1.0.0", task: "CT-581", data_origin: "measured", window_id: `window-${String(minute + 1).padStart(6, "0")}`, manifest_fingerprint: manifest.manifest_fingerprint, started_at: at, finished_at: at, attempt_count: 2, success_count: 2, failure_count: 0, ttft_ms: { p95: 10 }, plan_sha256: digest("3"), batch_sha256: digest("4"), artifacts: { collector_sha256: digest("f"), runner_sha256: digest("1"), prompt_dataset_sha256: digest("e") } });
    for (const [offset, alias] of manifest.node_aliases.entries()) {
      const agentPid = 100 + offset;
      const vllmPid = 200 + offset;
      nodes.get(alias).push({ schema_version: "1.0.0", task: "CT-581", data_origin: "measured", node_alias: alias, manifest_fingerprint: manifest.manifest_fingerprint, sequence: minute + 1, observed_at: at, boot_id: `boot-${alias}`, services: { agent: { active_state: "active", sub_state: "running", main_pid: agentPid, restart_count: 0 }, vllm: { active_state: "active", sub_state: "running", main_pid: vllmPid, restart_count: 0 } }, processes: { agent: { pid: agentPid, rss_kib: 1000 }, vllm: { pid: vllmPid, rss_kib: 2000 } }, agent_heartbeat: { status: "running", pid: agentPid, sequence: minute + 1, observed_at: at, uptime_seconds: minute * 60 }, gpu: { memory_used_mib: 100 }, artifacts: { agent_sha256: digest("c"), bpf_sha256: digest("d"), monitor_sha256: digest("2") } });
    }
  }
  return { windows, nodes };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("finalizer requires completion records that match immutable ledgers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ct581-finalizer-"));
  try {
    const manifest = fixtureManifest();
    const fixture = records(manifest);
    const manifestPath = join(directory, "manifest.json");
    const workloadPath = join(directory, "workload.jsonl");
    const workloadCompletionPath = join(directory, "workload-completed.json");
    const outputPath = join(directory, "receipt.json");
    await writeJson(manifestPath, manifest);
    const workloadBytes = `${fixture.windows.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    await writeFile(workloadPath, workloadBytes);
    await writeJson(workloadCompletionPath, { schema_version: "1.0.0", task: "CT-581", manifest_fingerprint: manifest.manifest_fingerprint, completed_at: manifest.planned_finish_at, window_count: fixture.windows.length, workload_ledger_sha256: sha256(workloadBytes) });

    const args = [fileURLToPath(new URL("../scripts/finalize-soak-stage.mjs", import.meta.url)), `--manifest=${manifestPath}`, `--workload-windows=${workloadPath}`, `--workload-completion=${workloadCompletionPath}`, `--output=${outputPath}`];
    for (const alias of manifest.node_aliases) {
      const observationPath = join(directory, `${alias}.jsonl`);
      const completionPath = join(directory, `${alias}-completed.json`);
      const bytes = `${fixture.nodes.get(alias).map((entry) => JSON.stringify(entry)).join("\n")}\n`;
      await writeFile(observationPath, bytes);
      await writeJson(completionPath, { schema_version: "1.0.0", task: "CT-581", node_alias: alias, manifest_fingerprint: manifest.manifest_fingerprint, completed_at: manifest.planned_finish_at, observation_count: fixture.nodes.get(alias).length, observations_sha256: sha256(bytes) });
      args.push(`--node-observations=${alias}=${observationPath}`, `--node-completion=${alias}=${completionPath}`);
    }

    const completed = await execute(process.execPath, args, { windowsHide: true });
    assert.equal(JSON.parse(completed.stdout).status, "passed");
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).claim_gate, "preflight_passed");

    await writeFile(workloadPath, `${workloadBytes}{"tampered":true}\n`);
    await assert.rejects(execute(process.execPath, [...args.slice(0, -1), `--output=${join(directory, "tampered.json")}`, args.at(-1)], { windowsHide: true }), /immutable ledger/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
