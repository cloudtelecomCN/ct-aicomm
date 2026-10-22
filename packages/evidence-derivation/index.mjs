import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";

export const ARTIFACT_DERIVATION_VERSION = "1.0.0";

export const ARTIFACT_REDACTION_ACTIONS = Object.freeze([
  "aggregate",
  "generalize",
  "mask",
  "pseudonymize",
  "remove"
]);

export const ARTIFACT_DERIVATION_ERROR_CODES = Object.freeze({
  inputInvalid: "artifact_derivation_input_invalid",
  fieldUnknown: "artifact_derivation_field_unknown",
  fieldMissing: "artifact_derivation_field_missing",
  artifactInvalid: "artifact_derivation_artifact_invalid",
  classificationInvalid: "artifact_derivation_classification_invalid",
  tenantMismatch: "artifact_derivation_tenant_mismatch",
  lineageMissing: "artifact_derivation_lineage_missing",
  timeOrderInvalid: "artifact_derivation_time_order_invalid",
  pointerInvalid: "artifact_derivation_pointer_invalid",
  pointerDuplicate: "artifact_derivation_pointer_duplicate",
  fingerprintMismatch: "artifact_derivation_fingerprint_mismatch",
  policyAnchorMismatch: "artifact_derivation_policy_anchor_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const JSON_POINTER = /^\/(?:[^~/]|~0|~1)+(?:\/(?:[^~/]|~0|~1)+)*$/;
const ACTIONS = new Set(ARTIFACT_REDACTION_ACTIONS);
const CATEGORIES = new Set([
  "commercial-confidential",
  "credential",
  "customer-data",
  "infrastructure-locator",
  "network-topology",
  "other-restricted",
  "personal-data",
  "raw-measurement"
]);
const ACTION_IMPACT = Object.freeze({
  aggregate: "sample-set-reduced",
  generalize: "granularity-reduced",
  mask: "source-value-unavailable",
  pseudonymize: "identity-replaced",
  remove: "source-value-unavailable"
});
const IMPACT_LIMITATION = Object.freeze({
  "granularity-reduced": "public values have lower granularity than the restricted source",
  "identity-replaced": "public identifiers cannot be joined back to restricted source identities",
  "sample-set-reduced": "public aggregates do not expose every restricted source sample",
  "source-value-unavailable": "redacted source values are not publicly inspectable"
});
const ARTIFACT_FIELDS = Object.freeze([
  "schema_version",
  "object_type",
  "artifact_id",
  "version",
  "tenant_id",
  "created_by",
  "created_at",
  "authorization_scope",
  "kind",
  "media_type",
  "content_fingerprint",
  "size_bytes",
  "storage_locator",
  "classification",
  "derived_from"
]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(ARTIFACT_DERIVATION_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(ARTIFACT_DERIVATION_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !HASH.test(value)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must be a sha256 fingerprint`);
  return value;
}

function requireSemver(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must be a strict semantic version`);
  return value;
}

function canonicalInstant(value, label) {
  if (typeof value !== "string") fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function referenceOf(artifact) {
  return {
    object_type: "artifact",
    object_id: artifact.artifact_id,
    version: artifact.version,
    tenant_id: artifact.tenant_id
  };
}

function referenceKey(reference) {
  return `${reference.tenant_id}\u0000${reference.object_type}\u0000${reference.object_id}\u0000${reference.version}`;
}

function normalizeReference(value, label) {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], [], label);
  if (value.object_type !== "artifact") fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.object_type must be artifact`);
  return {
    object_type: "artifact",
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`)
  };
}

