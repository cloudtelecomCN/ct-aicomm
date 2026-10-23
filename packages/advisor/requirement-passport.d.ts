export const REQUIREMENT_PASSPORT_SCHEMA_VERSION: "2.0.0";
export const REQUIREMENT_FIELD_SET_VERSION: "2.0.0";

export interface RequirementFieldSource {
  kind: "measured" | "vendor_published" | "customer_quoted" | "customer_declared" | "modeled" | "inferred" | "synthetic" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  observed_at: string;
  reference?: string;
}

export interface RequirementField {
  field_id: string;
  status: "provided" | "unknown" | "not_applicable";
  value: string | number | boolean | string[] | null;
  unit: string;
  constraint: "hard" | "soft" | "context";
  source: RequirementFieldSource;
}

export interface RequirementPassport {
  schema_version: "2.0.0";
  passport_id: string;
  project_id: string;
  task_template: { id: string; version: string };
  field_set_version: "2.0.0";
  state: "draft" | "frozen";
  revision: number;
  fields: RequirementField[];
  recorded_by: { actor_type: "customer" | "advisor" | "importer" | "system"; role: string };
  recorded_at: string;
  frozen_at: string | null;
  content_sha256: string | null;
  boundaries: {
    decision_support_only: true;
    execution_authorized: false;
    performance_claim_allowed: false;
  };
}

export function computeRequirementPassportDigest(passport: RequirementPassport): string;
export function validateRequirementPassport(passport: RequirementPassport, registry: Record<string, unknown>): {
  schema_version: "2.0.0";
  valid: true;
  state: "draft" | "frozen";
  template_id: string;
  field_count: number;
  required_field_count: number;
  required_fields_complete: boolean;
  digest_verified: boolean;
  decision_support_only: true;
  execution_authorized: false;
};
