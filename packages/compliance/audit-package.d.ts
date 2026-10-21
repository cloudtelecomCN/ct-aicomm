export const AUDIT_PACKAGE_VERSION: "1.0.0";
export const AUDIT_PACKAGE_KINDS: readonly ["declaration", "approval", "execution", "rollback"];

export type AuditArtifactKind = (typeof AUDIT_PACKAGE_KINDS)[number];
export type AuditEvidenceOrigin = "declared" | "measured" | "synthetic";

export interface AuditPackageArtifactInput {
  kind: AuditArtifactKind;
  artifactId: string;
  path: `artifacts/${string}.json`;
  mediaType: "application/json";
  schemaVersion: string;
  fingerprintField: string;
  evidenceOrigin: AuditEvidenceOrigin;
  content: string | Uint8Array;
}

export interface AuditPackageArtifactDescriptor {
  kind: AuditArtifactKind;
  artifact_id: string;
  path: `artifacts/${string}.json`;
  media_type: "application/json";
  schema_version: string;
  fingerprint_field: string;
  evidence_origin: AuditEvidenceOrigin;
  source_fingerprint: `sha256:${string}`;
  sha256: `sha256:${string}`;
  bytes: number;
}

export interface AuditPackageManifest {
  schema_version: "1.0.0";
  package_id: string;
  tenant_id: string;
  workload_id: string;
  execution_id: string;
  evidence_origin: AuditEvidenceOrigin | "mixed";
  created_at: string;
  checksum_manifest_path: "SHA256SUMS";
  artifacts: AuditPackageArtifactDescriptor[];
  package_fingerprint: `sha256:${string}`;
}

export interface AuditPackageFile {
  path: `artifacts/${string}.json`;
  bytes: Uint8Array;
}

export interface AuditPackageBuild {
  manifest: Readonly<AuditPackageManifest>;
  manifestBytes: Uint8Array;
  checksumsText: string;
  files: readonly Readonly<AuditPackageFile>[];
}

export interface AuditPackageContext {
  tenant_id: string;
  workload_id: string;
  execution_id: string;
}

export function createAuditPackage(input: {
  packageId: string;
  tenantId: string;
  workloadId: string;
  executionId: string;
  artifacts: AuditPackageArtifactInput[];
  createdAt?: Date;
}): AuditPackageBuild;

export function serializeAuditPackageManifest(manifest: AuditPackageManifest): string;
export function renderAuditPackageChecksums(manifestBytes: string | Uint8Array, files: AuditPackageFile[]): string;
export function verifyAuditPackage(input: {
  manifestBytes: string | Uint8Array;
  checksumsBytes: string | Uint8Array;
  files: AuditPackageFile[];
  expectedContext?: AuditPackageContext;
}): Readonly<{
  valid: true;
  integrity_verified: true;
  context_verified: boolean;
  package_id: string;
  tenant_id: string;
  workload_id: string;
  execution_id: string;
  evidence_origin: AuditEvidenceOrigin | "mixed";
  artifact_count: number;
  package_fingerprint: `sha256:${string}`;
  authenticity_verified: false;
  authorization_verified: false;
  legal_or_certification_conclusion: false;
}>;
