export type AgentProtocolVersion = "1.0.0";
export type Sha256Fingerprint = `sha256:${string}`;
export type AgentCapability = "observe" | "tc_classify" | "tc_redirect" | "cgroup_connect" | "route_restore";
export type RevokeReason = "operator" | "health_threshold" | "lease_expired" | "kill_switch" | "superseded";
export type AgentOperation = "register" | "heartbeat" | "prepare_policy" | "apply_policy" | "revoke_policy";
export type ReceiptStatus = "accepted" | "rejected" | "applied" | "revoked" | "failed";

export interface MessageOptions {
  messageId?: string;
  nonce?: string;
  now?: Date | string | number;
}

export interface AgentMessage<TType extends AgentOperation, TPayload> {
  protocol_version: AgentProtocolVersion;
  message_id: string;
  message_type: TType;
  agent_id: string;
  sent_at: string;
  nonce: string;
  payload: TPayload;
}

export interface RegistrationPayload {
  agent_version: string;
  host_fingerprint: Sha256Fingerprint;
  artifact_fingerprint?: Sha256Fingerprint;
  capabilities: AgentCapability[];
  observe_only: boolean;
}

export interface PreparePolicyPayload {
  policy_id: string;
  policy_revision: number;
  policy_fingerprint: Sha256Fingerprint;
  expires_at: string;
  target_route: string;
  previous_route: string;
}

export interface ApplyPolicyPayload {
  policy_id: string;
  policy_revision: number;
  policy_fingerprint: Sha256Fingerprint;
  prepare_receipt_id: string;
}

export interface RevokePolicyPayload {
  policy_id: string;
  policy_revision: number;
  reason: RevokeReason;
  restore_revision: number | null;
}

export interface ReceiptPayload {
  receipt_id: string;
  status: ReceiptStatus;
  operation: AgentOperation;
  agent_time: string;
  state_fingerprint: Sha256Fingerprint;
  failure_code?: string;
  active_policy_revision: number | null;
}

export interface AgentReceipt {
  protocol_version: AgentProtocolVersion;
  message_id: string;
  message_type: "receipt";
  agent_id: string;
  sent_at: string;
  nonce: string;
  correlation_id: string;
  payload: ReceiptPayload;
}

export const AGENT_PROTOCOL_VERSION: AgentProtocolVersion;
export function createRegistrationMessage(input: { agentId: string; agentVersion: string; hostFingerprint: Sha256Fingerprint; artifactFingerprint?: Sha256Fingerprint; capabilities: AgentCapability[]; observeOnly: boolean }, options?: MessageOptions): AgentMessage<"register", RegistrationPayload>;
export function createPreparePolicyMessage(input: { agentId: string; policyId: string; policyRevision: number; policyFingerprint: Sha256Fingerprint; expiresAt: string; targetRoute: string; previousRoute: string }, options?: MessageOptions): AgentMessage<"prepare_policy", PreparePolicyPayload>;
export function createApplyPolicyMessage(input: { agentId: string; policyId: string; policyRevision: number; policyFingerprint: Sha256Fingerprint; prepareReceiptId: string }, options?: MessageOptions): AgentMessage<"apply_policy", ApplyPolicyPayload>;
export function createRevokePolicyMessage(input: { agentId: string; policyId: string; policyRevision: number; reason: RevokeReason; restoreRevision: number | null }, options?: MessageOptions): AgentMessage<"revoke_policy", RevokePolicyPayload>;
export function createAgentReceipt(request: AgentMessage<AgentOperation, object>, input: { status: ReceiptStatus; state: Record<string, unknown>; failureCode?: string | null; activePolicyRevision?: number | null; now?: Date | string | number }): AgentReceipt;
export function verifyAgentReceipt(receipt: AgentReceipt, options: { request: AgentMessage<AgentOperation, object>; now?: Date | string | number }): Readonly<{ receipt: AgentReceipt; receipt_fingerprint: Sha256Fingerprint; request_fingerprint: Sha256Fingerprint }>;
