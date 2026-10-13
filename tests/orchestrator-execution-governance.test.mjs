import assert from "node:assert/strict";
import test from "node:test";
import { approveExecution, assessExecutionBoundary, authorizeExecution } from "../packages/orchestrator/execution-governance.mjs";

const decision = {
  decision_id: "decision-01",
  explanation_fingerprint: `sha256:${"a".repeat(64)}`,
  selected_candidate_id: "candidate-a",
  candidates: [{ candidate_id: "candidate-a", final_score: 0.12 }]
};
const change = { scenario_id: "single-host-reroute", requested_by: "operator-a", target_candidate_id: "candidate-a", risk_level: "low", affected_services: 1, cross_domain: false, rollback_ready: true };
const allowlist = [{ scenario_id: "single-host-reroute", maximum_score: 0.2, allow_cross_domain: false }];

test("allows automation only for an explicitly allowlisted low-risk boundary", () => {
  const automatic = assessExecutionBoundary({ decision, change, automaticAllowlist: allowlist });
  assert.equal(automatic.mode, "automatic_allowed");
  assert.equal(authorizeExecution(automatic, { now: new Date("2026-10-13T15:00:00Z") }).mode, "automatic");
  for (const unsafe of [
    { ...change, scenario_id: "unknown" },
    { ...change, risk_level: "medium" },
    { ...change, rollback_ready: false },
    { ...change, affected_services: 2 },
    { ...change, cross_domain: true }
  ]) {
    assert.equal(assessExecutionBoundary({ decision, change: unsafe, automaticAllowlist: allowlist }).mode, "manual_approval_required");
  }
});

test("manual approval enforces separation, binding, integrity, and expiry", () => {
  const assessment = assessExecutionBoundary({ decision, change: { ...change, risk_level: "high" }, automaticAllowlist: allowlist });
  const now = new Date("2026-10-13T15:00:00Z");
  assert.throws(() => approveExecution(assessment, { approver: "operator-a", justification: "reviewed emergency change", now }), (error) => error.code === "approval_separation_required");
  const approval = approveExecution(assessment, { approver: "operator-b", justification: "reviewed emergency change", now, ttlSeconds: 60 });
  assert.equal(authorizeExecution(assessment, { approval, now }).approver, "operator-b");
  assert.throws(() => authorizeExecution({ ...assessment, assessment_fingerprint: `sha256:${"b".repeat(64)}` }, { approval, now }), (error) => error.code === "approval_assessment_mismatch");
  assert.throws(() => authorizeExecution(assessment, { approval, now: new Date("2026-10-13T15:01:01Z") }), (error) => error.code === "approval_expired");
  assert.throws(() => authorizeExecution(assessment, { approval: { ...approval, approver: "attacker" }, now }), (error) => error.code === "approval_tampered");
});
