import {
  createAgentReceipt,
  createApplyPolicyMessage,
  createPreparePolicyMessage,
  createRegistrationMessage,
  createRevokePolicyMessage,
  verifyAgentReceipt
} from "../../packages/agent-protocol-sdk/index.mjs";

const now = new Date("2026-10-21T09:00:00.000Z");
const agentId = "synthetic-agent-01";
const policyFingerprint = `sha256:${"b".repeat(64)}`;

const registration = createRegistrationMessage({
  agentId,
  agentVersion: "1.0.0",
  hostFingerprint: `sha256:${"a".repeat(64)}`,
  capabilities: ["observe", "tc_redirect", "route_restore"],
  observeOnly: true
}, { now, messageId: "message-register-01", nonce: "register-nonce-example-01" });

const registrationReceipt = createAgentReceipt(registration, {
  status: "accepted",
  state: { mode: "observe_only", registration: "synthetic" },
  now
});

const prepare = createPreparePolicyMessage({
  agentId,
  policyId: "synthetic-policy-01",
  policyRevision: 2,
  policyFingerprint,
  expiresAt: "2026-10-21T09:05:00.000Z",
  targetRoute: "synthetic-route-b",
  previousRoute: "synthetic-route-a"
}, { now, messageId: "message-prepare-01", nonce: "prepare-nonce-example-01" });

const prepareReceipt = createAgentReceipt(prepare, {
  status: "accepted",
  state: { phase: "prepared", policy_revision: 2 },
  activePolicyRevision: 1,
  now
});

const apply = createApplyPolicyMessage({
  agentId,
  policyId: "synthetic-policy-01",
  policyRevision: 2,
  policyFingerprint,
  prepareReceiptId: prepareReceipt.payload.receipt_id
}, { now, messageId: "message-apply-01", nonce: "apply-nonce-example-0001" });

const applyReceipt = createAgentReceipt(apply, {
  status: "applied",
  state: { phase: "active", policy_revision: 2 },
  activePolicyRevision: 2,
  now
});

const revoke = createRevokePolicyMessage({
  agentId,
  policyId: "synthetic-policy-01",
  policyRevision: 2,
  reason: "operator",
  restoreRevision: 1
}, { now, messageId: "message-revoke-01", nonce: "revoke-nonce-example-01" });

const revokeReceipt = createAgentReceipt(revoke, {
  status: "revoked",
  state: { phase: "restored", policy_revision: 1 },
  activePolicyRevision: 1,
  now
});

console.log(JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  messages: [registration.message_type, prepare.message_type, apply.message_type, revoke.message_type],
  receipts: [registrationReceipt, prepareReceipt, applyReceipt, revokeReceipt].map((receipt, index) => ({
    operation: receipt.payload.operation,
    status: receipt.payload.status,
    verified: verifyAgentReceipt(receipt, { request: [registration, prepare, apply, revoke][index], now }).receipt_fingerprint
  }))
}, null, 2));
