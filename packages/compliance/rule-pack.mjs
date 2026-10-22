import { fingerprint } from "../agent-control/protocol.mjs";

export const COMPLIANCE_RULE_PACK_VERSION = "1.0.0";
export const COMPLIANCE_RULE_DOMAINS = Object.freeze(["mlps", "data_boundary", "enterprise"]);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const URL = /^https:\/\/[^\s]+$/;
const DOMAIN_SET = new Set(COMPLIANCE_RULE_DOMAINS);
const OBSERVATION_STATUSES = new Set(["evidence_present", "evidence_missing", "not_observed"]);

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

function requireNarrative(value, field) {
  if (typeof value !== "string" || value.trim() !== value || value.length < 4 || value.length > 500 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${field}_invalid`, `${field} must be trimmed text between 4 and 500 characters`);
  }
  return value;
}

function requireInstant(value, field) {
  if (typeof value !== "string") fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(`${field}_invalid`, `${field} must be an ISO-8601 UTC instant`);
  return parsed.toISOString();
}

function uniqueTexts(value, field, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) fail(`${field}_invalid`, `${field} must contain at least ${minimum} value(s)`);
  const normalized = value.map((item, index) => requireText(item, `${field}_${index}`)).sort(compareText);
  if (new Set(normalized).size !== normalized.length) fail(`${field}_duplicate`, `${field} values must be unique`);
  return normalized;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseSemver(value, field) {
  const match = typeof value === "string" ? value.match(SEMVER) : null;
  if (!match) fail(`${field}_invalid`, `${field} must be a strict semantic version`);
  return { text: value, parts: match.slice(1).map(Number) };
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function normalizeSupersedes(value) {
  if (value === null) return null;
  exactObject(value, ["pack_id", "pack_version", "pack_fingerprint"], "rule_pack_supersedes");
  parseSemver(value.pack_version, "rule_pack_supersedes_version");
  return {
    pack_id: requireText(value.pack_id, "rule_pack_supersedes_id"),
    pack_version: value.pack_version,
    pack_fingerprint: requireText(value.pack_fingerprint, "rule_pack_supersedes_fingerprint", HASH)
  };
}

function normalizeIssuer(value) {
  exactObject(value, ["name", "authority_type", "reference_url"], "rule_pack_issuer");
  if (!new Set(["project_reference", "customer_defined"]).has(value.authority_type)) {
    fail("rule_pack_issuer_authority_invalid", "issuer.authority_type must be project_reference or customer_defined");
  }
  if (value.reference_url !== null) requireText(value.reference_url, "rule_pack_issuer_reference_url", URL);
  return {
    name: requireNarrative(value.name, "rule_pack_issuer_name"),
    authority_type: value.authority_type,
    reference_url: value.reference_url
  };
}

function normalizeScope(value) {
  exactObject(value, ["jurisdictions", "workload_types", "notes"], "rule_pack_scope");
  return {
    jurisdictions: uniqueTexts(value.jurisdictions, "rule_pack_scope_jurisdictions"),
    workload_types: uniqueTexts(value.workload_types, "rule_pack_scope_workload_types"),
    notes: requireNarrative(value.notes, "rule_pack_scope_notes")
  };
}

function normalizeMapping(value, index) {
  const code = `rule_pack_mapping_${index}`;
  exactObject(value, ["mapping_id", "domain", "source_framework", "source_control_refs", "target_control_ids", "evidence_kinds", "rationale", "assessment_required"], code);
  const domain = requireText(value.domain, `${code}_domain`);
  if (!DOMAIN_SET.has(domain)) fail(`${code}_domain_invalid`, `${code}.domain must be mlps, data_boundary, or enterprise`);
  if (value.assessment_required !== true) fail(`${code}_assessment_required_invalid`, `${code}.assessment_required must be true`);
  return {
    mapping_id: requireText(value.mapping_id, `${code}_id`),
    domain,
    source_framework: requireText(value.source_framework, `${code}_source_framework`),
    source_control_refs: uniqueTexts(value.source_control_refs, `${code}_source_control_refs`),
    target_control_ids: uniqueTexts(value.target_control_ids, `${code}_target_control_ids`),
    evidence_kinds: uniqueTexts(value.evidence_kinds, `${code}_evidence_kinds`),
    rationale: requireNarrative(value.rationale, `${code}_rationale`),
    assessment_required: true
  };
}

function normalizeBoundary(value) {
  exactObject(value, ["mapping_only", "legal_conclusion", "certification_issued", "external_assessment_performed"], "rule_pack_assurance_boundary");
  if (value.mapping_only !== true || value.legal_conclusion !== false || value.certification_issued !== false || value.external_assessment_performed !== false) {
    fail("rule_pack_assurance_boundary_invalid", "rule packs must remain mapping-only and cannot claim legal conclusions, certification, or external assessment");
  }
  return { mapping_only: true, legal_conclusion: false, certification_issued: false, external_assessment_performed: false };
}

function normalizePackPayload(value) {
  exactObject(value, ["schema_version", "pack_id", "pack_version", "title", "description", "data_origin", "published_at", "effective_from", "supersedes", "issuer", "scope", "mappings", "assurance_boundary"], "compliance_rule_pack");
  if (value.schema_version !== COMPLIANCE_RULE_PACK_VERSION) fail("rule_pack_schema_version_invalid", `schema_version must equal ${COMPLIANCE_RULE_PACK_VERSION}`);
  parseSemver(value.pack_version, "rule_pack_version");
  if (!new Set(["reference", "enterprise_declared", "synthetic"]).has(value.data_origin)) fail("rule_pack_data_origin_invalid", "data_origin is invalid");
  const publishedAt = requireInstant(value.published_at, "rule_pack_published_at");
  const effectiveFrom = requireInstant(value.effective_from, "rule_pack_effective_from");
  if (Date.parse(effectiveFrom) < Date.parse(publishedAt)) fail("rule_pack_effective_before_publication", "effective_from cannot precede published_at");
  if (!Array.isArray(value.mappings) || value.mappings.length === 0) fail("rule_pack_mappings_empty", "a rule pack must contain at least one mapping");
  const mappings = value.mappings.map(normalizeMapping).sort((left, right) => compareText(left.mapping_id, right.mapping_id));
  if (new Set(mappings.map(({ mapping_id: id }) => id)).size !== mappings.length) fail("rule_pack_mapping_id_duplicate", "mapping IDs must be unique");
  return {
    schema_version: COMPLIANCE_RULE_PACK_VERSION,
    pack_id: requireText(value.pack_id, "rule_pack_id"),
    pack_version: value.pack_version,
    title: requireNarrative(value.title, "rule_pack_title"),
    description: requireNarrative(value.description, "rule_pack_description"),
    data_origin: value.data_origin,
    published_at: publishedAt,
    effective_from: effectiveFrom,
    supersedes: normalizeSupersedes(value.supersedes),
    issuer: normalizeIssuer(value.issuer),
    scope: normalizeScope(value.scope),
    mappings,
    assurance_boundary: normalizeBoundary(value.assurance_boundary)
  };
}

export function createComplianceRulePack(input) {
  const payload = normalizePackPayload(input);
  return Object.freeze({ ...payload, pack_fingerprint: fingerprint(payload) });
}

export function validateComplianceRulePack(input) {
  if (!isObject(input)) fail("compliance_rule_pack_object_invalid", "compliance rule pack must be a plain object");
  const { pack_fingerprint: suppliedFingerprint, ...payloadInput } = input;
  const payload = normalizePackPayload(payloadInput);
  const expectedFingerprint = fingerprint(payload);
  if (!HASH.test(suppliedFingerprint ?? "") || suppliedFingerprint !== expectedFingerprint) {
    fail("rule_pack_fingerprint_mismatch", "rule pack fingerprint does not match canonical content");
  }
  return Object.freeze({ ...payload, pack_fingerprint: expectedFingerprint });
}

export function verifyComplianceRulePackUpgrade(previousInput, nextInput) {
  const previous = validateComplianceRulePack(previousInput);
  const next = validateComplianceRulePack(nextInput);
  if (previous.pack_id !== next.pack_id) fail("rule_pack_upgrade_id_mismatch", "rule pack upgrades must retain pack_id");
  if (compareSemver(parseSemver(next.pack_version, "next_pack_version").parts, parseSemver(previous.pack_version, "previous_pack_version").parts) <= 0) {
    fail("rule_pack_upgrade_version_not_greater", "next rule pack version must be greater than the previous version");
  }
  if (!next.supersedes
    || next.supersedes.pack_id !== previous.pack_id
    || next.supersedes.pack_version !== previous.pack_version
    || next.supersedes.pack_fingerprint !== previous.pack_fingerprint) {
    fail("rule_pack_upgrade_chain_mismatch", "next rule pack must fingerprint the exact version it supersedes");
  }
  return Object.freeze({ valid: true, pack_id: next.pack_id, previous_version: previous.pack_version, next_version: next.pack_version, previous_fingerprint: previous.pack_fingerprint, next_fingerprint: next.pack_fingerprint });
}

function normalizeSubject(value, code) {
  exactObject(value, ["tenant_id", "workload_id", "declaration_id", "declaration_version"], code);
  if (!Number.isSafeInteger(value.declaration_version) || value.declaration_version < 1) fail(`${code}_declaration_version_invalid`, "declaration_version must be a positive safe integer");
  return {
    tenant_id: requireText(value.tenant_id, `${code}_tenant_id`),
    workload_id: requireText(value.workload_id, `${code}_workload_id`),
    declaration_id: requireText(value.declaration_id, `${code}_declaration_id`),
    declaration_version: value.declaration_version
  };
}

function normalizeEvidenceRef(value, code) {
  exactObject(value, ["evidence_id", "evidence_kind", "content_fingerprint"], code);
  return {
    evidence_id: requireText(value.evidence_id, `${code}_id`),
    evidence_kind: requireText(value.evidence_kind, `${code}_kind`),
    content_fingerprint: requireText(value.content_fingerprint, `${code}_fingerprint`, HASH)
  };
}

function normalizeObservation(value, index) {
  const code = `control_observation_${index}`;
  exactObject(value, ["control_id", "status", "evidence_refs"], code);
  const status = requireText(value.status, `${code}_status`);
  if (!OBSERVATION_STATUSES.has(status)) fail(`${code}_status_invalid`, `${code}.status is invalid`);
  if (!Array.isArray(value.evidence_refs)) fail(`${code}_evidence_refs_invalid`, `${code}.evidence_refs must be an array`);
  const evidenceRefs = value.evidence_refs.map((item, evidenceIndex) => normalizeEvidenceRef(item, `${code}_evidence_${evidenceIndex}`)).sort((left, right) => compareText(left.evidence_id, right.evidence_id));
  if (new Set(evidenceRefs.map(({ evidence_id: id }) => id)).size !== evidenceRefs.length) fail(`${code}_evidence_duplicate`, `${code} repeats an evidence ID`);
  if (status === "evidence_present" && evidenceRefs.length === 0) fail(`${code}_evidence_required`, `${code} requires evidence for evidence_present`);
  if (status !== "evidence_present" && evidenceRefs.length !== 0) fail(`${code}_evidence_forbidden`, `${code} cannot attach evidence unless status is evidence_present`);
  return { control_id: requireText(value.control_id, `${code}_control_id`), status, evidence_refs: evidenceRefs };
}

function assertSubject(actual, expected) {
  for (const field of ["tenant_id", "workload_id", "declaration_id", "declaration_version"]) {
    if (actual[field] !== expected[field]) fail(`rule_mapping_${field}_mismatch`, `mapping input belongs to another ${field}`);
  }
}

export function mapComplianceRulePack(packInput, observationInput, options = {}) {
  exactObject(options, ["expectedSubject", "evaluatedAt"], "rule_mapping_options");
  if (!(options.evaluatedAt instanceof Date) || Number.isNaN(options.evaluatedAt.valueOf())) fail("rule_mapping_evaluated_at_invalid", "evaluatedAt must be a valid Date supplied by the caller");
  const pack = validateComplianceRulePack(packInput);
  exactObject(observationInput, ["schema_version", "evaluation_id", "subject", "control_observations"], "rule_mapping_input");
  if (observationInput.schema_version !== COMPLIANCE_RULE_PACK_VERSION) fail("rule_mapping_schema_version_invalid", `schema_version must equal ${COMPLIANCE_RULE_PACK_VERSION}`);
  const subject = normalizeSubject(observationInput.subject, "rule_mapping_subject");
  const expectedSubject = normalizeSubject(options.expectedSubject, "rule_mapping_expected_subject");
  assertSubject(subject, expectedSubject);
  if (!Array.isArray(observationInput.control_observations)) fail("control_observations_invalid", "control_observations must be an array");
  const observations = observationInput.control_observations.map(normalizeObservation).sort((left, right) => compareText(left.control_id, right.control_id));
  if (new Set(observations.map(({ control_id: id }) => id)).size !== observations.length) fail("control_observation_duplicate", "control observations must use unique control IDs");
  const byControl = new Map(observations.map((observation) => [observation.control_id, observation]));
  const mappings = pack.mappings.map((mapping) => {
    const selected = mapping.target_control_ids.map((controlId) => byControl.get(controlId) ?? { control_id: controlId, status: "not_observed", evidence_refs: [] });
    const status = selected.some((item) => item.status === "evidence_missing")
      ? "evidence_missing"
      : selected.every((item) => item.status === "evidence_present")
        ? "evidence_present"
        : "not_evaluated";
    const evidenceRefs = selected.flatMap((item) => item.evidence_refs).sort((left, right) => compareText(left.evidence_id, right.evidence_id));
    const result = {
      mapping_id: mapping.mapping_id,
      domain: mapping.domain,
      source_framework: mapping.source_framework,
      source_control_refs: mapping.source_control_refs,
      target_control_ids: mapping.target_control_ids,
      status,
      evidence_refs: evidenceRefs,
      assessment_required: true
    };
    return { ...result, mapping_fingerprint: fingerprint(result) };
  });
  const counts = {
    total: mappings.length,
    evidence_present: mappings.filter(({ status }) => status === "evidence_present").length,
    evidence_missing: mappings.filter(({ status }) => status === "evidence_missing").length,
    not_evaluated: mappings.filter(({ status }) => status === "not_evaluated").length
  };
  const status = counts.evidence_missing > 0 ? "mapped_with_gaps" : counts.not_evaluated > 0 ? "not_evaluated" : "mapped_without_observed_gaps";
  const report = {
    schema_version: COMPLIANCE_RULE_PACK_VERSION,
    evaluation_id: requireText(observationInput.evaluation_id, "rule_mapping_evaluation_id"),
    pack_id: pack.pack_id,
    pack_version: pack.pack_version,
    pack_fingerprint: pack.pack_fingerprint,
    subject,
    evaluated_at: options.evaluatedAt.toISOString(),
    status,
    counts,
    mappings,
    mapping_only: true,
    legal_conclusion: false,
    certification_issued: false,
    external_assessment_performed: false
  };
  return Object.freeze({ ...report, report_fingerprint: fingerprint(report) });
}
