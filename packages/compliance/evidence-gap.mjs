import { fingerprint } from "../agent-control/protocol.mjs";

export const EVIDENCE_GAP_REPORT_VERSION = "1.0.0";
export const EVIDENCE_GAP_TYPES = Object.freeze(["missing", "stale", "conflicting", "unsigned"]);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const ORIGINS = new Set(["declared", "measured", "synthetic"]);
const VERIFICATION_STATUSES = new Set(["verified", "invalid", "unknown"]);
const GAP_ORDER = new Map(EVIDENCE_GAP_TYPES.map((type, index) => [type, index]));

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, code) {
  if (!isObject(value)) fail(`${code}_object_invalid`, `${code} must be a plain object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${code}_field_unknown`, `${code}.${key} is not allowed`);
  for (const key of fields) if (!Object.hasOwn(value, key)) fail(`${code}_field_missing`, `${code}.${key} is required`);
}

function requireText(value, field, pattern = ID) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${field}_invalid`, `${field} is invalid`);
  return value;
}

function requireHash(value, field) {
  return requireText(value, field, HASH);
}

function requireInstant(value, field) {
  if (typeof value !== "string") fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  return parsed;
}

function requirePositiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(`${field}_invalid`, `${field} must be a positive safe integer no greater than ${maximum}`);
  return value;
}

function uniqueTexts(value, field, { minimum = 0 } = {}) {
  if (!Array.isArray(value) || value.length < minimum) fail(`${field}_invalid`, `${field} must be an array with at least ${minimum} value(s)`);
  const items = value.map((item, index) => requireText(item, `${field}_${index}`));
  if (new Set(items).size !== items.length) fail(`${field}_duplicate`, `${field} values must be unique`);
  return items.slice().sort(compareText);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeContext(value, code) {
  exactObject(value, ["tenant_id", "workload_id", "execution_id"], code);
  return {
    tenant_id: requireText(value.tenant_id, `${code}_tenant_id`),
    workload_id: requireText(value.workload_id, `${code}_workload_id`),
    execution_id: requireText(value.execution_id, `${code}_execution_id`)
  };
}

function assertContext(actual, expected, code) {
  for (const [field, label] of [["tenant_id", "tenant"], ["workload_id", "workload"], ["execution_id", "execution"]]) {
    if (actual[field] !== expected[field]) fail(`${code}_${label}_mismatch`, `${code} belongs to another ${label}`);
  }
}

function normalizeRequirement(value, index) {
  const code = `evidence_requirement_${index}`;
  exactObject(value, ["requirement_id", "evidence_kind", "max_age_seconds", "minimum_verified_signatures", "allowed_signer_roles"], code);
  return {
    requirement_id: requireText(value.requirement_id, `${code}_id`),
    evidence_kind: requireText(value.evidence_kind, `${code}_kind`),
    max_age_seconds: requirePositiveInteger(value.max_age_seconds, `${code}_max_age_seconds`, 31_536_000),
    minimum_verified_signatures: requirePositiveInteger(value.minimum_verified_signatures, `${code}_minimum_verified_signatures`, 16),
    allowed_signer_roles: uniqueTexts(value.allowed_signer_roles, `${code}_allowed_signer_roles`, { minimum: 1 })
  };
}

function normalizePolicy(value) {
  exactObject(value, ["policy_id", "policy_version", "requirements"], "evidence_policy");
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) fail("evidence_requirements_empty", "evidence policy must declare at least one requirement");
  const requirements = value.requirements.map(normalizeRequirement).sort((left, right) => compareText(left.requirement_id, right.requirement_id));
  if (new Set(requirements.map(({ requirement_id: id }) => id)).size !== requirements.length) fail("evidence_requirement_id_duplicate", "evidence requirement IDs must be unique");
  const policy = {
    policy_id: requireText(value.policy_id, "evidence_policy_id"),
    policy_version: requireText(value.policy_version, "evidence_policy_version"),
    requirements
  };
  return { ...policy, policy_fingerprint: fingerprint(policy) };
}

function normalizeEvidence(value, index) {
  const code = `evidence_record_${index}`;
  exactObject(value, ["evidence_id", "requirement_id", "evidence_kind", "subject", "observed_at", "claim_fingerprint", "content_fingerprint", "evidence_origin"], code);
  const evidenceOrigin = requireText(value.evidence_origin, `${code}_origin`);
  if (!ORIGINS.has(evidenceOrigin)) fail(`${code}_origin_invalid`, `${code}.evidence_origin must be declared, measured, or synthetic`);
  return {
    evidence_id: requireText(value.evidence_id, `${code}_id`),
    requirement_id: requireText(value.requirement_id, `${code}_requirement_id`),
    evidence_kind: requireText(value.evidence_kind, `${code}_kind`),
    subject: normalizeContext(value.subject, `${code}_subject`),
    observed_at: requireInstant(value.observed_at, `${code}_observed_at`).toISOString(),
    claim_fingerprint: requireHash(value.claim_fingerprint, `${code}_claim_fingerprint`),
    content_fingerprint: requireHash(value.content_fingerprint, `${code}_content_fingerprint`),
    evidence_origin: evidenceOrigin
  };
}

function normalizeVerification(value, index) {
  const code = `signature_verification_${index}`;
  exactObject(value, ["verification_id", "evidence_id", "status", "signer_id", "signer_role", "key_id", "verifier_id", "verified_at", "signature_fingerprint"], code);
  const status = requireText(value.status, `${code}_status`);
  if (!VERIFICATION_STATUSES.has(status)) fail(`${code}_status_invalid`, `${code}.status must be verified, invalid, or unknown`);
  return {
    verification_id: requireText(value.verification_id, `${code}_id`),
    evidence_id: requireText(value.evidence_id, `${code}_evidence_id`),
    status,
    signer_id: requireText(value.signer_id, `${code}_signer_id`),
    signer_role: requireText(value.signer_role, `${code}_signer_role`),
    key_id: requireText(value.key_id, `${code}_key_id`),
    verifier_id: requireText(value.verifier_id, `${code}_verifier_id`),
    verified_at: requireInstant(value.verified_at, `${code}_verified_at`).toISOString(),
    signature_fingerprint: requireHash(value.signature_fingerprint, `${code}_signature_fingerprint`)
  };
}

function normalizeAssessment(value, expectedContext, evaluatedAt) {
  exactObject(value, ["schema_version", "assessment_id", "policy", "subject", "evidence", "signature_verifications"], "evidence_assessment");
  if (value.schema_version !== EVIDENCE_GAP_REPORT_VERSION) fail("evidence_assessment_schema_version_invalid", `schema_version must equal ${EVIDENCE_GAP_REPORT_VERSION}`);
  const policy = normalizePolicy(value.policy);
  const subject = normalizeContext(value.subject, "evidence_assessment_subject");
  assertContext(subject, expectedContext, "evidence_assessment_subject");
  if (!Array.isArray(value.evidence)) fail("evidence_records_invalid", "evidence must be an array");
  if (!Array.isArray(value.signature_verifications)) fail("signature_verifications_invalid", "signature_verifications must be an array");
  const evidence = value.evidence.map(normalizeEvidence).sort((left, right) => compareText(left.evidence_id, right.evidence_id));
  const verifications = value.signature_verifications.map(normalizeVerification).sort((left, right) => compareText(left.verification_id, right.verification_id));

  if (new Set(evidence.map(({ evidence_id: id }) => id)).size !== evidence.length) fail("evidence_id_duplicate", "evidence IDs must be unique");
  if (new Set(verifications.map(({ verification_id: id }) => id)).size !== verifications.length) fail("signature_verification_id_duplicate", "signature verification IDs must be unique");
  const requirements = new Map(policy.requirements.map((requirement) => [requirement.requirement_id, requirement]));
  const evidenceById = new Map(evidence.map((record) => [record.evidence_id, record]));
  for (const record of evidence) {
    assertContext(record.subject, expectedContext, `evidence_${record.evidence_id}`);
    const requirement = requirements.get(record.requirement_id);
    if (!requirement) fail("evidence_requirement_unknown", `evidence ${record.evidence_id} references an unknown requirement`);
    if (record.evidence_kind !== requirement.evidence_kind) fail("evidence_kind_mismatch", `evidence ${record.evidence_id} does not match its requirement kind`);
    if (new Date(record.observed_at).getTime() > evaluatedAt.getTime()) fail("evidence_observed_in_future", `evidence ${record.evidence_id} was observed after the evaluation time`);
  }
  const signerKeys = new Set();
  for (const verification of verifications) {
    if (!evidenceById.has(verification.evidence_id)) fail("signature_evidence_unknown", `signature verification ${verification.verification_id} references unknown evidence`);
    const uniqueKey = `${verification.evidence_id}\u0000${verification.signer_id}\u0000${verification.key_id}`;
    if (signerKeys.has(uniqueKey)) fail("signature_verification_duplicate", `evidence ${verification.evidence_id} repeats a signer and key`);
    signerKeys.add(uniqueKey);
  }

  const assessment = {
    schema_version: EVIDENCE_GAP_REPORT_VERSION,
    assessment_id: requireText(value.assessment_id, "evidence_assessment_id"),
    policy: {
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      requirements: policy.requirements
    },
    subject,
    evidence,
    signature_verifications: verifications
  };
  return { ...assessment, policy_fingerprint: policy.policy_fingerprint, assessment_fingerprint: fingerprint(assessment) };
}

function deriveEvidenceOrigin(evidence) {
  if (evidence.length === 0) return "none";
  const origins = new Set(evidence.map(({ evidence_origin: origin }) => origin));
  return origins.size === 1 ? origins.values().next().value : "mixed";
}

function withGapFingerprint(gap) {
  return Object.freeze({ ...gap, gap_fingerprint: fingerprint(gap) });
}

function compareGaps(left, right) {
  return GAP_ORDER.get(left.type) - GAP_ORDER.get(right.type)
    || compareText(left.requirement_id, right.requirement_id)
    || compareText(left.evidence_ids[0] ?? "", right.evidence_ids[0] ?? "");
}

function acceptedSignatureCount(record, requirement, verifications, trustedVerifierIds, evaluatedAt) {
  const allowedRoles = new Set(requirement.allowed_signer_roles);
  const trusted = new Set(trustedVerifierIds);
  const accepted = new Set();
  for (const verification of verifications) {
    if (verification.evidence_id !== record.evidence_id
      || verification.status !== "verified"
      || !trusted.has(verification.verifier_id)
      || !allowedRoles.has(verification.signer_role)) continue;
    const verifiedAt = new Date(verification.verified_at).getTime();
    if (verifiedAt < new Date(record.observed_at).getTime() || verifiedAt > evaluatedAt.getTime()) continue;
    accepted.add(`${verification.signer_id}\u0000${verification.key_id}`);
  }
  return accepted.size;
}

export function inspectEvidenceGaps(assessmentInput, options = {}) {
  exactObject(options, ["expectedContext", "evaluatedAt", "trustedVerifierIds"], "evidence_inspection_options");
  const expectedContext = normalizeContext(options.expectedContext, "evidence_expected_context");
  if (!(options.evaluatedAt instanceof Date) || Number.isNaN(options.evaluatedAt.valueOf())) fail("evidence_evaluated_at_invalid", "evaluatedAt must be a valid Date supplied by the caller");
  const evaluatedAt = new Date(options.evaluatedAt.getTime());
  const trustedVerifierIds = uniqueTexts(options.trustedVerifierIds, "evidence_trusted_verifier_ids");
  const assessment = normalizeAssessment(assessmentInput, expectedContext, evaluatedAt);
  const evidenceByRequirement = new Map(assessment.policy.requirements.map(({ requirement_id: id }) => [id, []]));
  for (const record of assessment.evidence) evidenceByRequirement.get(record.requirement_id).push(record);

  const gaps = [];
  let freshEvidenceCount = 0;
  let staleEvidenceCount = 0;
  let signatureSufficientEvidenceCount = 0;
  let signatureDeficientEvidenceCount = 0;
  let conflictingRequirementCount = 0;

  for (const requirement of assessment.policy.requirements) {
    const records = evidenceByRequirement.get(requirement.requirement_id);
    if (records.length === 0) {
      gaps.push(withGapFingerprint({
        type: "missing",
        requirement_id: requirement.requirement_id,
        evidence_ids: [],
        expected_evidence_kind: requirement.evidence_kind
      }));
      continue;
    }

    const claims = new Set(records.map(({ claim_fingerprint: value }) => value));
    if (claims.size > 1) {
      conflictingRequirementCount += 1;
      gaps.push(withGapFingerprint({
        type: "conflicting",
        requirement_id: requirement.requirement_id,
        evidence_ids: records.map(({ evidence_id: id }) => id).sort(),
        claim_fingerprints: [...claims].sort()
      }));
    }

    for (const record of records) {
      const ageMilliseconds = evaluatedAt.getTime() - new Date(record.observed_at).getTime();
      const maxAgeMilliseconds = requirement.max_age_seconds * 1000;
      if (ageMilliseconds > maxAgeMilliseconds) {
        staleEvidenceCount += 1;
        gaps.push(withGapFingerprint({
          type: "stale",
          requirement_id: requirement.requirement_id,
          evidence_ids: [record.evidence_id],
          observed_at: record.observed_at,
          age_milliseconds: ageMilliseconds,
          max_age_milliseconds: maxAgeMilliseconds
        }));
      } else {
        freshEvidenceCount += 1;
      }

      const submitted = assessment.signature_verifications.filter(({ evidence_id: id }) => id === record.evidence_id).length;
      const accepted = acceptedSignatureCount(record, requirement, assessment.signature_verifications, trustedVerifierIds, evaluatedAt);
      if (accepted < requirement.minimum_verified_signatures) {
        signatureDeficientEvidenceCount += 1;
        gaps.push(withGapFingerprint({
          type: "unsigned",
          requirement_id: requirement.requirement_id,
          evidence_ids: [record.evidence_id],
          submitted_signature_verifications: submitted,
          accepted_verified_signatures: accepted,
          minimum_verified_signatures: requirement.minimum_verified_signatures,
          allowed_signer_roles: requirement.allowed_signer_roles
        }));
      } else {
        signatureSufficientEvidenceCount += 1;
      }
    }
  }

  gaps.sort(compareGaps);
  const requirementsSatisfied = gaps.length === 0;
  const body = {
    schema_version: EVIDENCE_GAP_REPORT_VERSION,
    assessment_id: assessment.assessment_id,
    assessment_fingerprint: assessment.assessment_fingerprint,
    policy_id: assessment.policy.policy_id,
    policy_version: assessment.policy.policy_version,
    policy_fingerprint: assessment.policy_fingerprint,
    subject: assessment.subject,
    evaluated_at: evaluatedAt.toISOString(),
    trusted_verifier_ids: trustedVerifierIds,
    evidence_origin: deriveEvidenceOrigin(assessment.evidence),
    default_deny: true,
    status: requirementsSatisfied ? "requirements_satisfied" : "not_satisfied",
    requirements_satisfied: requirementsSatisfied,
    gap_count: gaps.length,
    gaps,
    summary: {
      requirement_count: assessment.policy.requirements.length,
      submitted_evidence_count: assessment.evidence.length,
      fresh_evidence_count: freshEvidenceCount,
      stale_evidence_count: staleEvidenceCount,
      signature_sufficient_evidence_count: signatureSufficientEvidenceCount,
      signature_deficient_evidence_count: signatureDeficientEvidenceCount,
      conflicting_requirement_count: conflictingRequirementCount
    },
    authorization_verified: false,
    legal_or_certification_conclusion: false
  };
  return Object.freeze({ ...body, report_fingerprint: fingerprint(body) });
}
