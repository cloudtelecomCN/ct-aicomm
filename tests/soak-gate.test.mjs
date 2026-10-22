import assert from "node:assert/strict";
import test from "node:test";
import { createSoakManifest, validateSoakManifest, verifySoakStage } from "../packages/qa/soak-gate.mjs";

const hash = (character) => `sha256:${character.repeat(64)}`;

function manifest(stage = "seven_day") {
  return createSoakManifest({
    stage,
    started_at: "2026-01-01T00:00:00.000Z",
    environment_fingerprint: hash("a"),
    source_commit: "b".repeat(40),
    artifacts: {
      agent_sha256: hash("c"),
      bpf_sha256: hash("d"),
      prompt_dataset_sha256: hash("e"),
      collector_sha256: hash("f"),
      runner_sha256: hash("1"),
      monitor_sha256: hash("2")
    },
    model: "example/model",
    node_aliases: ["node-a", "node-b"],
    endpoint_aliases: ["endpoint-a", "endpoint-b"],
    workload: { cadence_seconds: 3600, concurrency_levels: [1, 8], samples_per_stratum: 8, repetitions: 1 },
    thresholds: {
      observation_interval_seconds: 3600,
      maximum_observation_gap_seconds: 3700,
      maximum_workload_gap_seconds: 3700,
      maximum_failure_ratio: 0.01,
      maximum_ttft_p95_drift_ratio: 0.25,
      maximum_agent_rss_growth_kib: 32768,
      maximum_agent_rss_growth_ratio: 0.25,
      maximum_vllm_rss_growth_kib: 1048576,
      maximum_gpu_memory_growth_mib: 1024
    }
  });
}

function measuredRecords(durationHours = 168) {
  const gate = manifest();
  const workloadWindows = [];
  const nodeObservations = [];
  for (let hour = 0; hour <= durationHours; hour += 1) {
    const observedAt = new Date(Date.parse(gate.started_at) + hour * 3_600_000).toISOString();
    workloadWindows.push({
      schema_version: "1.0.0",
      task: "CT-581",
      data_origin: "measured",
      window_id: `window-${String(hour + 1).padStart(6, "0")}`,
      manifest_fingerprint: gate.manifest_fingerprint,
      started_at: observedAt,
      finished_at: observedAt,
      attempt_count: 100,
      success_count: 100,
      failure_count: 0,
      ttft_ms: { p95: 100 + hour / 100 },
      plan_sha256: hash("3"),
      batch_sha256: hash("4"),
      artifacts: { collector_sha256: hash("f"), runner_sha256: hash("1"), prompt_dataset_sha256: hash("e") }
    });
    for (const [nodeOffset, nodeAlias] of ["node-a", "node-b"].entries()) {
      const agentPid = 100 + nodeOffset;
      const vllmPid = 200 + nodeOffset;
      nodeObservations.push({
        schema_version: "1.0.0",
        task: "CT-581",
        data_origin: "measured",
        node_alias: nodeAlias,
        manifest_fingerprint: gate.manifest_fingerprint,
        sequence: hour + 1,
        observed_at: observedAt,
        boot_id: `boot-${nodeAlias}`,
        services: {
          agent: { active_state: "active", sub_state: "running", main_pid: agentPid, restart_count: 0 },
          vllm: { active_state: "active", sub_state: "running", main_pid: vllmPid, restart_count: 0 }
        },
        processes: {
          agent: { pid: agentPid, rss_kib: 10000 + hour },
          vllm: { pid: vllmPid, rss_kib: 500000 + hour * 10 }
        },
        agent_heartbeat: { status: "running", pid: agentPid, sequence: hour + 1, observed_at: observedAt, uptime_seconds: hour * 3600 },
        gpu: { memory_used_mib: 19000 + hour / 10 },
        artifacts: { agent_sha256: hash("c"), bpf_sha256: hash("d"), monitor_sha256: hash("2") }
      });
    }
  }
  return { workloadWindows, nodeObservations };
}

test("passes a complete seven-day stage with stable measured evidence", () => {
  const gate = manifest();
  const records = measuredRecords();
  const receipt = verifySoakStage({ manifest: gate, ...records, finishedAt: "2026-01-08T00:00:00.000Z" });
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.claim_gate, "seven_day_passed");
  assert.equal(receipt.workload.attempt_count, 16900);
  assert.equal(receipt.source_commit, "b".repeat(40));
  assert.deepEqual(receipt.failure_codes, []);
});

test("fails closed for short duration, missing observations, restarts, and artifact drift", () => {
  const gate = manifest();
  const records = measuredRecords(2);
  records.nodeObservations = records.nodeObservations.filter((entry) => entry.node_alias === "node-a");
  records.nodeObservations.at(-1).services.agent.restart_count = 1;
  records.nodeObservations.at(-1).artifacts.agent_sha256 = hash("9");
  const receipt = verifySoakStage({ manifest: gate, ...records, finishedAt: "2026-01-01T02:00:00.000Z" });
  assert.equal(receipt.status, "failed");
  assert.ok(receipt.failure_codes.includes("duration_incomplete"));
  assert.ok(receipt.failure_codes.includes("unexplained_restart:node-a"));
  assert.ok(receipt.failure_codes.includes("artifact_drift:node-a"));
  assert.ok(receipt.failure_codes.includes("node_observations_missing:node-b"));
});

test("fails closed for an omitted resource sample and stale Agent heartbeat", () => {
  const gate = manifest();
  const records = measuredRecords();
  const affected = records.nodeObservations.find((entry) => entry.node_alias === "node-a" && entry.sequence === 3);
  affected.processes.agent = null;
  affected.agent_heartbeat.observed_at = "2026-01-01T00:00:00.000Z";
  const receipt = verifySoakStage({ manifest: gate, ...records, finishedAt: "2026-01-08T00:00:00.000Z" });
  assert.ok(receipt.failure_codes.includes("resource_observation_missing:node-a"));
  assert.ok(receipt.failure_codes.includes("agent_heartbeat_invalid:node-a"));
});

test("fails closed when a workload ledger line is missing or outside the stage", () => {
  const gate = manifest();
  const records = measuredRecords();
  records.workloadWindows.splice(10, 1);
  records.workloadWindows[0].started_at = "2025-12-31T23:59:59.000Z";
  records.workloadWindows[0].finished_at = "2025-12-31T23:59:59.000Z";
  const receipt = verifySoakStage({ manifest: gate, ...records, finishedAt: "2026-01-08T00:00:00.000Z" });
  assert.ok(receipt.failure_codes.includes("workload_window_sequence_gap"));
  assert.ok(receipt.failure_codes.includes("workload_window_outside_stage"));
});

test("binds the manifest to fixed public aliases without runtime endpoints", () => {
  const gate = manifest("thirty_day");
  assert.equal(gate.minimum_duration_seconds, 2_592_000);
  assert.equal(gate.planned_finish_at, "2026-01-31T00:00:00.000Z");
  assert.equal(gate.evidence_boundary.public_receipt_contains_runtime_endpoints, false);
  assert.doesNotMatch(JSON.stringify(gate), /https?:\/\//u);
  assert.throws(() => validateSoakManifest({ ...gate, planned_finish_at: "2030-01-01T00:00:00.000Z" }), { code: "soak_manifest_tampered" });
  assert.throws(() => createSoakManifest({ ...gate, source_commit: "short" }), { code: "soak_commit_invalid" });
});
