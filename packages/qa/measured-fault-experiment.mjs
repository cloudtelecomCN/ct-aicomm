import { fingerprint } from "../agent-control/protocol.mjs";

const REQUIRED_SCENARIOS = Object.freeze(["agent_disconnect", "target_failure", "version_conflict", "stale_metrics", "network_jitter"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateResult(name, result) {
  if (result?.evidence_origin !== "measured") fail("measured_fault_origin_invalid", `${name} must contain measured evidence`);
  if (result.contained !== true || result.no_unapproved_execution !== true) fail("measured_fault_containment_failed", `${name} must prove containment and no unapproved execution`);
  if (!Number.isFinite(result.recovery_time_ms) || result.recovery_time_ms < 0) fail("measured_fault_recovery_invalid", `${name} recovery time is invalid`);
  if (!Number.isInteger(result.requests_attempted) || result.requests_attempted < 1 || !Number.isInteger(result.error_count) || result.error_count < 0 || result.error_count > result.requests_attempted) fail("measured_fault_counts_invalid", `${name} request counts are invalid`);
  const expectedRate = result.error_count / result.requests_attempted;
  if (!Number.isFinite(result.error_rate) || Math.abs(result.error_rate - expectedRate) > 1e-12) fail("measured_fault_error_rate_invalid", `${name} error rate does not match counts`);
  if (result.data_integrity?.preserved !== true || !/^sha256:[a-f0-9]{64}$/.test(result.data_integrity.before_sha256 ?? "") || !/^sha256:[a-f0-9]{64}$/.test(result.data_integrity.after_sha256 ?? "")) fail("measured_fault_integrity_invalid", `${name} must include verified before and after state fingerprints`);
  if (name === "agent_disconnect" && result.automatic_execution_allowed !== false) fail("measured_fault_agent_not_closed", "Agent disconnect must fail static");
  if (["target_failure", "network_jitter"].includes(name) && result.rollback_confirmed !== true) fail("measured_fault_rollback_unconfirmed", `${name} must confirm rollback`);
  if (name === "version_conflict" && result.rejection_code !== "policy_revision_stale") fail("measured_fault_version_not_rejected", "version conflict must reject a stale policy revision");
  if (name === "stale_metrics" && !result.elimination_reasons?.includes("metrics_stale")) fail("measured_fault_stale_not_eliminated", "stale metrics must eliminate the candidate");
  return Object.freeze({ name, ...result });
}

export async function runMeasuredFaultExperiment({ scenarios, suiteId, environmentFingerprint, startedAt = new Date() }) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(suiteId ?? "")) fail("measured_fault_suite_id_invalid", "suiteId is invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(environmentFingerprint ?? "")) fail("measured_fault_environment_invalid", "environment fingerprint is invalid");
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime())) fail("measured_fault_started_at_invalid", "startedAt must be valid");
  const extras = Object.keys(scenarios ?? {}).filter((name) => !REQUIRED_SCENARIOS.includes(name));
  if (extras.length) fail("measured_fault_scenario_unknown", `unknown scenarios: ${extras.join(",")}`);

  const results = [];
  for (const name of REQUIRED_SCENARIOS) {
    if (typeof scenarios?.[name] !== "function") fail("measured_fault_scenario_missing", `missing scenario: ${name}`);
    results.push(validateResult(name, await scenarios[name]()));
  }
  const totalRequests = results.reduce((sum, result) => sum + result.requests_attempted, 0);
  const totalErrors = results.reduce((sum, result) => sum + result.error_count, 0);
  const body = {
    schema_version: "1.0.0",
    suite_id: suiteId,
    evidence_origin: "measured",
    environment_fingerprint: environmentFingerprint,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    scenario_count: results.length,
    passed: true,
    aggregate: {
      requests_attempted: totalRequests,
      error_count: totalErrors,
      error_rate: totalErrors / totalRequests,
      maximum_recovery_time_ms: Math.max(...results.map(({ recovery_time_ms }) => recovery_time_ms)),
      data_integrity_preserved: results.every(({ data_integrity }) => data_integrity.preserved)
    },
    results
  };
  return Object.freeze({ ...body, report_fingerprint: fingerprint(body) });
}

export function verifyMeasuredFaultReport(report) {
  if (report?.schema_version !== "1.0.0" || report.evidence_origin !== "measured" || report.passed !== true) fail("measured_fault_report_invalid", "a passing measured report is required");
  if (report.results?.map(({ name }) => name).join("|") !== REQUIRED_SCENARIOS.join("|")) fail("measured_fault_report_scenarios_invalid", "required scenarios are missing or out of order");
  for (const { name, ...result } of report.results) validateResult(name, result);
  const { report_fingerprint: claimed, ...body } = report;
  if (fingerprint(body) !== claimed) fail("measured_fault_report_tampered", "report fingerprint does not match");
  return Object.freeze({ valid: true, suite_id: report.suite_id, report_fingerprint: claimed });
}

export { REQUIRED_SCENARIOS as MEASURED_FAULT_SCENARIOS };
