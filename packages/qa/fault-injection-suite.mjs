import { fingerprint } from "../agent-control/protocol.mjs";

const REQUIRED_SCENARIOS = Object.freeze([
  "agent_disconnect",
  "target_failure",
  "version_conflict",
  "stale_metrics",
  "network_jitter"
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertSafe(name, result) {
  if (result?.evidence_origin !== "simulated") fail("fault_evidence_origin_invalid", `${name} must be marked simulated`);
  if (result.no_unapproved_execution !== true) fail("fault_unapproved_execution", `${name} allowed unapproved execution`);
  if (result.contained !== true) fail("fault_not_contained", `${name} was not contained`);
  if (name === "agent_disconnect" && result.automatic_execution_allowed !== false) fail("fault_agent_disconnect_not_closed", "Agent disconnect must fail closed");
  if (["target_failure", "network_jitter"].includes(name) && result.rollback_confirmed !== true) fail("fault_rollback_unconfirmed", `${name} must confirm rollback`);
  if (name === "version_conflict" && result.rejection_code !== "policy_revision_stale") fail("fault_version_conflict_not_rejected", "version conflict must reject a stale revision");
  if (name === "stale_metrics" && !result.elimination_reasons?.includes("metrics_stale")) fail("fault_stale_metrics_not_eliminated", "stale metrics must eliminate the candidate");
}

export async function runFaultInjectionSuite({ scenarios, suiteId, environmentFingerprint, startedAt = new Date() }) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(suiteId ?? "")) fail("fault_suite_id_invalid", "suiteId is invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(environmentFingerprint ?? "")) fail("fault_environment_fingerprint_invalid", "environment fingerprint is invalid");
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime())) fail("fault_started_at_invalid", "startedAt must be a valid Date");
  if (!scenarios || typeof scenarios !== "object") fail("fault_scenarios_invalid", "scenario handlers are required");
  const extras = Object.keys(scenarios).filter((name) => !REQUIRED_SCENARIOS.includes(name));
  if (extras.length) fail("fault_scenario_unknown", `unknown scenarios: ${extras.join(",")}`);

  const results = [];
  for (const name of REQUIRED_SCENARIOS) {
    if (typeof scenarios[name] !== "function") fail("fault_scenario_missing", `missing scenario: ${name}`);
    const result = await scenarios[name]();
    assertSafe(name, result);
    results.push(Object.freeze({ name, status: "passed", evidence: Object.freeze(structuredClone(result)) }));
  }

  const body = {
    schema_version: "1.0.0",
    suite_id: suiteId,
    evidence_origin: "simulated",
    environment_fingerprint: environmentFingerprint,
    started_at: startedAt.toISOString(),
    gate: "fail_static",
    passed: true,
    scenario_count: results.length,
    results: Object.freeze(results)
  };
  return Object.freeze({ ...body, report_fingerprint: fingerprint(body) });
}

export function verifyFaultInjectionReport(report) {
  if (report?.schema_version !== "1.0.0" || report.evidence_origin !== "simulated") fail("fault_report_invalid", "simulated fault report v1 is required");
  if (report.passed !== true || report.scenario_count !== REQUIRED_SCENARIOS.length) fail("fault_report_incomplete", "all required fault scenarios must pass");
  if (report.results?.map(({ name }) => name).join("|") !== REQUIRED_SCENARIOS.join("|")) fail("fault_report_scenarios_invalid", "fault scenarios are missing or out of order");
  const { report_fingerprint: claimed, ...body } = report;
  if (fingerprint(body) !== claimed) fail("fault_report_tampered", "fault report fingerprint does not match");
  return Object.freeze({ valid: true, suite_id: report.suite_id, report_fingerprint: claimed });
}

export { REQUIRED_SCENARIOS };
