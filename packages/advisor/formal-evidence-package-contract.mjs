import { createHash } from "node:crypto";

export const ADVISOR_FORMAL_PACKAGE_CONTRACT_SCHEMA_VERSION = "1.0.0";
export const ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION = "1.0.0";
export const ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION = "1.0.0";
export const ADVISOR_FORMAL_PACKAGE_PROFILE_ID = "ct-advisor-gpu-decision-evidence-package/v1";
export const ADVISOR_FORMAL_PACKAGE_CAPABILITY_KEY = "gpu_preprocurement_decision_evidence_package";

const CONTRACT_ID = /^advisor_package_contract_[0-9a-f-]{36}$/;
const PROJECT_ID = /^advisor_project_[0-9a-f-]{36}$/;
const REPORT_ID = /^advisor_basic_report_[0-9a-f-]{36}$/;
const PASSPORT_ID = /^advisor_passport_[0-9a-f-]{36}$/;
const EVALUATION_ID = /^advisor_constraint_evaluation_[0-9a-f-]{36}$/;
const ANALYSIS_ID = /^advisor_analysis_[0-9a-f-]{36}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LOCALES = new Set(["en", "zh-CN"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

export const ADVISOR_FORMAL_PACKAGE_ITEMS = deepFreeze([
  { item_id: "D01", artifact_key: "scope_and_responsibility_boundary", title_en: "Project scope and responsibility boundary", title_zh: "项目范围与责任边界", delivery_kind: "document", required: true, machine_readable_required: false, allowed_formats: ["pdf", "docx"], owner_task: "CT-667" },
  { item_id: "D02", artifact_key: "requirement_passport", title_en: "Requirement Passport", title_zh: "Requirement Passport", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "json"], owner_task: "CT-667" },
  { item_id: "D03", artifact_key: "candidate_and_combination_matrix", title_en: "Candidate and Combination Matrix", title_zh: "候选与组合矩阵", delivery_kind: "dataset", required: true, machine_readable_required: true, allowed_formats: ["xlsx", "csv", "json"], owner_task: "CT-667" },
  { item_id: "D04", artifact_key: "source_ledger_and_gap_register", title_en: "Data Source Ledger and Gap Register", title_zh: "数据来源账本与数据缺口清单", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "csv", "json"], owner_task: "CT-667" },
  { item_id: "D05", artifact_key: "infrastructure_risk_analysis", title_en: "Cost, performance, network, region, and risk analysis", title_zh: "成本、性能、网络、地域与风险分析", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "json"], owner_task: "CT-667" },
  { item_id: "D06", artifact_key: "scenario_pareto_sensitivity_results", title_en: "Scenario, Pareto, and sensitivity results", title_zh: "四情景、Pareto 与敏感性结果", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "csv", "json"], owner_task: "CT-667" },
  { item_id: "D07", artifact_key: "gpu_decision_report", title_en: "GPU Decision Report", title_zh: "GPU Decision Report", delivery_kind: "numbered_document", required: true, machine_readable_required: false, allowed_formats: ["pdf", "docx"], owner_task: "CT-667" },
  { item_id: "D08", artifact_key: "explainable_recommendation", title_en: "Explainable Recommendation", title_zh: "Explainable Recommendation", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "json"], owner_task: "CT-667" },
  { item_id: "D09", artifact_key: "decision_and_approval_record", title_en: "Decision Record and approval record", title_zh: "Decision Record 与审批记录", delivery_kind: "document_and_data", required: true, machine_readable_required: true, allowed_formats: ["pdf", "json"], owner_task: "CT-667" },
  { item_id: "D10", artifact_key: "evidence_package_container", title_en: "Evidence Package", title_zh: "Evidence Package", delivery_kind: "aggregate_container", required: true, machine_readable_required: true, allowed_formats: ["zip", "manifest", "sha256sums"], owner_task: "CT-668" },
  { item_id: "D11", artifact_key: "offline_verification_result", title_en: "Offline verification result", title_zh: "离线验证结果", delivery_kind: "verification_result", required: true, machine_readable_required: true, allowed_formats: ["txt", "json"], owner_task: "CT-668" },
  { item_id: "D12", artifact_key: "raw_transformed_data_and_exit_package", title_en: "Raw data, transformed data, and complete exit package", title_zh: "原始数据、转换数据和完整退出包", delivery_kind: "exit_archive", required: true, machine_readable_required: true, allowed_formats: ["zip"], owner_task: "CT-668" },
  { item_id: "D13", artifact_key: "versioned_product_manual", title_en: "Version-matched product manual", title_zh: "产品使用手册对应版本", delivery_kind: "documentation", required: true, machine_readable_required: false, allowed_formats: ["pdf", "html", "markdown"], owner_task: "CT-673" },
]);

