import assert from "node:assert/strict";
import test from "node:test";
import { ControlledRedirector, redirectMapEntry, validateRedirectPolicy } from "../packages/agent-control/controlled-redirect.mjs";

const policy = {
  schema_version: "1.0.0",
  source: { ipv4: "10.10.0.10", port: 8000 },
  allowed_targets: [
    { id: "inference-a", endpoint: { ipv4: "10.20.0.11", port: 8000 } },
    { id: "inference-b", endpoint: { ipv4: "10.20.0.12", port: 8000 } }
  ]
};

test("switches only between allowlisted targets and records old and new values", () => {
  const redirector = new ControlledRedirector(policy, { activeTargetId: "inference-a", revision: 7 });
  const result = redirector.switchTo("inference-b", { revision: 8, policyId: "policy-route-east", occurredAt: new Date("2026-10-13T08:00:00Z") });
  assert.deepEqual(result.map_entry, {
    key: { ipv4: "10.10.0.10", port: 8000 },
    value: { ipv4: "10.20.0.12", port: 8000, revision: 8 },
    target_id: "inference-b"
  });
  assert.equal(result.audit_record.old_target.id, "inference-a");
  assert.equal(result.audit_record.new_target.id, "inference-b");
  assert.match(result.audit_record.audit_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(redirector.snapshot(), { active_target_id: "inference-b", revision: 8, audit_records: [result.audit_record] });
});

test("rejects unknown targets, stale revisions, and duplicate endpoints", () => {
  const redirector = new ControlledRedirector(policy, { activeTargetId: "inference-a", revision: 7 });
  assert.throws(() => redirector.switchTo("inference-c", { revision: 8, policyId: "policy-route-east" }), (error) => error.code === "target_not_allowlisted");
  assert.throws(() => redirector.switchTo("inference-b", { revision: 7, policyId: "policy-route-east" }), (error) => error.code === "revision_not_monotonic");
  assert.throws(() => validateRedirectPolicy({ ...policy, allowed_targets: [policy.allowed_targets[0], { id: "duplicate", endpoint: policy.allowed_targets[0].endpoint }] }), (error) => error.code === "target_endpoint_duplicate");
  assert.throws(() => redirectMapEntry(policy, "inference-b", 0), (error) => error.code === "revision_invalid");
});
