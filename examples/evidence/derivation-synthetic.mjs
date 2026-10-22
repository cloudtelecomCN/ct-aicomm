import { readFile } from "node:fs/promises";
import {
  createArtifactDerivationRecord,
  inspectArtifactDerivationRecord,
  verifyArtifactDerivationRecord
} from "../../packages/evidence-derivation/index.mjs";

const fixture = new URL("./derivation/", import.meta.url);
const sourceArtifact = JSON.parse(await readFile(new URL("source-artifact.synthetic.json", fixture), "utf8"));
const derivedArtifact = JSON.parse(await readFile(new URL("public-artifact.synthetic.json", fixture), "utf8"));
const policyFingerprint = `sha256:${"5".repeat(64)}`;

const record = createArtifactDerivationRecord({
  derivationId: "derivation-synthetic-public-summary",
  version: "1.0.0",
  createdBy: "principal-synthetic-publisher",
  createdAt: "2026-10-23T01:12:00.000Z",
  sourceArtifact,
  derivedArtifact,
  policy: {
    policy_id: "policy-synthetic-public-derivation",
    version: "1.0.0",
    fingerprint: policyFingerprint
  },
  redactions: [
    {
      source_content_pointer: "/destination_endpoint/ip_address",
      action: "remove",
      category: "infrastructure-locator",
      reason_code: "restricted-network-address"
    },
    {
      source_content_pointer: "/request_identifiers",
      action: "pseudonymize",
      category: "customer-data",
      reason_code: "customer-identifier-boundary"
    },
    {
      source_content_pointer: "/samples",
      action: "aggregate",
      category: "raw-measurement",
      reason_code: "publish-aggregate-only"
    },
    {
      source_content_pointer: "/source_endpoint/ip_address",
      action: "remove",
      category: "infrastructure-locator",
      reason_code: "restricted-network-address"
    }
  ]
});

const inspection = inspectArtifactDerivationRecord(record);
const verification = verifyArtifactDerivationRecord({
  record,
  sourceArtifact,
  derivedArtifact,
  expectedPolicyFingerprint: policyFingerprint
});

process.stdout.write(`${JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  declared_field_count: record.redaction_summary.declared_field_count,
  raw_values_included: record.redaction_summary.raw_values_included,
  private_source_required_for_full_review: record.review_effect.private_source_required_for_full_review,
  record_integrity_verified: inspection.record_integrity_verified,
  exact_version_lineage_verified: verification.exact_version_lineage_verified,
  policy_anchor_verified: verification.policy_anchor_verified,
  source_content_bytes_verified: verification.source_content_bytes_verified,
  authenticity_verified: verification.authenticity_verified,
  authorization_verified: verification.authorization_verified,
  certification_issued: verification.certification_issued
}, null, 2)}\n`);
