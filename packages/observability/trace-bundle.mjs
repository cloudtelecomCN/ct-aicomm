import { createHash } from "node:crypto";
import { fingerprint } from "../agent-control/protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireId(value, field) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value ?? "")) fail(`trace_${field}_invalid`, `${field} is invalid`);
  return value;
}

function requireHash(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value ?? "")) fail(`trace_${field}_invalid`, `${field} must be a SHA-256 fingerprint`);
  return value;
}

function validateRequest(request) {
  requireId(request?.request_id, "request_id");
  requireId(request?.trace_id, "trace_id");
  if (!Array.isArray(request.events) || request.events.length < 2) fail("trace_request_incomplete", "a correlated terminal request is required");
  if (!request.events.every((event) => event.request_id === request.request_id && event.trace_id === request.trace_id)) fail("trace_request_identity_mismatch", "request events changed identity");
  if (!new Set(["completed", "failed"]).has(request.events.at(-1)?.type)) fail("trace_request_not_terminal", "request must be terminal");
}

function validateDecision(decision, request) {
  requireId(decision?.decision_id, "decision_id");
  requireHash(decision?.explanation_fingerprint, "decision_fingerprint");
  const { explanation_fingerprint: claimed, ...body } = decision;
  if (fingerprint(body) !== claimed) fail("trace_decision_tampered", "decision fingerprint does not match");
  if (!decision.evidence_references?.includes(`trace://${request.trace_id}`) && !decision.evidence_references?.includes(`request://${request.request_id}`)) {
    fail("trace_decision_request_unbound", "decision must reference this request or trace");
  }
}

function validateExecution(execution, request, decision) {
  if (execution?.trace_id !== request.trace_id || execution?.request_id !== request.request_id) fail("trace_execution_identity_mismatch", "execution is bound to a different request");
  if (execution.decision_id !== decision.decision_id || execution.decision_fingerprint !== decision.explanation_fingerprint) fail("trace_execution_decision_mismatch", "execution is bound to a different decision");
  requireHash(execution.decision_fingerprint, "execution_decision_fingerprint");
  requireHash(execution.audit_record?.record_hash, "audit_record_hash");
  const { record_hash: recordHash, ...auditBody } = execution.audit_record;
  if (fingerprint(auditBody) !== recordHash) fail("trace_audit_record_tampered", "execution audit record fingerprint does not match");
  if (execution.audit_record.receipt?.status !== "applied") fail("trace_execution_not_applied", "execution requires an applied Agent receipt");
}

function validateRollback(rollback, execution) {
  if (rollback === null) return;
  if (rollback.trace_id !== execution.trace_id || rollback.request_id !== execution.request_id) fail("trace_rollback_identity_mismatch", "rollback is bound to a different request");
  if (rollback.source_execution_record_hash !== execution.audit_record.record_hash) fail("trace_rollback_execution_mismatch", "rollback is bound to a different execution record");
  requireHash(rollback.event?.rollback_fingerprint, "rollback_fingerprint");
  const { rollback_fingerprint: claimed, ...body } = rollback.event;
  if (fingerprint(body) !== claimed) fail("trace_rollback_tampered", "rollback fingerprint does not match");
}

function validateBench(benchSample, request) {
  if (benchSample?.request_id !== request.request_id || benchSample?.trace_id !== request.trace_id) fail("trace_bench_identity_mismatch", "Bench sample is bound to a different request");
  if (benchSample.data_origin !== "measured") fail("trace_bench_origin_invalid", "end-to-end Trace accepts measured Bench samples only");
  if (!/^[a-f0-9]{64}$/.test(benchSample.evidence?.raw_record_sha256 ?? "")) fail("trace_bench_hash_invalid", "Bench raw record hash is invalid");
  const clone = structuredClone(benchSample);
  const claimed = clone.evidence.raw_record_sha256;
  delete clone.evidence.raw_record_sha256;
  const calculated = createHash("sha256").update(JSON.stringify(clone)).digest("hex");
  if (calculated !== claimed) fail("trace_bench_tampered", "Bench sample hash does not match");
}

export function buildTraceBundle({ request, decision, execution, rollback = null, benchSample, createdAt = new Date() }) {
  validateRequest(request);
  validateDecision(decision, request);
  validateExecution(execution, request, decision);
  validateRollback(rollback, execution);
  validateBench(benchSample, request);
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : NaN;
  if (!Number.isFinite(timestamp)) fail("trace_created_at_invalid", "createdAt must be a valid Date");

  const body = {
    schema_version: "1.0.0",
    trace_id: request.trace_id,
    request_id: request.request_id,
    created_at: createdAt.toISOString(),
    stages: {
      request: { terminal_type: request.events.at(-1).type, event_count: request.events.length },
      decision: { decision_id: decision.decision_id, selected_candidate_id: decision.selected_candidate_id, fingerprint: decision.explanation_fingerprint },
      execution: { audit_record_hash: execution.audit_record.record_hash, receipt_id: execution.audit_record.receipt.receipt_id, policy_revision: execution.audit_record.policy.policy_revision },
      rollback: rollback ? { occurred: true, fingerprint: rollback.event.rollback_fingerprint, reason: rollback.event.reason } : { occurred: false, fingerprint: null, reason: null },
      bench: { sample_id: benchSample.sample_id, outcome: benchSample.outcome.success ? "success" : "failed", raw_record_sha256: benchSample.evidence.raw_record_sha256 }
    }
  };
  return deepFreeze({ ...body, trace_fingerprint: fingerprint(body) });
}

export function verifyTraceBundle(bundle) {
  if (bundle?.schema_version !== "1.0.0") fail("trace_schema_invalid", "Trace Bundle v1 is required");
  requireId(bundle.trace_id, "trace_id");
  requireId(bundle.request_id, "request_id");
  requireHash(bundle.trace_fingerprint, "fingerprint");
  const { trace_fingerprint: claimed, ...body } = bundle;
  if (fingerprint(body) !== claimed) fail("trace_bundle_tampered", "Trace Bundle fingerprint does not match");
  return Object.freeze({ valid: true, trace_id: bundle.trace_id, request_id: bundle.request_id, trace_fingerprint: claimed });
}