function validateAuthorization(value, label) {
  exactObject(value, ["visibility", "purpose", "recipients", "expires_at"], [], label);
  if (!["private", "shared", "public"].includes(value.visibility)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.visibility is invalid`);
  }
  if (typeof value.purpose !== "string" || value.purpose.length < 3 || value.purpose.length > 500) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.purpose is invalid`);
  }
  if (!Array.isArray(value.recipients)
    || value.recipients.some((recipient) => typeof recipient !== "string" || !ID.test(recipient))
    || new Set(value.recipients).size !== value.recipients.length) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.recipients is invalid`);
  }
  if (value.expires_at !== null) canonicalInstant(value.expires_at, `${label}.expires_at`);
}

function normalizeArtifact(value, label, expected) {
  exactObject(value, ARTIFACT_FIELDS, [], label);
  if (value.schema_version !== ARTIFACT_DERIVATION_VERSION || value.object_type !== "artifact") {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label} must be an Evidence Core Artifact v1`);
  }
  requireId(value.artifact_id, `${label}.artifact_id`);
  requireSemver(value.version, `${label}.version`);
  requireId(value.tenant_id, `${label}.tenant_id`);
  requireId(value.created_by, `${label}.created_by`);
  canonicalInstant(value.created_at, `${label}.created_at`);
  validateAuthorization(value.authorization_scope, `${label}.authorization_scope`);
  if (value.authorization_scope.expires_at !== null
    && Date.parse(value.authorization_scope.expires_at) <= Date.parse(value.created_at)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.timeOrderInvalid, `${label}.authorization_scope.expires_at must be after created_at`);
  }
  if (!["raw-samples", "log", "configuration", "method", "report", "other"].includes(value.kind)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.kind is invalid`);
  }
  if (typeof value.media_type !== "string" || value.media_type.length < 3 || value.media_type.length > 120) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.media_type is invalid`);
  }
  requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  if (!Number.isInteger(value.size_bytes) || value.size_bytes < 0) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.size_bytes is invalid`);
  }
  if (typeof value.storage_locator !== "string" || value.storage_locator.length < 3 || value.storage_locator.length > 1000) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.storage_locator is invalid`);
  }
  try {
    new URL(value.storage_locator);
  } catch {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.storage_locator must be an absolute URI`);
  }
  if (!Array.isArray(value.derived_from) || value.derived_from.length > 64) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.derived_from is invalid`);
  }
  const derivedFrom = value.derived_from.map((reference, index) => normalizeReference(reference, `${label}.derived_from[${index}]`));
  if (new Set(derivedFrom.map(referenceKey)).size !== derivedFrom.length) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, `${label}.derived_from contains duplicate references`);
  }
  if (derivedFrom.some((reference) => reference.tenant_id !== value.tenant_id)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.tenantMismatch, `${label}.derived_from must stay inside the artifact tenant`);
  }
  if (value.classification !== expected.classification || value.authorization_scope.visibility !== expected.visibility) {
    fail(
      ARTIFACT_DERIVATION_ERROR_CODES.classificationInvalid,
      `${label} must be ${expected.classification} with ${expected.visibility} visibility`
    );
  }
  if (expected.visibility === "public" && value.authorization_scope.recipients.length !== 0) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.classificationInvalid, `${label} public visibility cannot name recipients`);
  }
  return value;
}

function normalizePolicy(value, label = "policy") {
  exactObject(value, ["policy_id", "version", "fingerprint"], [], label);
  return {
    policy_id: requireId(value.policy_id, `${label}.policy_id`),
    version: requireSemver(value.version, `${label}.version`),
    fingerprint: requireHash(value.fingerprint, `${label}.fingerprint`)
  };
}

