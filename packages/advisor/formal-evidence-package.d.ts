export interface AdvisorPackageFile {
  path: string;
  bytes: Uint8Array | ArrayBuffer | string;
}

export interface AdvisorPackageArchive {
  readonly archiveName: string;
  readonly archiveBytes: Uint8Array;
  readonly archiveSha256: string;
  readonly archiveDigestSidecarName: string;
  readonly archiveDigestSidecar: string;
}

export interface AdvisorPackageVerificationResult {
  readonly schema_version: "1.0.0";
  readonly verifier_version: string;
  readonly valid: true;
  readonly integrity_verified: true;
  readonly archive_sha256: string;
  readonly package_id: string;
  readonly contract_id: string;
  readonly package_revision: number;
  readonly locale: "en" | "zh-CN";
  readonly declared_package_state: "assembled" | "issued" | "accepted" | "superseded" | "revoked";
  readonly revocation_status: "revoked_as_packaged" | "snapshot_only_not_live_checked";
  readonly payload_file_count: number;
  readonly authenticity_verified: false;
  readonly issuance_authority_verified: false;
  readonly entitlement_verified: false;
  readonly live_revocation_checked: false;
  readonly execution_authorized: false;
  readonly certification_issued: false;
  readonly legal_opinion_issued: false;
  readonly performance_claim_allowed: false;
}

export declare const ADVISOR_FORMAL_PACKAGE_VERIFIER_VERSION: "1.0.0";
export declare const ADVISOR_FORMAL_PACKAGE_VERIFICATION_SCHEMA_VERSION: "1.0.0";
export declare function validateAdvisorFormalEvidencePackageManifest(manifest: unknown): Readonly<{ valid: true; files: readonly unknown[]; profile_sha256: string }>;
export declare function serializeAdvisorFormalEvidencePackageManifest(manifest: unknown): string;
export declare function renderAdvisorFormalEvidencePackageChecksums(manifestBytes: Uint8Array | ArrayBuffer | string, files: AdvisorPackageFile[]): string;
export declare function createAdvisorFormalEvidencePackageArchive(input: { manifest: unknown; files: AdvisorPackageFile[] }): AdvisorPackageArchive;
export declare function verifyAdvisorFormalEvidencePackage(input: {
  archiveBytes: Uint8Array | ArrayBuffer;
  archiveName: string;
  archiveDigestSidecar: Uint8Array | ArrayBuffer | string;
  expectedPackageId?: string;
  expectedContractId?: string;
}): AdvisorPackageVerificationResult;
export declare function computeAdvisorFormalPackageDigest(value: unknown): string;
export declare function getAdvisorFormalPackageVerifierBoundaries(): Readonly<Record<string, boolean>>;
