export const EXECUTION_EVIDENCE_BINDING_VERSION: "1.0.0";

export type EvidenceFingerprint = `sha256:${string}`;
export type EvidenceOrigin = "measured" | "synthetic";

export interface PolicyEvidenceReference {
  tenant_id: string;
  policy_id: string;
  policy_version: string;
  policy_fingerprint: EvidenceFingerprint;
}

export interface AgentEvidenceReference {
  tenant_id: string;
  agent_id: string;
  agent_version: string;
  agent_fingerprint: EvidenceFingerprint;
}

export interface RouteEvidenceReference {
  tenant_id: string;
  execution_id: string;
  route_id: string;
  route_version: string;
  route_fingerprint: EvidenceFingerprint;
}

export interface TraceEvidenceReference {
  tenant_id: string;
  execution_id: string;
  trace_id: string;
  trace_version: string;
  trace_fingerprint: EvidenceFingerprint;
}

export interface EnvironmentEvidenceReference {
  tenant_id: string;
  environment_id: string;
  environment_version: string;
  environment_fingerprint: EvidenceFingerprint;
}

export interface ExecutionEvidenceComponents {
  policy: PolicyEvidenceReference;
  agent: AgentEvidenceReference;
  route: RouteEvidenceReference;
  trace: TraceEvidenceReference;
  environment: EnvironmentEvidenceReference;
}

export interface ExecutionEvidenceContext {
  tenant_id: string;
  execution_id: string;
  components: ExecutionEvidenceComponents;
}

export interface ExecutionEvidenceBinding extends ExecutionEvidenceContext {
  schema_version: "1.0.0";
  binding_id: string;
  evidence_origin: EvidenceOrigin;
  created_at: string;
  lock_fingerprint: EvidenceFingerprint;
  binding_fingerprint: EvidenceFingerprint;
}

export function createExecutionEvidenceBinding(input: {
  bindingId: string;
  tenantId: string;
  executionId: string;
  evidenceOrigin: EvidenceOrigin;
  components: ExecutionEvidenceComponents;
  createdAt?: Date;
}): ExecutionEvidenceBinding;

export function verifyExecutionEvidenceBinding(binding: ExecutionEvidenceBinding, expectedContext: ExecutionEvidenceContext): {
  valid: true;
  binding_id: string;
  tenant_id: string;
  execution_id: string;
  binding_fingerprint: EvidenceFingerprint;
  evidence_origin: EvidenceOrigin;
};