function normalizeRedactions(value, label = "redactions", options = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${label} must contain 1-256 declarations`);
  }
  const normalized = value.map((entry, index) => {
    const path = `${label}[${index}]`;
    const fields = ["source_content_pointer", "action", "category", "reason_code"];
    exactObject(entry, options.withImpact ? [...fields, "review_impact"] : fields, [], path);
    if (typeof entry.source_content_pointer !== "string" || !JSON_POINTER.test(entry.source_content_pointer)) {
      fail(ARTIFACT_DERIVATION_ERROR_CODES.pointerInvalid, `${path}.source_content_pointer must be a non-root JSON Pointer`);
    }
    if (!ACTIONS.has(entry.action)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${path}.action is invalid`);
    if (!CATEGORIES.has(entry.category)) fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${path}.category is invalid`);
    const reviewImpact = ACTION_IMPACT[entry.action];
    if (options.withImpact && entry.review_impact !== reviewImpact) {
      fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, `${path}.review_impact is inconsistent with action`);
    }
    return {
      source_content_pointer: entry.source_content_pointer,
      action: entry.action,
      category: entry.category,
      reason_code: requireId(entry.reason_code, `${path}.reason_code`),
      review_impact: reviewImpact
    };
  }).sort((left, right) => left.source_content_pointer.localeCompare(right.source_content_pointer));
  if (new Set(normalized.map(({ source_content_pointer: pointer }) => pointer)).size !== normalized.length) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.pointerDuplicate, `${label} contains duplicate source content pointers`);
  }
  return normalized;
}

function summarize(redactions) {
  return {
    declared_field_count: redactions.length,
    omitted_field_count: redactions.filter(({ action }) => action === "remove").length,
    transformed_field_count: redactions.filter(({ action }) => action !== "remove").length,
    categories: [...new Set(redactions.map(({ category }) => category))].sort(),
    raw_values_included: false
  };
}

function reviewEffect(redactions) {
  const impactCodes = [...new Set(redactions.map(({ review_impact: impact }) => impact))].sort();
  return {
    public_review_scope: "derived-artifact-and-lineage-only",
    private_source_required_for_full_review: true,
    disclosed_impact_codes: impactCodes,
    limitations: [
      ...impactCodes.map((impact) => IMPACT_LIMITATION[impact]),
      "full source reproduction requires separately authorized private access"
    ],
    source_content_bytes_verified_by_record: false
  };
}

function descriptorOf(artifact) {
  return {
    artifact_ref: referenceOf(artifact),
    object_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(artifact)),
    content_fingerprint: artifact.content_fingerprint,
    classification: artifact.classification
  };
}

function normalizeDescriptor(value, label, expectedClassification) {
  exactObject(value, ["artifact_ref", "object_fingerprint", "content_fingerprint", "classification"], [], label);
  const descriptor = {
    artifact_ref: normalizeReference(value.artifact_ref, `${label}.artifact_ref`),
    object_fingerprint: requireHash(value.object_fingerprint, `${label}.object_fingerprint`),
    content_fingerprint: requireHash(value.content_fingerprint, `${label}.content_fingerprint`),
    classification: value.classification
  };
  if (descriptor.classification !== expectedClassification) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.classificationInvalid, `${label}.classification must be ${expectedClassification}`);
  }
  return descriptor;
}

function bodyOf(input) {
  return {
    schema_version: ARTIFACT_DERIVATION_VERSION,
    record_type: "artifact_derivation_record",
    derivation_id: input.derivationId,
    version: input.version,
    tenant_id: input.tenantId,
    created_by: input.createdBy,
    created_at: input.createdAt,
    source_artifact: input.sourceDescriptor,
    derived_artifact: input.derivedDescriptor,
    policy: input.policy,
    redactions: input.redactions,
    redaction_summary: summarize(input.redactions),
    review_effect: reviewEffect(input.redactions),
    source_content_included: false,
    hidden_values_included: false,
    authenticity_verified: false,
    authorization_verified: false,
    certification_issued: false
  };
}

function assertLineage(sourceArtifact, derivedArtifact) {
  if (sourceArtifact.tenant_id !== derivedArtifact.tenant_id) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.tenantMismatch, "source and derived artifacts must belong to the same tenant");
  }
  const sourceReference = referenceOf(sourceArtifact);
  if (referenceKey(sourceReference) === referenceKey(referenceOf(derivedArtifact))) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, "source and derived artifacts must have distinct identities");
  }
  if (!derivedArtifact.derived_from.some((reference) => referenceKey(reference) === referenceKey(sourceReference))) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.lineageMissing, "derivedArtifact.derived_from must include the exact source artifact version");
  }
  if (Date.parse(derivedArtifact.created_at) < Date.parse(sourceArtifact.created_at)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.timeOrderInvalid, "derivedArtifact.created_at cannot precede sourceArtifact.created_at");
  }
}

export function createArtifactDerivationRecord(input) {
  exactObject(input, [
    "derivationId",
    "version",
    "createdBy",
    "createdAt",
    "sourceArtifact",
    "derivedArtifact",
    "policy",
    "redactions"
  ], [], "input");
  const sourceArtifact = normalizeArtifact(input.sourceArtifact, "sourceArtifact", { classification: "restricted", visibility: "private" });
  const derivedArtifact = normalizeArtifact(input.derivedArtifact, "derivedArtifact", { classification: "public", visibility: "public" });
  assertLineage(sourceArtifact, derivedArtifact);
  const redactions = normalizeRedactions(input.redactions);
  const createdAt = canonicalInstant(input.createdAt, "input.createdAt");
  if (Date.parse(createdAt) < Date.parse(derivedArtifact.created_at)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.timeOrderInvalid, "input.createdAt cannot precede derivedArtifact.created_at");
  }
  const body = bodyOf({
    derivationId: requireId(input.derivationId, "input.derivationId"),
    version: requireSemver(input.version, "input.version"),
    tenantId: sourceArtifact.tenant_id,
    createdBy: requireId(input.createdBy, "input.createdBy"),
    createdAt,
    sourceDescriptor: descriptorOf(sourceArtifact),
    derivedDescriptor: descriptorOf(derivedArtifact),
    policy: normalizePolicy(input.policy),
    redactions
  });
  return deepFreeze({ ...body, record_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(body)) });
}

export function inspectArtifactDerivationRecord(record) {
  const bodyFields = [
    "schema_version",
    "record_type",
    "derivation_id",
    "version",
    "tenant_id",
    "created_by",
    "created_at",
    "source_artifact",
    "derived_artifact",
    "policy",
    "redactions",
    "redaction_summary",
    "review_effect",
    "source_content_included",
    "hidden_values_included",
    "authenticity_verified",
    "authorization_verified",
    "certification_issued"
  ];
  exactObject(record, [...bodyFields, "record_fingerprint"], [], "record");
  if (record.schema_version !== ARTIFACT_DERIVATION_VERSION || record.record_type !== "artifact_derivation_record") {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, "record is not an Artifact Derivation Record v1");
  }
  requireId(record.derivation_id, "record.derivation_id");
  requireSemver(record.version, "record.version");
  requireId(record.tenant_id, "record.tenant_id");
  requireId(record.created_by, "record.created_by");
  canonicalInstant(record.created_at, "record.created_at");
  const sourceDescriptor = normalizeDescriptor(record.source_artifact, "record.source_artifact", "restricted");
  const derivedDescriptor = normalizeDescriptor(record.derived_artifact, "record.derived_artifact", "public");
  if (sourceDescriptor.artifact_ref.tenant_id !== record.tenant_id || derivedDescriptor.artifact_ref.tenant_id !== record.tenant_id) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.tenantMismatch, "record artifact references must match record.tenant_id");
  }
  if (referenceKey(sourceDescriptor.artifact_ref) === referenceKey(derivedDescriptor.artifact_ref)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.artifactInvalid, "record source and derived artifact references must be distinct");
  }
  const redactions = normalizeRedactions(record.redactions, "record.redactions", { withImpact: true }).map((entry) => ({ ...entry }));
  if (canonicalizeEvidenceValue(record.redactions) !== canonicalizeEvidenceValue(redactions)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, "record.redactions must use canonical pointer order");
  }
  const policy = normalizePolicy(record.policy, "record.policy");
  const expected = bodyOf({
    derivationId: record.derivation_id,
    version: record.version,
    tenantId: record.tenant_id,
    createdBy: record.created_by,
    createdAt: record.created_at,
    sourceDescriptor,
    derivedDescriptor,
    policy,
    redactions
  });
  if (canonicalizeEvidenceValue(record.redaction_summary) !== canonicalizeEvidenceValue(expected.redaction_summary)
    || canonicalizeEvidenceValue(record.review_effect) !== canonicalizeEvidenceValue(expected.review_effect)
    || record.source_content_included !== false
    || record.hidden_values_included !== false
    || record.authenticity_verified !== false
    || record.authorization_verified !== false
    || record.certification_issued !== false) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.inputInvalid, "record contains an inconsistent summary, review effect, or trust boundary");
  }
  const body = Object.fromEntries(bodyFields.map((field) => [field, record[field]]));
  const expectedFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(body));
  if (record.record_fingerprint !== expectedFingerprint) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.fingerprintMismatch, "record.record_fingerprint does not match the canonical record body");
  }
  return deepFreeze({
    schema_version: ARTIFACT_DERIVATION_VERSION,
    derivation_id: record.derivation_id,
    record_fingerprint: record.record_fingerprint,
    record_integrity_verified: true,
    lineage_claim_consistent: true,
    redaction_disclosure_verified: true,
    source_artifact_verified: false,
    derived_artifact_verified: false,
    source_content_bytes_verified: false,
    derived_content_bytes_verified: false,
    authenticity_verified: false,
    authorization_verified: false,
    certification_issued: false,
    review_effect: record.review_effect
  });
}

export function verifyArtifactDerivationRecord(input) {
  exactObject(input, ["record", "sourceArtifact", "derivedArtifact"], ["expectedPolicyFingerprint"], "input");
  const inspection = inspectArtifactDerivationRecord(input.record);
  const sourceArtifact = normalizeArtifact(input.sourceArtifact, "sourceArtifact", { classification: "restricted", visibility: "private" });
  const derivedArtifact = normalizeArtifact(input.derivedArtifact, "derivedArtifact", { classification: "public", visibility: "public" });
  assertLineage(sourceArtifact, derivedArtifact);
  const sourceDescriptor = descriptorOf(sourceArtifact);
  const derivedDescriptor = descriptorOf(derivedArtifact);
  if (canonicalizeEvidenceValue(sourceDescriptor) !== canonicalizeEvidenceValue(input.record.source_artifact)
    || canonicalizeEvidenceValue(derivedDescriptor) !== canonicalizeEvidenceValue(input.record.derived_artifact)) {
    fail(ARTIFACT_DERIVATION_ERROR_CODES.fingerprintMismatch, "artifact metadata does not match the derivation record descriptors");
  }
  let policyAnchorVerified = false;
  if (input.expectedPolicyFingerprint !== undefined) {
    const expected = requireHash(input.expectedPolicyFingerprint, "input.expectedPolicyFingerprint");
    if (expected !== input.record.policy.fingerprint) {
      fail(ARTIFACT_DERIVATION_ERROR_CODES.policyAnchorMismatch, "policy fingerprint does not match the caller-supplied anchor");
    }
    policyAnchorVerified = true;
  }
  return deepFreeze({
    ...inspection,
    source_artifact_verified: true,
    derived_artifact_verified: true,
    exact_version_lineage_verified: true,
    policy_anchor_verified: policyAnchorVerified
  });
}
