export declare const ARTIFACT_DERIVATION_VERSION: "1.0.0";
export declare const ARTIFACT_REDACTION_ACTIONS: readonly ["aggregate", "generalize", "mask", "pseudonymize", "remove"];
export declare const ARTIFACT_DERIVATION_ERROR_CODES: Readonly<Record<string, string>>;

export interface ArtifactReference {
  object_type: "artifact";
  object_id: string;
  version: string;
  tenant_id: string;
}

export interface EvidenceAuthorizationScope {
  visibility: "private" | "shared" | "public";
  purpose: string;
  recipients: readonly string[];
  expires_at: string | null;
}

export interface EvidenceArtifact {
  schema_version: "1.0.0";
  object_type: "artifact";
  artifact_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  authorization_scope: EvidenceAuthorizationScope;
  kind: "raw-samples" | "log" | "configuration" | "method" | "report" | "other";
  media_type: string;
  content_fingerprint: string;
  size_bytes: number;
  storage_locator: string;
  classification: "public" | "shared" | "restricted";
  derived_from: readonly ArtifactReference[];
}

export type ArtifactRedactionAction = "aggregate" | "generalize" | "mask" | "pseudonymize" | "remove";
export type ArtifactRedactionCategory = "commercial-confidential" | "credential" | "customer-data" | "infrastructure-locator" | "network-topology" | "other-restricted" | "personal-data" | "raw-measurement";

export interface ArtifactRedactionInput {
  source_content_pointer: string;
  action: ArtifactRedactionAction;
  category: ArtifactRedactionCategory;
  reason_code: string;
}

export interface ArtifactDerivationPolicy {
  policy_id: string;
  version: string;
  fingerprint: string;
}

export interface ArtifactDerivationRecord {
  schema_version: "1.0.0";
  record_type: "artifact_derivation_record";
  derivation_id: string;
  version: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  source_artifact: Readonly<{
    artifact_ref: ArtifactReference;
    object_fingerprint: string;
    content_fingerprint: string;
    classification: "restricted";
  }>;
  derived_artifact: Readonly<{
    artifact_ref: ArtifactReference;
    object_fingerprint: string;
    content_fingerprint: string;
    classification: "public";
  }>;
  policy: Readonly<ArtifactDerivationPolicy>;
  redactions: readonly Readonly<ArtifactRedactionInput & { review_impact: "granularity-reduced" | "identity-replaced" | "sample-set-reduced" | "source-value-unavailable" }>[];
  redaction_summary: Readonly<{
    declared_field_count: number;
    omitted_field_count: number;
    transformed_field_count: number;
    categories: readonly ArtifactRedactionCategory[];
    raw_values_included: false;
  }>;
  review_effect: Readonly<{
    public_review_scope: "derived-artifact-and-lineage-only";
    private_source_required_for_full_review: true;
    disclosed_impact_codes: readonly string[];
    limitations: readonly string[];
    source_content_bytes_verified_by_record: false;
  }>;
  source_content_included: false;
  hidden_values_included: false;
  authenticity_verified: false;
  authorization_verified: false;
  certification_issued: false;
  record_fingerprint: string;
}

export declare function createArtifactDerivationRecord(input: {
  derivationId: string;
  version: string;
  createdBy: string;
  createdAt: string;
  sourceArtifact: EvidenceArtifact;
  derivedArtifact: EvidenceArtifact;
  policy: ArtifactDerivationPolicy;
  redactions: readonly ArtifactRedactionInput[];
}): ArtifactDerivationRecord;

export interface ArtifactDerivationInspection {
  schema_version: "1.0.0";
  derivation_id: string;
  record_fingerprint: string;
  record_integrity_verified: true;
  lineage_claim_consistent: true;
  redaction_disclosure_verified: true;
  source_artifact_verified: false;
  derived_artifact_verified: false;
  source_content_bytes_verified: false;
  derived_content_bytes_verified: false;
  authenticity_verified: false;
  authorization_verified: false;
  certification_issued: false;
  review_effect: ArtifactDerivationRecord["review_effect"];
}

export interface ArtifactDerivationVerification extends Omit<ArtifactDerivationInspection, "source_artifact_verified" | "derived_artifact_verified"> {
  source_artifact_verified: true;
  derived_artifact_verified: true;
  exact_version_lineage_verified: true;
  policy_anchor_verified: boolean;
}

export declare function inspectArtifactDerivationRecord(record: ArtifactDerivationRecord): Readonly<ArtifactDerivationInspection>;

export declare function verifyArtifactDerivationRecord(input: {
  record: ArtifactDerivationRecord;
  sourceArtifact: EvidenceArtifact;
  derivedArtifact: EvidenceArtifact;
  expectedPolicyFingerprint?: string;
}): Readonly<ArtifactDerivationVerification>;