export const ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY = deepFreeze({
  policy_id: "ct-advisor-evidence-package-strict-semver-v1",
  schema_version: ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION,
  profile_version: ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION,
  versioning: "semantic_versioning",
  reader_rule: "same_major_and_reader_not_older",
  unknown_field_policy: "reject",
  patch_change_policy: "clarification_or_non_structural_fix_only",
  minor_change_policy: "additive_optional_change_requires_explicit_reader_support",
  major_change_policy: "required_for_removal_rename_type_or_semantic_break",
  migration_policy: "never_rewrite_issued_bytes_create_a_new_package_revision",
  checksum_policy: "sha256_over_exact_delivered_bytes",
  archive_digest_policy: "archive_digest_is_a_sidecar_and_is_not_self-referenced_by_manifest",
});

export const ADVISOR_FORMAL_PACKAGE_BOUNDARIES = deepFreeze({
  contract_only: true,
  formal_package_generated: false,
  entitlement_granted: false,
  formal_report_issued: false,
  human_decision_recorded: false,
  approval_recorded: false,
  offline_package_assembled: false,
  execution_authorized: false,
  certification_issued: false,
  legal_opinion_issued: false,
  performance_claim_allowed: false,
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const input = typeof value === "string" || value instanceof Uint8Array ? value : canonicalJson(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function clone(value) {
  return structuredClone(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_invalid`, `${label} must be an object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) fail(`${label}_fields_invalid`, `${label} contains missing or unsupported fields`);
}

function requireDigest(value, label) {
  if (!SHA256.test(value || "")) fail(`${label}_invalid`, `${label} must be a sha256 digest`);
  return value;
}

function requireMatch(value, expression, label) {
  if (!expression.test(value || "")) fail(`${label}_invalid`, `${label} is invalid`);
  return value;
}

function parseVersion(value, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value || "");
  if (!match) fail(`${label}_invalid`, `${label} must be a semantic version`);
  return match.slice(1).map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function profileProjection() {
  return {
    profile_id: ADVISOR_FORMAL_PACKAGE_PROFILE_ID,
    profile_version: ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION,
    manifest_schema_version: ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION,
    delivery_items: clone(ADVISOR_FORMAL_PACKAGE_ITEMS),
    compatibility_policy: clone(ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY),
  };
}

export function getAdvisorFormalPackageProfile() {
  const profile = profileProjection();
  return { ...profile, profile_sha256: sha256(profile) };
}

function validateDeliveryItems(items) {
  if (!Array.isArray(items) || items.length !== ADVISOR_FORMAL_PACKAGE_ITEMS.length) {
    fail("formal_package_items_incomplete", "the formal package contract requires exactly 13 delivery items");
  }
  if (canonicalJson(items) !== canonicalJson(ADVISOR_FORMAL_PACKAGE_ITEMS)) {
    fail("formal_package_items_changed", "delivery items do not match the frozen profile");
  }
}

function validateSourceBindings(bindings) {
  exactKeys(bindings, ["analysis", "basic_report", "constraint_evaluation", "requirement_passport"], "formal_package_source_bindings");
  exactKeys(bindings.basic_report, ["content_sha256", "report_id"], "formal_package_basic_report_binding");
  requireMatch(bindings.basic_report.report_id, REPORT_ID, "formal_package_basic_report_id");
  requireDigest(bindings.basic_report.content_sha256, "formal_package_basic_report_sha256");
  exactKeys(bindings.requirement_passport, ["content_sha256", "passport_id", "revision"], "formal_package_passport_binding");
  requireMatch(bindings.requirement_passport.passport_id, PASSPORT_ID, "formal_package_passport_id");
  if (!Number.isInteger(bindings.requirement_passport.revision) || bindings.requirement_passport.revision < 1) fail("formal_package_passport_revision_invalid", "passport revision must be positive");
  requireDigest(bindings.requirement_passport.content_sha256, "formal_package_passport_sha256");
  exactKeys(bindings.constraint_evaluation, ["content_sha256", "evaluation_id"], "formal_package_evaluation_binding");
  requireMatch(bindings.constraint_evaluation.evaluation_id, EVALUATION_ID, "formal_package_evaluation_id");
  requireDigest(bindings.constraint_evaluation.content_sha256, "formal_package_evaluation_sha256");
  exactKeys(bindings.analysis, ["analysis_id", "content_sha256", "method_sha256", "observation_set_sha256"], "formal_package_analysis_binding");
  requireMatch(bindings.analysis.analysis_id, ANALYSIS_ID, "formal_package_analysis_id");
  for (const field of ["content_sha256", "method_sha256", "observation_set_sha256"]) requireDigest(bindings.analysis[field], `formal_package_analysis_${field}`);
}

function contractProjection(contract) {
  return { ...contract, content_sha256: null };
}

export function buildAdvisorFormalEvidencePackageContract({ contractId, projectId, locale, sourceBindings, frozenAt }) {
  requireMatch(contractId, CONTRACT_ID, "formal_package_contract_id");
  requireMatch(projectId, PROJECT_ID, "formal_package_project_id");
  if (!LOCALES.has(locale)) fail("formal_package_locale_invalid", "locale must be en or zh-CN");
  if (!TIMESTAMP.test(frozenAt || "")) fail("formal_package_frozen_at_invalid", "frozenAt must be a UTC timestamp");
  validateSourceBindings(sourceBindings);
  const profile = getAdvisorFormalPackageProfile();
  const contract = {
    schema_version: ADVISOR_FORMAL_PACKAGE_CONTRACT_SCHEMA_VERSION,
    contract_version: "1.0.0",
    contract_type: "ct_advisor_gpu_decision_evidence_package_contract",
    contract_id: contractId,
    capability_key: ADVISOR_FORMAL_PACKAGE_CAPABILITY_KEY,
    project_id: projectId,
    locale,
    state: "contract_frozen",
    frozen_at: frozenAt,
    source_bindings: clone(sourceBindings),
    package_profile: profile,
    manifest_contract: {
      manifest_schema_version: ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION,
      manifest_file: "manifest.json",
      checksum_file: "SHA256SUMS",
      checksum_algorithm: "SHA-256",
      archive_media_type: "application/zip",
      archive_digest_sidecar_required: true,
      container_item_id: "D10",
      container_self_reference_forbidden: true,
    },
    boundaries: clone(ADVISOR_FORMAL_PACKAGE_BOUNDARIES),
    content_sha256: null,
  };
  contract.content_sha256 = sha256(contractProjection(contract));
  return contract;
}

export function validateAdvisorFormalEvidencePackageContract(contract) {
  exactKeys(contract, ["boundaries", "capability_key", "content_sha256", "contract_id", "contract_type", "contract_version", "frozen_at", "locale", "manifest_contract", "package_profile", "project_id", "schema_version", "source_bindings", "state"], "formal_package_contract");
  if (contract.schema_version !== ADVISOR_FORMAL_PACKAGE_CONTRACT_SCHEMA_VERSION || contract.contract_version !== "1.0.0" || contract.contract_type !== "ct_advisor_gpu_decision_evidence_package_contract") fail("formal_package_contract_version_invalid", "formal package contract version is unsupported");
  requireMatch(contract.contract_id, CONTRACT_ID, "formal_package_contract_id");
  requireMatch(contract.project_id, PROJECT_ID, "formal_package_project_id");
  if (contract.capability_key !== ADVISOR_FORMAL_PACKAGE_CAPABILITY_KEY || contract.state !== "contract_frozen" || !LOCALES.has(contract.locale) || !TIMESTAMP.test(contract.frozen_at || "")) fail("formal_package_contract_identity_invalid", "formal package contract identity or state is invalid");
  validateSourceBindings(contract.source_bindings);
  exactKeys(contract.package_profile, ["compatibility_policy", "delivery_items", "manifest_schema_version", "profile_id", "profile_sha256", "profile_version"], "formal_package_profile");
  const expectedProfile = getAdvisorFormalPackageProfile();
  if (contract.package_profile.profile_id !== expectedProfile.profile_id || contract.package_profile.profile_version !== expectedProfile.profile_version || contract.package_profile.manifest_schema_version !== expectedProfile.manifest_schema_version || contract.package_profile.profile_sha256 !== expectedProfile.profile_sha256) fail("formal_package_profile_invalid", "package profile identity or digest is invalid");
  validateDeliveryItems(contract.package_profile.delivery_items);
  if (canonicalJson(contract.package_profile.compatibility_policy) !== canonicalJson(ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY)) fail("formal_package_compatibility_policy_changed", "compatibility policy does not match the frozen profile");
  exactKeys(contract.manifest_contract, ["archive_digest_sidecar_required", "archive_media_type", "checksum_algorithm", "checksum_file", "container_item_id", "container_self_reference_forbidden", "manifest_file", "manifest_schema_version"], "formal_package_manifest_contract");
  if (contract.manifest_contract.manifest_schema_version !== ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION || contract.manifest_contract.manifest_file !== "manifest.json" || contract.manifest_contract.checksum_file !== "SHA256SUMS" || contract.manifest_contract.checksum_algorithm !== "SHA-256" || contract.manifest_contract.archive_media_type !== "application/zip" || contract.manifest_contract.archive_digest_sidecar_required !== true || contract.manifest_contract.container_item_id !== "D10" || contract.manifest_contract.container_self_reference_forbidden !== true) fail("formal_package_manifest_contract_invalid", "manifest contract is invalid");
  if (canonicalJson(contract.boundaries) !== canonicalJson(ADVISOR_FORMAL_PACKAGE_BOUNDARIES)) fail("formal_package_boundary_invalid", "formal package contract boundaries changed");
  requireDigest(contract.content_sha256, "formal_package_contract_sha256");
  if (contract.content_sha256 !== sha256(contractProjection(contract))) fail("formal_package_contract_digest_mismatch", "formal package contract digest does not match its content");
  return { valid: true, contract_frozen: true, artifact_count: 13, profile_sha256: expectedProfile.profile_sha256, content_sha256: contract.content_sha256 };
}

export function assessAdvisorFormalPackageCompatibility({ documentSchemaVersion, documentProfileVersion, readerSchemaVersion = ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION, readerProfileVersion = ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION }) {
  const documentSchema = parseVersion(documentSchemaVersion, "formal_package_document_schema_version");
  const documentProfile = parseVersion(documentProfileVersion, "formal_package_document_profile_version");
  const readerSchema = parseVersion(readerSchemaVersion, "formal_package_reader_schema_version");
  const readerProfile = parseVersion(readerProfileVersion, "formal_package_reader_profile_version");
  const schemaCompatible = documentSchema[0] === readerSchema[0] && compareVersion(documentSchema, readerSchema) <= 0;
  const profileCompatible = documentProfile[0] === readerProfile[0] && compareVersion(documentProfile, readerProfile) <= 0;
  const compatible = schemaCompatible && profileCompatible;
  return {
    compatible,
    policy_id: ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY.policy_id,
    schema_compatible: schemaCompatible,
    profile_compatible: profileCompatible,
    reason: compatible ? "supported" : "unsupported_version_requires_explicit_reader_upgrade",
  };
}

export function computeAdvisorFormalPackageSha256(value) {
  return sha256(value);
}
