import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import * as agentSdk from "../packages/agent-protocol-sdk/index.mjs";

const exec = promisify(execFile);
const now = new Date("2026-10-21T09:00:00.000Z");
const hash = (character) => `sha256:${character.repeat(64)}`;

const envelopeOptions = (name) => ({ now, messageId: `message-${name}`, nonce: `${name}-nonce-value-for-tests` });

function registration() {
  return agentSdk.createRegistrationMessage({
    agentId: "agent-01",
    agentVersion: "1.0.0",
    hostFingerprint: hash("a"),
    artifactFingerprint: hash("b"),
    capabilities: ["route_restore", "observe"],
    observeOnly: true
  }, envelopeOptions("register"));
}

function prepare() {
  return agentSdk.createPreparePolicyMessage({
    agentId: "agent-01",
    policyId: "policy-01",
    policyRevision: 2,
    policyFingerprint: hash("c"),
    expiresAt: "2026-10-21T09:05:00.000Z",
    targetRoute: "route-b",
    previousRoute: "route-a"
  }, envelopeOptions("prepare"));
}

test("constructs registration, prepare, apply, revoke, and correlated receipt types", () => {
  const register = registration();
  assert.deepEqual(register.payload.capabilities, ["observe", "route_restore"]);
  assert.equal(register.payload.observe_only, true);

  const prepared = prepare();
  const prepareReceipt = agentSdk.createAgentReceipt(prepared, { status: "accepted", state: { phase: "prepared" }, activePolicyRevision: 1, now });
  const apply = agentSdk.createApplyPolicyMessage({
    agentId: "agent-01",
    policyId: "policy-01",
    policyRevision: 2,
    policyFingerprint: hash("c"),
    prepareReceiptId: prepareReceipt.payload.receipt_id
  }, envelopeOptions("apply"));
  const applied = agentSdk.createAgentReceipt(apply, { status: "applied", state: { phase: "active" }, activePolicyRevision: 2, now });
  assert.equal(agentSdk.verifyAgentReceipt(applied, { request: apply, now }).receipt.payload.status, "applied");

  const revoke = agentSdk.createRevokePolicyMessage({ agentId: "agent-01", policyId: "policy-01", policyRevision: 2, reason: "operator", restoreRevision: 1 }, envelopeOptions("revoke"));
  const revoked = agentSdk.createAgentReceipt(revoke, { status: "revoked", state: { phase: "restored" }, activePolicyRevision: 1, now });
  assert.equal(agentSdk.verifyAgentReceipt(revoked, { request: revoke, now }).receipt.payload.active_policy_revision, 1);
});

test("generates unique public envelope identities by default", () => {
  const input = { agentId: "agent-01", agentVersion: "1.0.0", hostFingerprint: hash("a"), capabilities: ["observe"], observeOnly: true };
  const first = agentSdk.createRegistrationMessage(input, { now });
  const second = agentSdk.createRegistrationMessage(input, { now });
  assert.notEqual(first.message_id, second.message_id);
  assert.notEqual(first.nonce, second.nonce);
});

test("rejects unknown or secret-like caller fields instead of silently dropping them", () => {
  assert.throws(() => agentSdk.createRegistrationMessage({
    agentId: "agent-01",
    agentVersion: "1.0.0",
    hostFingerprint: hash("a"),
    capabilities: ["observe"],
    observeOnly: true,
    privateKey: "must-not-enter-a-message"
  }, { now }), { code: "registration_input_field_unknown" });
});

test("enforces policy lease, revision, reason, capability, and receipt status semantics", () => {
  assert.throws(() => agentSdk.createPreparePolicyMessage({
    agentId: "agent-01", policyId: "policy-01", policyRevision: 2, policyFingerprint: hash("c"),
    expiresAt: now.toISOString(), targetRoute: "route-b", previousRoute: "route-a"
  }, { now }), { code: "prepare_expired" });
  assert.throws(() => agentSdk.createRegistrationMessage({ agentId: "agent-01", agentVersion: "1.0.0", hostFingerprint: hash("a"), capabilities: ["observe", "observe"], observeOnly: true }, { now }), { code: "capability_duplicate" });
  assert.throws(() => agentSdk.createRevokePolicyMessage({ agentId: "agent-01", policyId: "policy-01", policyRevision: 2, reason: "arbitrary", restoreRevision: 1 }, { now }), { code: "revoke_reason_invalid" });
  assert.throws(() => agentSdk.createAgentReceipt(prepare(), { status: "applied", state: {}, now }), { code: "receipt_status_invalid" });
  assert.throws(() => agentSdk.createAgentReceipt(prepare(), { status: "rejected", state: {}, now }), { code: "receipt_failure_code_invalid" });
});

test("detects receipt correlation, Agent, and operation mismatches", () => {
  const request = prepare();
  const receipt = agentSdk.createAgentReceipt(request, { status: "accepted", state: { phase: "prepared" }, now });
  assert.throws(() => agentSdk.verifyAgentReceipt({ ...receipt, correlation_id: "message-other" }, { request, now }), { code: "receipt_correlation_mismatch" });
  assert.throws(() => agentSdk.verifyAgentReceipt({ ...receipt, agent_id: "agent-other" }, { request, now }), { code: "receipt_agent_mismatch" });
  assert.throws(() => agentSdk.verifyAgentReceipt({ ...receipt, payload: { ...receipt.payload, operation: "register" } }, { request, now }), { code: "receipt_operation_mismatch" });
  assert.throws(() => agentSdk.createAgentReceipt({ ...request, credential: "forbidden" }, { status: "accepted", state: {}, now }), { code: "request_message_field_unknown" });
  assert.throws(() => agentSdk.verifyAgentReceipt({ ...receipt, payload: { ...receipt.payload, access_token: "forbidden" } }, { request, now }), { code: "receipt_message_payload_field_unknown" });
});

test("ships declarations for every public message builder without transport or key APIs", async () => {
  const declarations = await readFile(new URL("../packages/agent-protocol-sdk/index.d.ts", import.meta.url), "utf8");
  for (const symbol of ["RegistrationPayload", "PreparePolicyPayload", "ApplyPolicyPayload", "RevokePolicyPayload", "ReceiptPayload", "AgentReceipt"]) assert.match(declarations, new RegExp(`(?:interface|type) ${symbol}`));
  const exports = Object.keys(agentSdk).sort();
  assert.deepEqual(exports, ["AGENT_PROTOCOL_VERSION", "createAgentReceipt", "createApplyPolicyMessage", "createPreparePolicyMessage", "createRegistrationMessage", "createRevokePolicyMessage", "verifyAgentReceipt"]);
  const implementation = await readFile(new URL("../packages/agent-protocol-sdk/index.mjs", import.meta.url), "utf8");
  for (const forbidden of ["AgentCredentialAuthority", "fetch(", "https://", "privateKey", "CLOUDFLARE_API_TOKEN"]) assert.equal(implementation.includes(forbidden), false, `public SDK contains forbidden implementation surface: ${forbidden}`);
});

test("runs the synthetic lifecycle example without exposing execution authority", async () => {
  const { stdout } = await exec(process.execPath, ["examples/agent/protocol-sdk.mjs"], { cwd: new URL("..", import.meta.url) });
  const output = JSON.parse(stdout);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.performance_claim_allowed, false);
  assert.deepEqual(output.messages, ["register", "prepare_policy", "apply_policy", "revoke_policy"]);
  assert.deepEqual(output.receipts.map(({ status }) => status), ["accepted", "accepted", "applied", "revoked"]);
});
