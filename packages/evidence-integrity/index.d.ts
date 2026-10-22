export const EVIDENCE_CONTENT_INTEGRITY_VERSION: "1.0.0";
export const EVIDENCE_CONTENT_CANONICALIZATION: "RFC8785";
export const EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES: Readonly<{
  inputInvalid: "evidence_integrity_input_invalid";
  fieldUnknown: "evidence_integrity_field_unknown";
  fieldMissing: "evidence_integrity_field_missing";
  pathInvalid: "evidence_integrity_path_invalid";
  pathDuplicate: "evidence_integrity_path_duplicate";
  objectInvalid: "evidence_integrity_object_invalid";
  objectSetInvalid: "evidence_integrity_object_set_invalid";
  objectIdentityMismatch: "evidence_integrity_object_identity_mismatch";
  objectNoncanonical: "evidence_integrity_object_noncanonical";
  objectChecksumMismatch: "evidence_integrity_object_checksum_mismatch";
  objectFingerprintMismatch: "evidence_integrity_object_fingerprint_mismatch";
  manifestNoncanonical: "evidence_integrity_manifest_noncanonical";
  manifestFingerprintMismatch: "evidence_integrity_manifest_fingerprint_mismatch";
  contentFingerprintMismatch: "evidence_integrity_content_fingerprint_mismatch";
  checksumFormatInvalid: "evidence_integrity_checksum_format_invalid";
  checksumSetMismatch: "evidence_integrity_checksum_set_mismatch";
  anchorMismatch: "evidence_integrity_anchor_mismatch";
}>;

export type EvidenceObjectType = "scope" | "method" | "run" | "observation" | "artifact" | "evidence_version" | "review" | "policy_decision" | "export_grant";
export type EvidenceObjectRole = "evidence-content" | "evidence-version" | "downstream-record";
export type EvidenceDataOrigin = "synthetic" | "hybrid" | "measured";
export type EvidenceBytes = string | Uint8Array;

export interface EvidenceReference {
  object_type: "evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceContentObjectInput {
  path: string;
  content: EvidenceBytes;
}

export interface EvidenceContentDescriptor {
  path: string;
  object_type: EvidenceObjectType;
  object_id: string;
  version: string;
  tenant_id: string;
  role: EvidenceObjectRole;
  media_type: "application/json";
  canonicalization: "RFC8785";
  object_fingerprint: string;
  sha256: string;
  bytes: number;
}

export interface EvidenceContentManifest {
  schema_version: "1.0.0";
  manifest_id: string;
  evidence_ref: EvidenceReference;
  data_origin: EvidenceDataOrigin;
  created_at: string;
  canonicalization: "RFC8785";
  checksum_manifest_path: "SHA256SUMS";
  protected_scope: "entire-json-object";
  content_fingerprint: string;
  objects: EvidenceContentDescriptor[];
  manifest_fingerprint: string;
}

export interface EvidenceContentBundle {
  manifest: Readonly<EvidenceContentManifest>;
  manifestBytes: Uint8Array;
  checksumsText: string;
  files: ReadonlyArray<Readonly<{ path: string; bytes: Uint8Array }>>;
}

export interface EvidenceContentVerification {
  schema_version: "1.0.0";
  manifest_id: string;
  evidence_ref: Readonly<EvidenceReference>;
  data_origin: EvidenceDataOrigin;
  object_count: number;
  content_fingerprint: string;
  manifest_fingerprint: string;
  integrity_verified: true;
  external_anchor_verified: boolean;
  authenticity_verified: false;
  authorization_verified: false;
  independent_review_verified: false;
  certification_issued: false;
}

export function canonicalizeEvidenceValue(value: unknown): string;
export function digestEvidenceBytes(value: EvidenceBytes): string;
export function deriveEvidenceContentFingerprint(objects: EvidenceContentObjectInput[]): string;
export function serializeEvidenceContentManifest(manifest: EvidenceContentManifest): string;
export function renderEvidenceContentChecksums(manifestBytes: EvidenceBytes, files: Array<{ path: string; bytes: EvidenceBytes }>): string;
export function createEvidenceContentBundle(input: {
  manifestId: string;
  evidenceRef: EvidenceReference;
  dataOrigin: EvidenceDataOrigin;
  objects: EvidenceContentObjectInput[];
  createdAt?: Date;
}): EvidenceContentBundle;
export function verifyEvidenceContentBundle(input: {
  manifestBytes: EvidenceBytes;
  checksumsBytes: EvidenceBytes;
  files: Array<{ path: string; bytes: EvidenceBytes }>;
  expectedManifestFingerprint?: string;
}): EvidenceContentVerification;
