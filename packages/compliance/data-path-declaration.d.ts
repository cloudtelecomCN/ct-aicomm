export const DATA_PATH_DECLARATION_VERSION: "1.0.0";

export type DataPathFingerprint = `sha256:${string}`;
export type DataPathOrigin = "declared" | "synthetic";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";
export type RegionRole = "origin" | "transit" | "processing" | "storage" | "destination";
export type BoundaryType = "network_zone" | "tenant" | "provider" | "jurisdiction";
export type ProcessorRole = "controller" | "processor" | "subprocessor";

export interface DataCategoryDeclaration {
  category_id: string;
  classification: DataClassification;
}

export interface DataPathRegion {
  region_id: string;
  jurisdiction_code: string;
  provider: string;
  provider_region: string;
  roles: RegionRole[];
}

export interface DataPathBoundary {
  boundary_id: string;
  from_region_id: string;
  to_region_id: string;
  boundary_types: BoundaryType[];
  cross_jurisdiction: boolean;
  transfer_basis_ref: string | null;
}

export interface DataPathEncryption {
  in_transit: {
    required: boolean;
    protocols: Array<"tls-1.2" | "tls-1.3" | "mtls-1.2" | "mtls-1.3" | "ipsec" | "wireguard" | "macsec" | "application-layer">;
    termination: "end-to-end" | "boundary" | "hop-by-hop" | "not-applicable";
    plaintext_exception_refs: string[];
  };
  at_rest: {
    required: boolean;
    algorithms: Array<"aes-128-gcm" | "aes-256-gcm" | "aes-256-xts" | "provider-managed">;
    key_control: "tenant" | "processor" | "shared" | "not-applicable";
    key_reference: string | null;
  };
}

export interface DataPathProcessor {
  processor_id: string;
  legal_name: string;
  role: ProcessorRole;
  purposes: string[];
  data_category_ids: string[];
  region_ids: string[];
  parent_processor_id: string | null;
  agreement_ref: string | null;
}

export interface DataPathDeclaration {
  schema_version: "1.0.0";
  declaration_id: string;
  tenant_id: string;
  workload_id: string;
  revision: number;
  data_origin: DataPathOrigin;
  declared_at: string;
  data_categories: DataCategoryDeclaration[];
  ordered_region_ids: string[];
  regions: DataPathRegion[];
  boundaries: DataPathBoundary[];
  encryption: DataPathEncryption;
  processors: DataPathProcessor[];
  declaration_fingerprint: DataPathFingerprint;
}

export interface DataPathExpectedContext {
  tenant_id: string;
  workload_id: string;
  revision: number;
}

export interface DataPathValidationResult extends DataPathExpectedContext {
  valid: true;
  context_verified: boolean;
  declaration_id: string;
  data_origin: DataPathOrigin;
  region_count: number;
  boundary_count: number;
  processor_count: number;
  cross_jurisdiction_boundary_count: number;
  declaration_fingerprint: DataPathFingerprint;
}

export function createDataPathDeclaration(input: {
  declarationId: string;
  tenantId: string;
  workloadId: string;
  revision: number;
  dataOrigin: DataPathOrigin;
  dataCategories: DataCategoryDeclaration[];
  orderedRegionIds: string[];
  regions: DataPathRegion[];
  boundaries: DataPathBoundary[];
  encryption: DataPathEncryption;
  processors: DataPathProcessor[];
  declaredAt?: Date;
}): DataPathDeclaration;

export function validateDataPathDeclaration(declaration: DataPathDeclaration): DataPathValidationResult;
export function verifyDataPathDeclaration(declaration: DataPathDeclaration, expectedContext: DataPathExpectedContext): DataPathValidationResult & { context_verified: true };
