export type CatalogResourceType = "gpu" | "cloud_instance" | "region" | "network_path" | "software_stack" | "pricing_offer";
export type CatalogVisibility = "public" | "tenant_private";
export type CatalogDataClass = "public" | "tenant_private" | "synthetic";
export type CatalogFactStatus = "provided" | "unknown" | "not_applicable";

export interface CatalogAuthorization {
  basis: "public_web" | "open_license" | "customer_authorized" | "contract" | "internal_synthetic" | "unknown";
  analysis_use: "allowed" | "prohibited" | "unknown";
  redistribution: "allowed" | "prohibited" | "unknown";
  reference: string | null;
}

export interface CatalogSourceSnapshot {
  schema_version: "1.0.0";
  snapshot_id: string;
  data_class: CatalogDataClass;
  kind: "measured" | "vendor_published" | "customer_quoted" | "customer_declared" | "modeled" | "inferred" | "synthetic" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  publisher: string;
  title: string;
  reference_url: string | null;
  observed_at: string;
  effective_from: string;
  expires_at: string | null;
  authorization: CatalogAuthorization;
  summary: string;
  content_sha256: string;
}

export interface CatalogFact {
  field_id: string;
  status: CatalogFactStatus;
  value: string | number | boolean | string[] | null;
  unit: string;
}

export interface CatalogResource {
  schema_version: "1.0.0";
  resource_id: string;
  resource_type: CatalogResourceType;
  canonical_key: string;
  display_name: string;
  lifecycle_status: "active" | "deprecated" | "unknown";
  visibility: CatalogVisibility;
  data_class: CatalogDataClass;
  facts: CatalogFact[];
  source_snapshot: CatalogSourceSnapshot;
  recorded_at: string;
  content_sha256: string;
  boundaries: {
    decision_support_only: true;
    execution_authorized: false;
    performance_claim_allowed: false;
  };
}

export interface CatalogResourceEvaluation {
  evaluated_at: string;
  freshness: "not_yet_effective" | "current" | "expired";
  required_facts_complete: boolean;
  missing_required_fields: string[];
  usable_for_analysis: boolean;
  reasons: string[];
}

export declare const RESOURCE_CATALOG_SCHEMA_VERSION: "1.0.0";
export declare const RESOURCE_FIELD_REGISTRY_VERSION: "1.0.0";
export declare const RESOURCE_CATALOG_TYPES: readonly CatalogResourceType[];
export declare function computeCatalogSourceDigest(source: CatalogSourceSnapshot): string;
export declare function computeCatalogResourceDigest(resource: CatalogResource): string;
export declare function validateResourceFieldRegistry(registry: Record<string, unknown>): { valid: true; field_count: number; profile_count: number };
export declare function validateCatalogSourceSnapshot(source: CatalogSourceSnapshot, options?: { visibility?: CatalogVisibility }): { valid: true; digest_verified: true };
export declare function classifyCatalogResource(resource: CatalogResource, evaluatedAt: string, registry: Record<string, unknown>): CatalogResourceEvaluation;
export declare function validateCatalogResource(resource: CatalogResource, registry: Record<string, unknown>, options?: { evaluatedAt?: string }): { valid: true; digest_verified: true } & CatalogResourceEvaluation;
export declare function validateResourceCatalogBundle(bundle: Record<string, unknown>, registry: Record<string, unknown>, options?: { evaluatedAt?: string }): Record<string, unknown>;
