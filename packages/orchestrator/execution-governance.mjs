import { randomUUID } from "node:crypto";
import { fingerprint } from "../agent-control/protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validId(value, field) {
  if (!/^[A-Za-z0-9._:@-]{1,128}$/.test(value ?? "")) fail(`${field}_invalid`, `${field} is invalid`);
  return value;
}

export function assessExecutionBoundary({ decision, change, automaticAllowlist = [] }) {
  if (!decision?.explanation_fingerprint || !decision.selected_candidate_id) fail("governance_decision_invalid", "a selected, fingerprinted decision is required");
  validId(change?.scenario_id, "scenario_id");
  validId(change?.requested_by, "requested_by");
  if (!Number.isSafeInteger(change.affected_services) || change.affected_services < 1) fail("affected_services_invalid", "affected services must be positive");
  if (!["low", "medium", "high"].includes(change.risk_level)) fail("risk_level_invalid", "risk level is invalid");
  if (change.target_candidate_id !== decision.selected_candidate_id) fail("governance_target_mismatch", "change target does not match the selected candidate");
  const winner = decision.candidates.find(({ candidate_id }) => candidate_id === decision.selected_candidate_id);
  if (!winner || !Number.isFinite(winner.final_score)) fail("governance_score_missing", "selected candidate score is missing");
  const rule = automaticAllowlist.find(({ scenario_id }) => scenario_id === change.scenario_id);
  const reasons = [];
  if (!rule) reasons.push("scenario_not_allowlisted");
  if (change.risk_level !== "low") reasons.push("risk_not_low");
  if (!change.rollback_ready) reasons.push("rollback_not_ready");
  if (change.affected_services !== 1) reasons.push("blast_radius_exceeds_one_service");
  if (change.cross_domain && !rule?.allow_cross_domain) reasons.push("cross_domain_requires_approval");
  if (rule && winner.final_score > rule.maximum_score) reasons.push("score_exceeds_automatic_limit");
  const body = {
    schema_version: "1.0.0",
    decision_id: decision.decision_id,
    explanation_fingerprint: decision.explanation_fingerprint,
    scenario_id: change.scenario_id,
    requested_by: change.requested_by,
    target_candidate_id: change.target_candidate_id,
    risk_level: change.risk_level,
    affected_services: change.affected_services,
    cross_domain: Boolean(change.cross_domain),
    rollback_ready: Boolean(change.rollback_ready),
    mode: reasons.length === 0 ? "automatic_allowed" : "manual_approval_required",
    boundary_reasons: Object.freeze(reasons)
  };
  return Object.freeze({ ...body, assessment_fingerprint: fingerprint(body) });
}

export function approveExecution(assessment, { approver, justification, now = new Date(), ttlSeconds = 900 } = {}) {
  if (assessment?.mode !== "manual_approval_required") fail("approval_not_required", "manual approval is not required");
  validId(approver, "approver");
  if (approver === assessment.requested_by) fail("approval_separation_required", "requester cannot approve their own execution");
  if (typeof justification !== "string" || justification.trim().length < 8) fail("approval_justification_invalid", "approval justification is required");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 3600) fail("approval_ttl_invalid", "approval TTL must be between 30 and 3600 seconds");
  const issuedAt = Math.floor(now.getTime() / 1000);
  if (!Number.isFinite(issuedAt)) fail("approval_time_invalid", "approval time is invalid");
  const body = {
    schema_version: "1.0.0",
    approval_id: `approval-${randomUUID()}`,
    assessment_fingerprint: assessment.assessment_fingerprint,
    approver,
    justification,
    issued_at: new Date(issuedAt * 1000).toISOString(),
    expires_at: new Date((issuedAt + ttlSeconds) * 1000).toISOString()
  };
  return Object.freeze({ ...body, approval_fingerprint: fingerprint(body) });
}

export function authorizeExecution(assessment, { approval = null, now = new Date() } = {}) {
  if (assessment.mode === "automatic_allowed") {
    const body = { mode: "automatic", assessment_fingerprint: assessment.assessment_fingerprint, authorized_at: now.toISOString() };
    return Object.freeze({ ...body, authorization_fingerprint: fingerprint(body) });
  }
  if (!approval) fail("manual_approval_missing", "manual approval is required");
  if (approval.assessment_fingerprint !== assessment.assessment_fingerprint) fail("approval_assessment_mismatch", "approval belongs to another assessment");
  const { approval_fingerprint: approvalFingerprint, ...approvalBody } = approval;
  if (fingerprint(approvalBody) !== approvalFingerprint) fail("approval_tampered", "approval fingerprint does not match");
  if (Date.parse(approval.expires_at) <= now.getTime()) fail("approval_expired", "approval has expired");
  const body = { mode: "manual", assessment_fingerprint: assessment.assessment_fingerprint, approval_id: approval.approval_id, approver: approval.approver, authorized_at: now.toISOString() };
  return Object.freeze({ ...body, authorization_fingerprint: fingerprint(body) });
}
