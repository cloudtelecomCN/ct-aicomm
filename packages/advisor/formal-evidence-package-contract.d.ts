export declare const ADVISOR_FORMAL_PACKAGE_CONTRACT_SCHEMA_VERSION: "1.0.0";
export declare const ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION: "1.0.0";
export declare const ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION: "1.0.0";
export declare const ADVISOR_FORMAL_PACKAGE_PROFILE_ID: "ct-advisor-gpu-decision-evidence-package/v1";
export declare const ADVISOR_FORMAL_PACKAGE_CAPABILITY_KEY: "gpu_preprocurement_decision_evidence_package";

export interface AdvisorFormalPackageItem {
  item_id: `D${string}`;
  artifact_key: string;
  title_en: string;
  title_zh: string;
  delivery_kind: string;
  required: true;
  machine_readable_required: boolean;
  allowed_formats: readonly string[];
  owner_task: string;
}

export interface AdvisorFormalPackageSourceBindings {
  basic_report: { report_id: string; content_sha256: string };
  requirement_passport: { passport_id: string; revision: number; content_sha256: string };
  constraint_evaluation: { evaluation_id: string; content_sha256: string };
  analysis: { analysis_id: string; content_sha256: string; method_sha256: string; observation_set_sha256: string };
}

export interface AdvisorFormalPackageContract {
  schema_version: "1.0.0";
  contract_version: "1.0.0";
  contract_type: "ct_advisor_gpu_decision_evidence_package_contract";
  contract_id: string;
  capability_key: "gpu_preprocurement_decision_evidence_package";
  project_id: string;
  locale: "en" | "zh-CN";
  state: "contract_frozen";
  frozen_at: string;
  source_bindings: AdvisorFormalPackageSourceBindings;
  package_profile: Record<string, unknown>;
  manifest_contract: Record<string, unknown>;
  boundaries: Record<string, boolean>;
  content_sha256: string;
}

export declare const ADVISOR_FORMAL_PACKAGE_ITEMS: readonly AdvisorFormalPackageItem[];
export declare const ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY: Readonly<Record<string, string>>;
export declare const ADVISOR_FORMAL_PACKAGE_BOUNDARIES: Readonly<Record<string, boolean>>;
export declare function getAdvisorFormalPackageProfile(): Record<string, unknown> & { profile_sha256: string };
export declare function buildAdvisorFormalEvidencePackageContract(input: { contractId: string; projectId: string; locale: "en" | "zh-CN"; sourceBindings: AdvisorFormalPackageSourceBindings; frozenAt: string }): AdvisorFormalPackageContract;
export declare function validateAdvisorFormalEvidencePackageContract(contract: AdvisorFormalPackageContract): { valid: true; contract_frozen: true; artifact_count: 13; profile_sha256: string; content_sha256: string };
export declare function assessAdvisorFormalPackageCompatibility(input: { documentSchemaVersion: string; documentProfileVersion: string; readerSchemaVersion?: string; readerProfileVersion?: string }): { compatible: boolean; policy_id: string; schema_compatible: boolean; profile_compatible: boolean; reason: string };
export declare function computeAdvisorFormalPackageSha256(value: unknown): string;
