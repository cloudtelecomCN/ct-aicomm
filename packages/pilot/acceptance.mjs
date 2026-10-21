import { fingerprint } from "../agent-control/protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validatePilotAcceptance(input) {
  if (input?.schema_version !== "1.0.0") fail("pilot_schema_invalid", "enterprise pilot acceptance v1 is required");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(input.pilot_id ?? "")) fail("pilot_id_invalid", "pilot_id is invalid");
  const start = Date.parse(input.scenario?.start_at);
  const end = Date.parse(input.scenario?.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail("pilot_window_invalid", "pilot end must follow start");
  if (!/^sha256:[a-f0-9]{64}$/.test(input.environment_fingerprint ?? "")) fail("pilot_environment_invalid", "a frozen environment fingerprint is required");
  if (!Array.isArray(input.responsibilities) || input.responsibilities.length === 0 || input.responsibilities.some((item) => !item.accountable || !item.responsible?.length)) fail("pilot_responsibility_invalid", "each deliverable requires accountable and responsible owners");
  const metrics = input.acceptance_metrics ?? [];
  if (!metrics.length || new Set(metrics.map(({ id }) => id)).size !== metrics.length) fail("pilot_metrics_invalid", "acceptance metric ids must be present and unique");
  if (metrics.some(({ minimum_samples: count, evidence_required: evidence }) => !Number.isSafeInteger(count) || count < 1 || !evidence?.length)) fail("pilot_metric_evidence_invalid", "every metric requires a sample floor and evidence");
  const execution = input.execution_boundary ?? {};
  if (execution.initial_mode !== "observe_only" || execution.human_approval_required !== true || execution.rollback_required !== true || execution.change_window_required !== true) fail("pilot_execution_boundary_invalid", "observe-only start, human approval, rollback, and a change window are mandatory");
  const data = input.data_boundary ?? {};
  if (!data.allowed?.length || !data.prohibited?.length || data.encryption_in_transit !== true || data.encryption_at_rest !== true || data.export_approval_required !== true || data.deletion_verification_required !== true) fail("pilot_data_boundary_invalid", "data allow/prohibit, encryption, export approval, and deletion verification are mandatory");
  const exit = input.exit_plan ?? {};
  if (!exit.triggers?.length || exit.restore_baseline !== true || exit.uninstall_agent !== true || exit.export_evidence !== true || exit.delete_restricted_data !== true || exit.close_access !== true || !exit.owner) fail("pilot_exit_plan_invalid", "the exit plan must restore, export, delete, close access, and name an owner");
  const decision = input.decision ?? {};
  if (input.status === "accepted" && (input.data_origin !== "measured" || decision.state !== "accepted" || !decision.customer_approver || !decision.provider_approver || !decision.independent_review || !decision.evidence_sha256?.length)) fail("pilot_acceptance_unproven", "accepted status requires measured evidence, both approvers, independent review, and evidence digests");
  if (input.data_origin === "synthetic" && decision.state !== "pending") fail("pilot_synthetic_decision_invalid", "synthetic packages must remain pending");
  const normalized = structuredClone(input);
  return Object.freeze({ package: Object.freeze(normalized), package_fingerprint: fingerprint(normalized), performance_claim_allowed: input.status === "accepted" && input.data_origin === "measured" && decision.state === "accepted" });
}
