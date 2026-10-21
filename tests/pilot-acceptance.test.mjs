import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePilotAcceptance } from "../packages/pilot/acceptance.mjs";

const template = JSON.parse(await readFile(new URL("../examples/pilot/synthetic-enterprise-pilot.json", import.meta.url), "utf8"));

test("validates the complete synthetic pilot without enabling a claim", () => {
  const result = validatePilotAcceptance(template);
  assert.match(result.package_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.performance_claim_allowed, false);
  assert.equal(result.package.decision.state, "pending");
});

test("rejects incomplete responsibility, metric, execution, data, and exit boundaries", () => {
  const cases = [
    ["pilot_responsibility_invalid", (value) => { value.responsibilities[0].accountable = ""; }],
    ["pilot_metrics_invalid", (value) => { value.acceptance_metrics.push(structuredClone(value.acceptance_metrics[0])); }],
    ["pilot_execution_boundary_invalid", (value) => { value.execution_boundary.human_approval_required = false; }],
    ["pilot_data_boundary_invalid", (value) => { value.data_boundary.prohibited = []; }],
    ["pilot_exit_plan_invalid", (value) => { value.exit_plan.restore_baseline = false; }]
  ];
  for (const [code, mutate] of cases) {
    const value = structuredClone(template);
    mutate(value);
    assert.throws(() => validatePilotAcceptance(value), (error) => error.code === code);
  }
});

test("acceptance requires measured evidence, two approvers, independent review, and digests", () => {
  const incomplete = structuredClone(template);
  incomplete.status = "accepted";
  assert.throws(() => validatePilotAcceptance(incomplete), (error) => error.code === "pilot_acceptance_unproven");

  const accepted = structuredClone(template);
  accepted.status = "accepted";
  accepted.data_origin = "measured";
  accepted.decision = { state: "accepted", customer_approver: "customer-owner", provider_approver: "ct-owner", independent_review: "review:external-001", evidence_sha256: ["b".repeat(64)] };
  assert.equal(validatePilotAcceptance(accepted).performance_claim_allowed, true);
});

test("synthetic packages cannot carry an acceptance decision", () => {
  const value = structuredClone(template);
  value.decision.state = "accepted";
  assert.throws(() => validatePilotAcceptance(value), (error) => error.code === "pilot_synthetic_decision_invalid");
});
