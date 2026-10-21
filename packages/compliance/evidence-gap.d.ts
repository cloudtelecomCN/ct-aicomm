export const EVIDENCE_GAP_REPORT_VERSION: "1.0.0";
export const EVIDENCE_GAP_TYPES: readonly ["missing", "stale", "conflicting", "unsigned"];

export interface EvidenceContext {
  tenant_id: string;
  workload_id: string;
  execution_id: string;
}

export interface EvidenceRequirement {
  requirement_id: string;
  evidence_kind: string;
  max_age_seconds: number;
  minimum_verified_signatures: number;
  allowed_signer_roles: string[];
}

export interface EvidenceRecord {
  evidence_id: string;
  requirement_id: string;
  evidence_kind: string;
  subject: EvidenceContext;
  observed_at: string;
  claim_fingerprint: `sha256:${string}`;
  content_fingerprint: `sha256:${string}`;
  evidence_origin: "declared" | "measured" | "synthetic";
}

export interface SignatureVerificationReceipt {
  verification_id: string;
  evidence_id: string;
  status: "verified" | "invalid" | "unknown";
  signer_id: string;
  signer_role: string;
  key_id: string;
  verifier_id: string;
  verified_at: string;
  signature_fingerprint: `sha256:${string}`;
}

export interface EvidenceGapAssessment {
  schema_version: "1.0.0";
  assessment_id: string;
  policy: {
    policy_id: string;
    policy_version: string;
    requirements: EvidenceRequirement[];
  };
  subject: EvidenceContext;
  evidence: EvidenceRecord[];
  signature_verifications: SignatureVerificationReceipt[];
}

export type EvidenceGap = Readonly<{
  type: "missing" | "stale" | "conflicting" | "unsigned";
  requirement_id: string;
  evidence_ids: string[];
  gap_fingerprint: `sha256:${string}`;
  [key: string]: unknown;
}>;

export interface EvidenceGapReport {
  schema_version: "1.0.0";
  assessment_id: string;
  assessment_fingerprint: `sha256:${string}`;
  policy_id: string;
  policy_version: string;
  policy_fingerprint: `sha256:${string}`;
  subject: EvidenceContext;
  evaluated_at: string;
  trusted_verifier_ids: string[];
  evidence_origin: "none" | "declared" | "measured" | "synthetic" | "mixed";
  default_deny: true;
  status: "requirements_satisfied" | "not_satisfied";
  requirements_satisfied: boolean;
  gap_count: number;
  gaps: EvidenceGap[];
  summary: Readonly<{
    requirement_count: number;
    submitted_evidence_count: number;
    fresh_evidence_count: number;
    stale_evidence_count: number;
    signature_sufficient_evidence_count: number;
    signature_deficient_evidence_count: number;
    conflicting_requirement_count: number;
  }>;
  authorization_verified: false;
  legal_or_certification_conclusion: false;
  report_fingerprint: `sha256:${string}`;
}

export function inspectEvidenceGaps(
  assessment: EvidenceGapAssessment,
  options: {
    expectedContext: EvidenceContext;
    evaluatedAt: Date;
    trustedVerifierIds: string[];
  }
): Readonly<EvidenceGapReport>;
