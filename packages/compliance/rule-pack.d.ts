export const COMPLIANCE_RULE_PACK_VERSION: "1.0.0";
export const COMPLIANCE_RULE_DOMAINS: readonly ["mlps", "data_boundary", "enterprise"];

export interface ComplianceRuleMapping {
  mapping_id: string;
  domain: "mlps" | "data_boundary" | "enterprise";
  source_framework: string;
  source_control_refs: string[];
  target_control_ids: string[];
  evidence_kinds: string[];
  rationale: string;
  assessment_required: true;
}

export interface ComplianceRulePack {
  schema_version: "1.0.0";
  pack_id: string;
  pack_version: string;
  title: string;
  description: string;
  data_origin: "reference" | "enterprise_declared" | "synthetic";
  published_at: string;
  effective_from: string;
  supersedes: null | { pack_id: string; pack_version: string; pack_fingerprint: `sha256:${string}` };
  issuer: { name: string; authority_type: "project_reference" | "customer_defined"; reference_url: string | null };
  scope: { jurisdictions: string[]; workload_types: string[]; notes: string };
  mappings: ComplianceRuleMapping[];
  assurance_boundary: { mapping_only: true; legal_conclusion: false; certification_issued: false; external_assessment_performed: false };
  pack_fingerprint: `sha256:${string}`;
}

export interface ComplianceControlObservationInput {
  schema_version: "1.0.0";
  evaluation_id: string;
  subject: { tenant_id: string; workload_id: string; declaration_id: string; declaration_version: number };
  control_observations: Array<{
    control_id: string;
    status: "evidence_present" | "evidence_missing" | "not_observed";
    evidence_refs: Array<{ evidence_id: string; evidence_kind: string; content_fingerprint: `sha256:${string}` }>;
  }>;
}

export interface ComplianceRuleMappingReport {
  schema_version: "1.0.0";
  evaluation_id: string;
  pack_id: string;
  pack_version: string;
  pack_fingerprint: `sha256:${string}`;
  subject: ComplianceControlObservationInput["subject"];
  evaluated_at: string;
  status: "mapped_with_gaps" | "not_evaluated" | "mapped_without_observed_gaps";
  counts: { total: number; evidence_present: number; evidence_missing: number; not_evaluated: number };
  mappings: Array<{
    mapping_id: string;
    domain: "mlps" | "data_boundary" | "enterprise";
    source_framework: string;
    source_control_refs: string[];
    target_control_ids: string[];
    status: "evidence_present" | "evidence_missing" | "not_evaluated";
    evidence_refs: Array<{ evidence_id: string; evidence_kind: string; content_fingerprint: `sha256:${string}` }>;
    assessment_required: true;
    mapping_fingerprint: `sha256:${string}`;
  }>;
  mapping_only: true;
  legal_conclusion: false;
  certification_issued: false;
  external_assessment_performed: false;
  report_fingerprint: `sha256:${string}`;
}

export function createComplianceRulePack(input: Omit<ComplianceRulePack, "pack_fingerprint">): Readonly<ComplianceRulePack>;
export function validateComplianceRulePack(input: ComplianceRulePack): Readonly<ComplianceRulePack>;
export function verifyComplianceRulePackUpgrade(previous: ComplianceRulePack, next: ComplianceRulePack): Readonly<{
  valid: true;
  pack_id: string;
  previous_version: string;
  next_version: string;
  previous_fingerprint: `sha256:${string}`;
  next_fingerprint: `sha256:${string}`;
}>;
export function mapComplianceRulePack(pack: ComplianceRulePack, input: ComplianceControlObservationInput, options: {
  expectedSubject: ComplianceControlObservationInput["subject"];
  evaluatedAt: Date;
}): Readonly<ComplianceRuleMappingReport>;
