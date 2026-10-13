import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { buildTraceBundle, verifyTraceBundle } from "../packages/observability/trace-bundle.mjs";

const traceId = "trace-001";
const requestId = "request-001";
const request = {
  request_id: requestId,
  trace_id: traceId,
  events: [
    { type: "request_started", request_id: requestId, trace_id: traceId },
    { type: "completed", request_id: requestId, trace_id: traceId }
  ]
};

function signed(body, field) {
  return { ...body, [field]: fingerprint(body) };
}

const decision = signed({ schema_version: "1.0.0", decision_id: "decision-001", generated_at: "2026-10-13T15:00:00.000Z", selected_candidate_id: "instance-east", selection_basis: ["lowest_deterministic_score"], hard_constraint_failures: [], constraints: [], candidates: [], evidence_references: [`trace://${traceId}`] }, "explanation_fingerprint");
const auditBody = { schema_version: "1.0.0", sequence: 2, event_id: "event-002", recorded_at: "2026-10-13T15:00:01.000Z", previous_hash: `sha256:${"a".repeat(64)}`, agent: { agent_id: "agent-01" }, environment_fingerprint: `sha256:${"b".repeat(64)}`, policy: { policy_id: "policy-east", policy_revision: 2, policy_fingerprint: `sha256:${"c".repeat(64)}` }, receipt: { receipt_id: "receipt-002", status: "applied" } };
const execution = { trace_id: traceId, request_id: requestId, decision_id: decision.decision_id, decision_fingerprint: decision.explanation_fingerprint, audit_record: signed(auditBody, "record_hash") };
const rollbackEvent = signed({ event_type: "policy_rolled_back", occurred_at: "2026-10-13T15:00:02.000Z", reason: "health threshold exceeded", from_revision: 2, to_revision: 1 }, "rollback_fingerprint");
const rollback = { trace_id: traceId, request_id: requestId, source_execution_record_hash: execution.audit_record.record_hash, event: rollbackEvent };

function bench() {
  const sample = { schema_version: "1.0.0", sample_id: "ttft-001", request_id: requestId, trace_id: traceId, data_origin: "measured", outcome: { success: true }, evidence: {} };
  sample.evidence.raw_record_sha256 = createHash("sha256").update(JSON.stringify(sample)).digest("hex");
  return sample;
}

test("links request, decision, execution, rollback, and measured Bench evidence", () => {
  const bundle = buildTraceBundle({ request, decision, execution, rollback, benchSample: bench(), createdAt: new Date("2026-10-13T15:00:03Z") });
  assert.equal(bundle.stages.execution.policy_revision, 2);
  assert.equal(bundle.stages.rollback.occurred, true);
  assert.equal(bundle.stages.bench.sample_id, "ttft-001");
  assert.deepEqual(verifyTraceBundle(bundle), { valid: true, trace_id: traceId, request_id: requestId, trace_fingerprint: bundle.trace_fingerprint });
  assert.throws(() => { bundle.stages.request.event_count = 99; }, TypeError);
});

test("records an explicit no-rollback state", () => {
  const bundle = buildTraceBundle({ request, decision, execution, benchSample: bench() });
  assert.deepEqual(bundle.stages.rollback, { occurred: false, fingerprint: null, reason: null });
});

test("rejects cross-request joins and tampered stage evidence", () => {
  assert.throws(() => buildTraceBundle({ request, decision, execution: { ...execution, request_id: "request-other" }, benchSample: bench() }), (error) => error.code === "trace_execution_identity_mismatch");
  assert.throws(() => buildTraceBundle({ request, decision, execution, benchSample: { ...bench(), trace_id: "trace-other" } }), (error) => error.code === "trace_bench_identity_mismatch");
  assert.throws(() => buildTraceBundle({ request, decision: { ...decision, selected_candidate_id: "altered" }, execution, benchSample: bench() }), (error) => error.code === "trace_decision_tampered");
  assert.throws(() => buildTraceBundle({ request, decision, execution, rollback: { ...rollback, source_execution_record_hash: `sha256:${"f".repeat(64)}` }, benchSample: bench() }), (error) => error.code === "trace_rollback_execution_mismatch");
  const bundle = structuredClone(buildTraceBundle({ request, decision, execution, benchSample: bench() }));
  bundle.stages.execution.policy_revision = 99;
  assert.throws(() => verifyTraceBundle(bundle), (error) => error.code === "trace_bundle_tampered");
});
