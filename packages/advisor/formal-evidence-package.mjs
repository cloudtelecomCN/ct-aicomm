import { createHash } from "node:crypto";
import {
  ADVISOR_FORMAL_PACKAGE_BOUNDARIES,
  ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY,
  ADVISOR_FORMAL_PACKAGE_ITEMS,
  ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION,
  ADVISOR_FORMAL_PACKAGE_PROFILE_ID,
  ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION,
  getAdvisorFormalPackageProfile,
} from "./formal-evidence-package-contract.mjs";
import { createDeterministicZip, readDeterministicZip } from "./deterministic-zip.mjs";

export const ADVISOR_FORMAL_PACKAGE_VERIFIER_VERSION = "1.0.0";
export const ADVISOR_FORMAL_PACKAGE_VERIFICATION_SCHEMA_VERSION = "1.0.0";

const PACKAGE_ID = /^advisor_evidence_package_[0-9a-f-]{36}$/;
const CONTRACT_ID = /^advisor_package_contract_[0-9a-f-]{36}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const PACKAGE_STATES = new Set(["assembled", "issued", "accepted", "superseded", "revoked"]);
const LOCALES = new Set(["en", "zh-CN"]);
const MEDIA_TYPES = Object.freeze({
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  txt: "text/plain",
  html: "text/html",
  markdown: "text/markdown",
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, label) {
  if (!isObject(value)) fail(`${label}_invalid`, `${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}_fields_invalid`, `${label} contains missing or unsupported fields`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalDocument(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function toBytes(value, label) {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (typeof value === "string") return new TextEncoder().encode(value);
  fail(`${label}_invalid`, `${label} must be a string, ArrayBuffer, or Uint8Array`);
}

function decodeUtf8(value, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(toBytes(value, label));
  } catch {
    fail(`${label}_utf8_invalid`, `${label} must be valid UTF-8`);
  }
}

function parseJson(value, label) {
  try {
    const parsed = JSON.parse(decodeUtf8(value, label));
    if (!isObject(parsed)) fail(`${label}_object_invalid`, `${label} must contain one JSON object`);
    return parsed;
  } catch (error) {
    if (error?.code) throw error;
    fail(`${label}_json_invalid`, `${label} must contain valid JSON`);
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(toBytes(value, "digest input")).digest("hex")}`;
}

function requireDigest(value, label) {
  if (!SHA256.test(value || "")) fail(`${label}_invalid`, `${label} must be a SHA-256 digest`);
  return value;
}

function requireTimestamp(value, label) {
  if (!TIMESTAMP.test(value || "") || Number.isNaN(new Date(value).valueOf())) fail(`${label}_invalid`, `${label} must be a UTC timestamp`);
  return value;
}

function requireSafePath(value, label) {
  if (typeof value !== "string" || !SAFE_PATH.test(value) || value.includes("\\") || value.includes("\0")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    fail(`${label}_invalid`, `${label} must be a safe relative path`);
  }
  return value;
}

function parseVersion(value, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value || "");
  if (!match) fail(`${label}_invalid`, `${label} must be a semantic version`);
  return match.slice(1).map(Number);
}

function versionAtLeast(reader, minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (reader[index] !== minimum[index]) return reader[index] > minimum[index];
  }
  return true;
}

function validateSourceBindings(bindings) {
  exactObject(bindings, ["analysis", "basic_report", "constraint_evaluation", "requirement_passport"], "advisor_package_source_bindings");
  exactObject(bindings.basic_report, ["content_sha256", "report_id"], "advisor_package_basic_report_binding");
  if (!/^advisor_basic_report_[0-9a-f-]{36}$/.test(bindings.basic_report.report_id || "")) fail("advisor_package_basic_report_id_invalid", "basic report id is invalid");
  requireDigest(bindings.basic_report.content_sha256, "advisor_package_basic_report_sha256");
  exactObject(bindings.requirement_passport, ["content_sha256", "passport_id", "revision"], "advisor_package_passport_binding");
  if (!/^advisor_passport_[0-9a-f-]{36}$/.test(bindings.requirement_passport.passport_id || "")
    || !Number.isSafeInteger(bindings.requirement_passport.revision) || bindings.requirement_passport.revision < 1) fail("advisor_package_passport_binding_invalid", "requirement passport binding is invalid");
  requireDigest(bindings.requirement_passport.content_sha256, "advisor_package_passport_sha256");
  exactObject(bindings.constraint_evaluation, ["content_sha256", "evaluation_id"], "advisor_package_evaluation_binding");
  if (!/^advisor_constraint_evaluation_[0-9a-f-]{36}$/.test(bindings.constraint_evaluation.evaluation_id || "")) fail("advisor_package_evaluation_id_invalid", "constraint evaluation id is invalid");
  requireDigest(bindings.constraint_evaluation.content_sha256, "advisor_package_evaluation_sha256");
  exactObject(bindings.analysis, ["analysis_id", "content_sha256", "method_sha256", "observation_set_sha256"], "advisor_package_analysis_binding");
  if (!/^advisor_analysis_[0-9a-f-]{36}$/.test(bindings.analysis.analysis_id || "")) fail("advisor_package_analysis_id_invalid", "analysis id is invalid");
  for (const field of ["content_sha256", "method_sha256", "observation_set_sha256"]) requireDigest(bindings.analysis[field], `advisor_package_analysis_${field}`);
}

function validateFileDescriptor(file, item, index) {
  exactObject(file, ["bytes", "format", "media_type", "path", "sha256"], `advisor_package_${item.item_id}_file_${index}`);
  const path = requireSafePath(file.path, `advisor_package_${item.item_id}_file_${index}_path`);
  if (!path.startsWith(`${item.item_id}/`)) fail("advisor_package_file_item_path_mismatch", `${path} must be stored below ${item.item_id}/`);
  if (!item.allowed_formats.includes(file.format)) fail("advisor_package_file_format_invalid", `${path} uses an unsupported format`);
  if (MEDIA_TYPES[file.format] !== file.media_type) fail("advisor_package_file_media_type_invalid", `${path} media type does not match ${file.format}`);
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 1) fail("advisor_package_file_size_invalid", `${path} byte length must be positive`);
  requireDigest(file.sha256, `advisor_package_${item.item_id}_file_${index}_sha256`);
  return { ...file };
}

function validateManifestDeliveryItems(deliveryItems) {
  if (!Array.isArray(deliveryItems) || deliveryItems.length !== ADVISOR_FORMAL_PACKAGE_ITEMS.length) fail("advisor_package_delivery_items_incomplete", "manifest must contain D01 through D13 exactly once");
  const descriptors = [];
  const paths = new Set();
  for (let index = 0; index < ADVISOR_FORMAL_PACKAGE_ITEMS.length; index += 1) {
    const profileItem = ADVISOR_FORMAL_PACKAGE_ITEMS[index];
    const item = deliveryItems[index];
    if (profileItem.item_id === "D10") {
      exactObject(item, ["artifact_key", "container_semantics", "delivery_status", "files", "item_id"], "advisor_package_D10");
      if (item.item_id !== "D10" || item.artifact_key !== profileItem.artifact_key || item.delivery_status !== "aggregate"
        || !Array.isArray(item.files) || item.files.length !== 0
        || item.container_semantics !== "this_manifest_describes_the_archive_the_archive_digest_is_an_external_sidecar") {
        fail("advisor_package_container_invalid", "D10 must describe the outer archive without self-referencing a file digest");
      }
      continue;
    }
    exactObject(item, ["artifact_key", "delivery_status", "files", "item_id"], `advisor_package_${profileItem.item_id}`);
    if (item.item_id !== profileItem.item_id || item.artifact_key !== profileItem.artifact_key || item.delivery_status !== "included"
      || !Array.isArray(item.files) || item.files.length < 1) fail("advisor_package_delivery_item_invalid", `${profileItem.item_id} does not match the frozen profile`);
    const files = item.files.map((file, fileIndex) => validateFileDescriptor(file, profileItem, fileIndex));
    if (profileItem.machine_readable_required && !files.some(({ format }) => new Set(["json", "csv", "xlsx", "zip", "txt", "markdown", "html"]).has(format))) {
      fail("advisor_package_machine_readable_artifact_missing", `${profileItem.item_id} requires a machine-readable artifact`);
    }
    for (const file of files) {
      if (paths.has(file.path)) fail("advisor_package_file_path_duplicate", `duplicate manifest path ${file.path}`);
      paths.add(file.path);
      descriptors.push(file);
    }
  }
  return descriptors;
}

function manifestProjection(manifest) {
  return { ...manifest, content_sha256: null };
}

export function validateAdvisorFormalEvidencePackageManifest(manifest) {
  exactObject(manifest, ["boundaries", "capability_key", "checksum_manifest", "compatibility", "content_sha256", "contract_id", "created_at", "delivery_items", "locale", "manifest_type", "package_id", "package_revision", "profile_id", "profile_version", "schema_version", "source_bindings", "state"], "advisor_package_manifest");
  if (manifest.schema_version !== ADVISOR_FORMAL_PACKAGE_MANIFEST_SCHEMA_VERSION
    || manifest.manifest_type !== "ct_advisor_gpu_decision_evidence_package_manifest"
    || manifest.profile_id !== ADVISOR_FORMAL_PACKAGE_PROFILE_ID
    || manifest.profile_version !== ADVISOR_FORMAL_PACKAGE_PROFILE_VERSION
    || manifest.capability_key !== "gpu_preprocurement_decision_evidence_package") fail("advisor_package_manifest_version_invalid", "manifest profile or version is unsupported");
  if (!PACKAGE_ID.test(manifest.package_id || "") || !CONTRACT_ID.test(manifest.contract_id || "")
    || !Number.isSafeInteger(manifest.package_revision) || manifest.package_revision < 1
    || !LOCALES.has(manifest.locale) || !PACKAGE_STATES.has(manifest.state)) fail("advisor_package_manifest_identity_invalid", "manifest identity, locale, revision, or state is invalid");
  requireTimestamp(manifest.created_at, "advisor_package_created_at");
  validateSourceBindings(manifest.source_bindings);
  const files = validateManifestDeliveryItems(manifest.delivery_items);
  exactObject(manifest.checksum_manifest, ["algorithm", "archive_digest_sidecar_required", "covers_exact_delivered_bytes", "path"], "advisor_package_checksum_manifest");
  if (manifest.checksum_manifest.path !== "SHA256SUMS" || manifest.checksum_manifest.algorithm !== "SHA-256"
    || manifest.checksum_manifest.covers_exact_delivered_bytes !== true || manifest.checksum_manifest.archive_digest_sidecar_required !== true) fail("advisor_package_checksum_contract_invalid", "checksum manifest contract is invalid");
  exactObject(manifest.compatibility, ["minimum_verifier_version", "policy_id", "unknown_field_policy"], "advisor_package_compatibility");
  if (manifest.compatibility.policy_id !== ADVISOR_FORMAL_PACKAGE_COMPATIBILITY_POLICY.policy_id
    || manifest.compatibility.unknown_field_policy !== "reject") fail("advisor_package_compatibility_policy_invalid", "compatibility policy is invalid");
  const reader = parseVersion(ADVISOR_FORMAL_PACKAGE_VERIFIER_VERSION, "advisor_package_reader_version");
  const minimum = parseVersion(manifest.compatibility.minimum_verifier_version, "advisor_package_minimum_verifier_version");
  if (reader[0] !== minimum[0] || !versionAtLeast(reader, minimum)) fail("advisor_package_verifier_upgrade_required", "package requires a newer verifier");
  exactObject(manifest.boundaries, ["certification_issued", "execution_authorized", "legal_opinion_issued", "performance_claim_allowed"], "advisor_package_boundaries");
  for (const field of ["execution_authorized", "certification_issued", "legal_opinion_issued", "performance_claim_allowed"]) {
    if (manifest.boundaries[field] !== false) fail("advisor_package_boundary_invalid", `${field} must remain false`);
  }
  const profile = getAdvisorFormalPackageProfile();
  if (profile.profile_sha256 !== "sha256:2ecb705e63ee48dc7f615da2eeab6feb9a244470ca61f182d8da1adb1dd94665") fail("advisor_package_profile_drift", "frozen package profile changed unexpectedly");
  requireDigest(manifest.content_sha256, "advisor_package_manifest_sha256");
  if (manifest.content_sha256 !== digest(canonicalJson(manifestProjection(manifest)))) fail("advisor_package_manifest_digest_mismatch", "manifest content digest does not match its canonical projection");
  return Object.freeze({ valid: true, files: Object.freeze(files), profile_sha256: profile.profile_sha256 });
}

export function serializeAdvisorFormalEvidencePackageManifest(manifest) {
  validateAdvisorFormalEvidencePackageManifest(manifest);
  return canonicalDocument(manifest);
}

function checksumText(entries) {
  return `${entries.slice().sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map(({ path, sha256 }) => `${sha256.slice(7)}  ${path}`).join("\n")}\n`;
}

export function renderAdvisorFormalEvidencePackageChecksums(manifestBytes, files) {
  if (!Array.isArray(files)) fail("advisor_package_checksum_files_invalid", "checksum files must be an array");
  const entries = [{ path: "manifest.json", sha256: digest(toBytes(manifestBytes, "manifest bytes")) }];
  for (const [index, file] of files.entries()) {
    exactObject(file, ["bytes", "path"], `advisor_package_checksum_file_${index}`);
    entries.push({ path: requireSafePath(file.path, `advisor_package_checksum_file_${index}_path`), sha256: digest(file.bytes) });
  }
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail("advisor_package_checksum_path_duplicate", "checksum paths must be unique");
  return checksumText(entries);
}

function parseChecksums(value, label = "SHA256SUMS") {
  const text = decodeUtf8(value, label);
  if (!text.endsWith("\n") || text.includes("\r")) fail("advisor_package_checksums_format_invalid", `${label} must use canonical LF-terminated lines`);
  const lines = text.slice(0, -1).split("\n");
  if (!lines.length || lines.some((line) => !line)) fail("advisor_package_checksums_format_invalid", `${label} contains empty lines`);
  const entries = lines.map((line, index) => {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._/-]{0,255})$/.exec(line);
    if (!match) fail("advisor_package_checksums_format_invalid", `${label} line ${index + 1} is invalid`);
    return { sha256: `sha256:${match[1]}`, path: requireSafePath(match[2], `${label}_${index + 1}_path`) };
  });
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail("advisor_package_checksum_path_duplicate", `${label} contains duplicate paths`);
  if (text !== checksumText(entries)) fail("advisor_package_checksums_order_invalid", `${label} paths must use canonical order`);
  return new Map(entries.map(({ path, sha256 }) => [path, sha256]));
}

function verifyExitArchive(bytes) {
  const entries = readDeterministicZip(bytes);
  const byPath = new Map(entries.map((entry) => [entry.path, entry.bytes]));
  if (!byPath.has("README.md") || !byPath.has("SHA256SUMS")
    || !entries.some(({ path }) => path.startsWith("raw/"))
    || !entries.some(({ path }) => path.startsWith("transformed/"))) {
    fail("advisor_package_exit_archive_incomplete", "D12 exit archive requires README.md, SHA256SUMS, raw/, and transformed/ content");
  }
  const checksums = parseChecksums(byPath.get("SHA256SUMS"), "D12/SHA256SUMS");
  const payloads = entries.filter(({ path }) => path !== "SHA256SUMS");
  if (checksums.size !== payloads.length || payloads.some(({ path }) => !checksums.has(path))) fail("advisor_package_exit_checksum_set_mismatch", "D12 checksums must cover every exit payload exactly once");
  for (const entry of payloads) if (checksums.get(entry.path) !== digest(entry.bytes)) fail("advisor_package_exit_checksum_mismatch", `D12 checksum mismatch for ${entry.path}`);
  return { file_count: payloads.length, integrity_verified: true };
}

function verifyPreflight(bytes, manifest, files) {
  const record = parseJson(bytes, "advisor package D11 preflight");
  exactObject(record, ["checks_passed", "covered_file_count", "covered_files_sha256", "limitations", "package_id", "scope", "schema_version", "verification_type", "verified_at"], "advisor_package_preflight");
  if (record.schema_version !== "1.0.0" || record.verification_type !== "ct_advisor_package_preflight"
    || record.package_id !== manifest.package_id || record.scope !== "payload_files_excluding_D10_D11_manifest_checksums_and_outer_archive"
    || record.checks_passed !== true || !Array.isArray(record.limitations) || record.limitations.length < 2) fail("advisor_package_preflight_invalid", "D11 preflight record is invalid");
  requireTimestamp(record.verified_at, "advisor_package_preflight_verified_at");
  const covered = files.filter(({ path }) => !path.startsWith("D11/")).map(({ path, bytes: fileBytes }) => ({ path, bytes: fileBytes.byteLength, sha256: digest(fileBytes) }));
  if (record.covered_file_count !== covered.length || record.covered_files_sha256 !== digest(canonicalJson(covered))) {
    fail("advisor_package_preflight_coverage_mismatch", "D11 preflight coverage does not match non-D11 payloads");
  }
  return record;
}

function parseSidecar(value, archiveName, archiveSha256) {
  const name = requireSafePath(archiveName, "advisor_package_archive_name");
  if (name.includes("/")) fail("advisor_package_archive_name_invalid", "archive name must be a basename");
  const expected = `${archiveSha256.slice(7)}  ${name}\n`;
  if (decodeUtf8(value, "advisor package archive sidecar") !== expected) fail("advisor_package_archive_sidecar_mismatch", "archive digest sidecar does not match the exact ZIP bytes and filename");
}

export function verifyAdvisorFormalEvidencePackage({ archiveBytes, archiveName, archiveDigestSidecar, expectedPackageId, expectedContractId } = {}) {
  const archive = toBytes(archiveBytes, "advisor package archive");
  const archiveSha256 = digest(archive);
  parseSidecar(archiveDigestSidecar, archiveName, archiveSha256);
  const entries = readDeterministicZip(archive);
  const byPath = new Map(entries.map((entry) => [entry.path, entry.bytes]));
  if (!byPath.has("manifest.json") || !byPath.has("SHA256SUMS")) fail("advisor_package_root_files_missing", "package must contain manifest.json and SHA256SUMS");
  const manifestBytes = byPath.get("manifest.json");
  const manifest = parseJson(manifestBytes, "advisor package manifest");
  const { files: descriptors, profile_sha256: profileSha256 } = validateAdvisorFormalEvidencePackageManifest(manifest);
  if (archiveName !== `${manifest.package_id}.zip`) fail("advisor_package_archive_name_mismatch", "archive filename must equal <package_id>.zip");
  if (expectedPackageId !== undefined && manifest.package_id !== expectedPackageId) fail("advisor_package_expected_id_mismatch", "package id does not match the expected context");
  if (expectedContractId !== undefined && manifest.contract_id !== expectedContractId) fail("advisor_package_expected_contract_mismatch", "contract id does not match the expected context");
  const canonicalManifest = new TextEncoder().encode(canonicalDocument(manifest));
  if (digest(canonicalManifest) !== digest(manifestBytes)) fail("advisor_package_manifest_noncanonical", "manifest.json must use canonical serialization");
  const checksums = parseChecksums(byPath.get("SHA256SUMS"));
  const expectedPaths = new Set(["manifest.json", ...descriptors.map(({ path }) => path)]);
  const archivePayloadPaths = entries.map(({ path }) => path).filter((path) => path !== "SHA256SUMS");
  if (checksums.size !== expectedPaths.size || archivePayloadPaths.length !== expectedPaths.size
    || [...expectedPaths].some((path) => !checksums.has(path) || !byPath.has(path))
    || archivePayloadPaths.some((path) => !expectedPaths.has(path))) {
    fail("advisor_package_file_set_mismatch", "archive, manifest, and SHA256SUMS file sets must match exactly; untracked files are rejected");
  }
  if (checksums.get("manifest.json") !== digest(manifestBytes)) fail("advisor_package_manifest_checksum_mismatch", "manifest checksum does not match");
  for (const descriptor of descriptors) {
    const bytes = byPath.get(descriptor.path);
    if (!bytes || bytes.byteLength !== descriptor.bytes) fail("advisor_package_file_size_mismatch", `${descriptor.path} byte length does not match`);
    const calculated = digest(bytes);
    if (calculated !== descriptor.sha256 || checksums.get(descriptor.path) !== calculated) fail("advisor_package_file_checksum_mismatch", `${descriptor.path} checksum does not match`);
  }
  const d11 = descriptors.find(({ path, format }) => path.startsWith("D11/") && format === "json");
  const d12 = descriptors.find(({ path, format }) => path.startsWith("D12/") && format === "zip");
  if (!d11 || !d12) fail("advisor_package_verification_artifact_missing", "D11 JSON and D12 ZIP are required");
  const preflight = verifyPreflight(byPath.get(d11.path), manifest, descriptors.map((descriptor) => ({ path: descriptor.path, bytes: byPath.get(descriptor.path) })));
  const exitArchive = verifyExitArchive(byPath.get(d12.path));
  return Object.freeze({
    schema_version: ADVISOR_FORMAL_PACKAGE_VERIFICATION_SCHEMA_VERSION,
    verifier_version: ADVISOR_FORMAL_PACKAGE_VERIFIER_VERSION,
    valid: true,
    integrity_verified: true,
    archive_sha256: archiveSha256,
    package_id: manifest.package_id,
    contract_id: manifest.contract_id,
    package_revision: manifest.package_revision,
    locale: manifest.locale,
    declared_package_state: manifest.state,
    revocation_status: manifest.state === "revoked" ? "revoked_as_packaged" : "snapshot_only_not_live_checked",
    artifact_item_count: manifest.delivery_items.length,
    payload_file_count: descriptors.length,
    exit_archive_file_count: exitArchive.file_count,
    manifest_sha256: digest(manifestBytes),
    profile_sha256: profileSha256,
    preflight_scope: preflight.scope,
    context_verified: expectedPackageId !== undefined || expectedContractId !== undefined,
    authenticity_verified: false,
    issuance_authority_verified: false,
    entitlement_verified: false,
    live_revocation_checked: false,
    execution_authorized: false,
    certification_issued: false,
    legal_opinion_issued: false,
    performance_claim_allowed: false,
  });
}

export function createAdvisorFormalEvidencePackageArchive({ manifest, files }) {
  const manifestText = serializeAdvisorFormalEvidencePackageManifest(manifest);
  if (!Array.isArray(files)) fail("advisor_package_files_invalid", "package files must be an array");
  const descriptors = validateAdvisorFormalEvidencePackageManifest(manifest).files;
  const byPath = new Map(files.map(({ path, bytes }) => [requireSafePath(path, "advisor_package_file_path"), toBytes(bytes, path)]));
  if (byPath.size !== files.length || descriptors.length !== files.length || descriptors.some(({ path }) => !byPath.has(path))) fail("advisor_package_file_set_mismatch", "provided package files must exactly match the manifest");
  for (const descriptor of descriptors) {
    const bytes = byPath.get(descriptor.path);
    if (bytes.byteLength !== descriptor.bytes || digest(bytes) !== descriptor.sha256) fail("advisor_package_file_descriptor_mismatch", `${descriptor.path} does not match its manifest descriptor`);
  }
  const manifestBytes = new TextEncoder().encode(manifestText);
  const payloadFiles = descriptors.map(({ path }) => ({ path, bytes: byPath.get(path) }));
  const checksumsText = renderAdvisorFormalEvidencePackageChecksums(manifestBytes, payloadFiles);
  const archiveBytes = createDeterministicZip([
    { path: "manifest.json", bytes: manifestBytes },
    { path: "SHA256SUMS", bytes: checksumsText },
    ...payloadFiles,
  ]);
  const archiveName = `${manifest.package_id}.zip`;
  const archiveSha256 = digest(archiveBytes);
  return Object.freeze({
    archiveName,
    archiveBytes,
    archiveSha256,
    archiveDigestSidecarName: `${archiveName}.sha256`,
    archiveDigestSidecar: `${archiveSha256.slice(7)}  ${archiveName}\n`,
  });
}

export function computeAdvisorFormalPackageDigest(value) {
  return digest(typeof value === "string" || value instanceof Uint8Array || value instanceof ArrayBuffer ? value : canonicalJson(value));
}

export function getAdvisorFormalPackageVerifierBoundaries() {
  return Object.freeze({
    ...ADVISOR_FORMAL_PACKAGE_BOUNDARIES,
    integrity_and_format_verification_only: true,
    trusted_signature_required: false,
    live_revocation_checked: false,
    commercial_package_issuance_available: false,
  });
}
