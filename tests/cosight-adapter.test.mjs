import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adaptCoSightToolCall, verifyCoSightEvidenceFingerprint } from "../adapters/cosight/index.mjs";

const evidenceSchema = JSON.parse(await readFile(new URL("../schemas/agent/agent-call-evidence-v1.schema.json", import.meta.url), "utf8"));

const fingerprint = `sha256:${"a".repeat(64)}`;
const toolCall = {
  tool_name: "list_protocols",
  tool_args: { category: "rdma", token: "must-not-appear" },
  tool_result: { count: 1, items: [{ slug: "synthetic-rdma" }] },
  timestamp: "2026-11-25T10:00:01.000Z",
};
const capture = {
  evidence_id: "evidence-cosight-001",
  call_id: "call-cosight-001",
  protocol_version: "2025-11-25",
  transport: "stdio",
  started_at: "2026-11-25T10:00:00.900Z",
  completed_at: "2026-11-25T10:00:01.000Z",
  duration_ms: 100,
  status: "succeeded",
  data_origin: "synthetic",
  source_kind: "application_log",
  runtime: { name: "cosight", version: "0.1.0", artifact_fingerprint: fingerprint },
  recorder: { name: "ct-aicomm-cosight-adapter", version: "0.1.0", artifact_fingerprint: fingerprint },
};

test("maps an MCP event into a fingerprinted CT-AIComm evidence envelope", () => {
  const evidence = adaptCoSightToolCall({ toolCall, capture });
  assert.equal(evidence.protocol.name, "mcp");
  assert.equal(evidence.call.target.name, "list_protocols");
  assert.equal(evidence.identity.identity_assurance, "not_observed");
  assert.equal(evidence.identity.authorization_assurance, "not_observed");
  assert.equal(evidence.boundary.raw_payload_retained, false);
  assert.equal(evidence.boundary.ct_aicomm_executed_call, false);
  assert.equal(verifyCoSightEvidenceFingerprint(evidence), true);
  assert.doesNotMatch(JSON.stringify(evidence), /must-not-appear|synthetic-rdma/u);
});

test("emits every required schema field and no unknown object fields", () => {
  const evidence = adaptCoSightToolCall({ toolCall, capture });
  function checkObjectShape(value, schema) {
    if (!schema.properties || !value || typeof value !== "object" || Array.isArray(value)) return;
    const keys = Object.keys(value);
    assert.deepEqual([...keys].sort(), Object.keys(schema.properties).sort());
    for (const key of keys) checkObjectShape(value[key], schema.properties[key]);
  }
  assert.deepEqual([...Object.keys(evidence)].sort(), [...evidenceSchema.required].sort());
  checkObjectShape(evidence, evidenceSchema);
  assert.equal(evidence.record_type, "agent_call_evidence");
  assert.equal(evidence.schema_version, "1.0.0");
});

test("canonical fingerprints are independent of object key order", () => {
  const reordered = { ...toolCall, tool_args: { token: "must-not-appear", category: "rdma" } };
  assert.equal(adaptCoSightToolCall({ toolCall, capture }).outcome.request_fingerprint,
    adaptCoSightToolCall({ toolCall: reordered, capture }).outcome.request_fingerprint);
});

test("maps only explicitly supplied verified-context claims and correlation", () => {
  const evidence = adaptCoSightToolCall({
    toolCall,
    capture: { ...capture, trace_id: "a".repeat(32), span_id: "b".repeat(16), parent_call_id: "call-parent" },
    identity: {
      actor_ref: "agent:cosight:worker-7",
      represented_principal_ref: "org:example",
      identity_assurance: "external_assertion",
      authorization_assurance: "external_assertion",
      authorization_scopes: ["protocols:read"],
      credential_fingerprint: fingerprint,
    },
  });
  assert.equal(evidence.identity.actor_ref, "agent:cosight:worker-7");
  assert.equal(evidence.correlation.trace_id, "a".repeat(32));
  assert.equal(evidence.boundary.identity_authentication_performed, false);
});

test("rejects missing timestamps, protocol metadata, or non-explicit data origin", () => {
  assert.throws(() => adaptCoSightToolCall({ toolCall, capture: { ...capture, started_at: undefined } }), /started_at/u);
  assert.throws(() => adaptCoSightToolCall({ toolCall, capture: { ...capture, protocol_version: undefined } }), /protocol_version/u);
  assert.throws(() => adaptCoSightToolCall({ toolCall, capture: { ...capture, data_origin: undefined } }), /data_origin/u);
});

test("rejects partial trace correlation pairs", () => {
  assert.throws(() => adaptCoSightToolCall({ toolCall, capture: { ...capture, trace_id: "a".repeat(32) } }), /supplied together/u);
});

test("rejects incomplete success and invalid identity assertion data", () => {
  assert.throws(() => adaptCoSightToolCall({ toolCall: { ...toolCall, tool_result: undefined }, capture }), /successful calls require/u);
  assert.throws(() => adaptCoSightToolCall({
    toolCall,
    capture,
    identity: { identity_assurance: "external_assertion", credential_fingerprint: null },
  }), /credential fingerprint/u);
});

test("rejects secrets and non-JSON/cyclic payload structures instead of retaining them", () => {
  assert.throws(() => adaptCoSightToolCall({ toolCall: { ...toolCall, tool_args: { hidden: undefined } }, capture }), /undefined/u);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => adaptCoSightToolCall({ toolCall: { ...toolCall, tool_args: cyclic }, capture }), /cycles/u);
});

test("detects post-mapping evidence modification", () => {
  const evidence = adaptCoSightToolCall({ toolCall, capture });
  assert.equal(verifyCoSightEvidenceFingerprint({ ...evidence, outcome: { ...evidence.outcome, status: "failed" } }), false);
});

