import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { runFaultInjectionSuite, verifyFaultInjectionReport } from "../packages/qa/fault-injection-suite.mjs";

const common = Object.freeze({ evidence_origin: "simulated", contained: true, no_unapproved_execution: true });
function safeScenarios() {
  return {
    agent_disconnect: async () => ({ ...common, automatic_execution_allowed: false, action: "preserve_original_route" }),
    target_failure: async () => ({ ...common, rollback_confirmed: true, restored_revision: 7 }),
    version_conflict: async () => ({ ...common, rejection_code: "policy_revision_stale" }),
    stale_metrics: async () => ({ ...common, elimination_reasons: ["metrics_stale"] }),
    network_jitter: async () => ({ ...common, rollback_confirmed: true, trigger: "timeout_rate_exceeded" })
  };
}

test("passes all five required fail-static fault scenarios", async () => {
  const report = await runFaultInjectionSuite({ scenarios: safeScenarios(), suiteId: "ct-519-local", environmentFingerprint: fingerprint({ runner: "node-test", platform: process.platform }), startedAt: new Date("2026-10-13T16:00:00Z") });
  assert.equal(report.scenario_count, 5);
  assert.deepEqual(report.results.map(({ name }) => name), ["agent_disconnect", "target_failure", "version_conflict", "stale_metrics", "network_jitter"]);
  assert.deepEqual(verifyFaultInjectionReport(report), { valid: true, suite_id: "ct-519-local", report_fingerprint: report.report_fingerprint });
  assert.throws(() => { report.results[0].status = "failed"; }, TypeError);
});

test("fails the gate on unsafe or incomplete scenario evidence", async () => {
  const base = { suiteId: "ct-519-unsafe", environmentFingerprint: fingerprint({ runner: "node-test" }) };
  const disconnected = safeScenarios();
  disconnected.agent_disconnect = async () => ({ ...common, automatic_execution_allowed: true });
  await assert.rejects(() => runFaultInjectionSuite({ ...base, scenarios: disconnected }), (error) => error.code === "fault_agent_disconnect_not_closed");
  const rollback = safeScenarios();
  rollback.target_failure = async () => ({ ...common, rollback_confirmed: false });
  await assert.rejects(() => runFaultInjectionSuite({ ...base, scenarios: rollback }), (error) => error.code === "fault_rollback_unconfirmed");
  const missing = safeScenarios();
  delete missing.network_jitter;
  await assert.rejects(() => runFaultInjectionSuite({ ...base, scenarios: missing }), (error) => error.code === "fault_scenario_missing");
});

test("detects report tampering", async () => {
  const report = structuredClone(await runFaultInjectionSuite({ scenarios: safeScenarios(), suiteId: "ct-519-tamper", environmentFingerprint: fingerprint({ runner: "node-test" }) }));
  report.results[1].evidence.restored_revision = 99;
  assert.throws(() => verifyFaultInjectionReport(report), (error) => error.code === "fault_report_tampered");
});
