export declare const EVIDENCE_IMPORT_VERSION: "1.0.0";

export declare const EVIDENCE_CANONICAL_UNITS: readonly string[];

export declare const EVIDENCE_IMPORT_ERROR_CODES: Readonly<Record<string, string>>;

export interface EvidenceImportReference {
  object_type: "evidence_version";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceImportIssue {
  code: string;
  path: string;
}

export interface EvidenceImportRecord {
  schema_version: "1.0.0";
  record_type: "evidence_import_record";
  attempt_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  tenant_id: string;
  source_id: string;
  received_at: string;
  evidence_ref: EvidenceImportReference | null;
  data_origin: "synthetic" | "hybrid" | "measured" | null;
  manifest_fingerprint: string | null;
  content_fingerprint: string | null;
  outcome: "committed" | "replayed" | "rejected";
  imported_object_count: number;
  duplicate_object_count: number;
  errors: readonly EvidenceImportIssue[];
  external_anchor_verified: boolean;
  authenticity_verified: false;
  authorization_verified: false;
  performance_claim_allowed: false;
  certification_issued: false;
  previous_record_fingerprint: string | null;
  record_fingerprint: string;
}

export interface EvidenceImportedObject {
  object_type: string;
  object_id: string;
  version: string;
  tenant_id: string;
  object_fingerprint: string;
  sha256: string;
  manifest_fingerprint: string;
  attempt_id: string;
  imported_at: string;
}

export interface EvidenceImportLedger {
  schema_version: "1.0.0";
  tenant_id: string;
  objects: readonly EvidenceImportedObject[];
  attempts: readonly EvidenceImportRecord[];
}

export interface EvidenceImportCommand {
  attemptId: string;
  idempotencyKey: string;
  tenantId: string;
  sourceId: string;
  receivedAt: string;
  expectedManifestFingerprint: string;
  manifestBytes: string | Uint8Array;
  checksumsBytes: string | Uint8Array;
  files: readonly { path: string; bytes: string | Uint8Array }[];
}

export declare function createEvidenceImportLedger(input: { tenantId: string }): EvidenceImportLedger;

export declare function importEvidenceBundle(
  ledger: EvidenceImportLedger,
  command: EvidenceImportCommand
): Readonly<{ ledger: EvidenceImportLedger; record: EvidenceImportRecord; idempotent_replay: boolean }>;

export declare function verifyEvidenceImportLedger(ledger: EvidenceImportLedger): Readonly<{
  schema_version: "1.0.0";
  tenant_id: string;
  stored_object_count: number;
  attempt_count: number;
  last_record_fingerprint: string | null;
  append_only_chain_verified: true;
  content_authenticity_verified: false;
  authorization_verified: false;
  certification_issued: false;
}>;
