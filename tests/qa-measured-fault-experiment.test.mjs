import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { runMeasuredFaultExperiment, verifyMeasuredFaultReport } from "../packages/qa/measured-fault-experiment.mjs";

const hash = (value) => fingerprint({ value });
const common = { evidence_origin: "measured", contained: true, no_unapproved_execution: true, recovery_time_ms: 25, requests_attempted: 10, error_count: 1, error_rate: 0.1, data_integrity: { before_sha256: hash("before"), after_sha256: hash("after"), preserved: true } };
const scenarios = () => ({
  agent_disconnect: async () => ({ ...common, automatic_execution_allowed: false }),
  target_failure: async () => ({ ...common, rollback_confirmed: true }),
  version_conflict: async () => ({ ...common, error_count: 0, error_rate: 0, rejection_code: "policy_revision_stale" }),
  stale_metrics: async () => ({ ...common, error_count: 0, error_rate: 0, elimination_reasons: ["metrics_stale"] }),
  network_jitter: async () => ({ ...common, rollback_confirmed: true })
});

test("records measured recovery, errors, and integrity for all five scenarios", async () => {
  const report = await runMeasuredFaultExperiment({ scenarios: scenarios(), suiteId: "ct-526-test", environmentFingerprint: hash("environment"), startedAt: new Date("2026-10-21T08:00:00Z") });
  assert.equal(report.scenario_count, 5);
  assert.equal(report.aggregate.requests_attempted, 50);
  assert.equal(report.aggregate.error_count, 3);
  assert.equal(report.aggregate.data_integrity_preserved, true);
  assert.deepEqual(verifyMeasuredFaultReport(report), { valid: true, suite_id: "ct-526-test", report_fingerprint: report.report_fingerprint });
});

test("rejects invented rates, missing integrity, and unsafe rollback", async () => {
  const wrongRate = scenarios();
  wrongRate.agent_disconnect = async () => ({ ...common, automatic_execution_allowed: false, error_rate: 0 });
  await assert.rejects(() => runMeasuredFaultExperiment({ scenarios: wrongRate, suiteId: "wrong-rate", environmentFingerprint: hash("environment") }), { code: "measured_fault_error_rate_invalid" });
  const missingIntegrity = scenarios();
  missingIntegrity.version_conflict = async () => ({ ...common, error_count: 0, error_rate: 0, rejection_code: "policy_revision_stale", data_integrity: null });
  await assert.rejects(() => runMeasuredFaultExperiment({ scenarios: missingIntegrity, suiteId: "missing-integrity", environmentFingerprint: hash("environment") }), { code: "measured_fault_integrity_invalid" });
  const noRollback = scenarios();
  noRollback.network_jitter = async () => ({ ...common, rollback_confirmed: false });
  await assert.rejects(() => runMeasuredFaultExperiment({ scenarios: noRollback, suiteId: "no-rollback", environmentFingerprint: hash("environment") }), { code: "measured_fault_rollback_unconfirmed" });
});

test("detects report tampering", async () => {
  const report = structuredClone(await runMeasuredFaultExperiment({ scenarios: scenarios(), suiteId: "tamper", environmentFingerprint: hash("environment") }));
  report.results[0].recovery_time_ms = 1;
  assert.throws(() => verifyMeasuredFaultReport(report), { code: "measured_fault_report_tampered" });
});
