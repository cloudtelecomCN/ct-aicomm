import { createHash } from "node:crypto";
import { fingerprint } from "../agent-control/protocol.mjs";

export const AUDIT_PACKAGE_VERSION = "1.0.0";
export const AUDIT_PACKAGE_KINDS = Object.freeze(["declaration", "approval", "execution", "rollback"]);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const PACKAGE_PATH = /^artifacts\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;
const ORIGINS = new Set(["declared", "measured", "synthetic"]);
const FINGERPRINT_FIELDS = Object.freeze({
  declaration: new Set(["declaration_fingerprint"]),
  approval: new Set(["approval_fingerprint", "authorization_fingerprint"]),
  execution: new Set(["binding_fingerprint", "trace_fingerprint", "record_hash"]),
  rollback: new Set(["rollback_fingerprint"])
});
const ID_FIELDS = Object.freeze({
  declaration: ["declaration_id"],
  approval: ["approval_id", "authorization_id"],
  execution: ["binding_id", "trace_id", "event_id"],
  rollback: ["rollback_id", "event_id"]
});

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

function inputObject(value, required, optional, code) {
  if (!isObject(value)) fail(`${code}_object_invalid`, `${code} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${code}_field_unknown`, `${code}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${code}_field_missing`, `${code}.${key} is required`);
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
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${field}_invalid`, `${field} must be a positive safe integer`);
  return value;
}

function requirePackagePath(value, field) {
  if (typeof value !== "string" || !PACKAGE_PATH.test(value) || value.includes("..") || value.includes("\\")) {
    fail(`${field}_invalid`, `${field} must be a safe artifacts/*.json path`);
  }
  return value;
}

function toBytes(value, field) {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  fail(`${field}_invalid`, `${field} must be a string or Uint8Array`);
}

function decodeUtf8(bytes, field) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${field}_utf8_invalid`, `${field} must be valid UTF-8`);
  }
}

function parseJson(bytes, field) {
  try {
    const value = JSON.parse(decodeUtf8(bytes, field));
    if (!isObject(value)) fail(`${field}_object_invalid`, `${field} must contain one JSON object`);
    return value;
  } catch (error) {
    if (error?.code) throw error;
    fail(`${field}_json_invalid`, `${field} must contain valid JSON`);
  }
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function derivePackageOrigin(artifacts) {
  const origins = new Set(artifacts.map(({ evidence_origin: origin }) => origin));
  return origins.size === 1 ? origins.values().next().value : "mixed";
}

function verifyPayload({ payload, kind, artifactId, schemaVersion, fingerprintField, evidenceOrigin, tenantId, workloadId, executionId, code }) {
  if (payload.schema_version !== schemaVersion) fail(`${code}_schema_version_mismatch`, `${kind} payload schema_version does not match its descriptor`);
  if (!FINGERPRINT_FIELDS[kind]?.has(fingerprintField)) fail(`${code}_fingerprint_field_invalid`, `${fingerprintField} is not valid for ${kind}`);
  const claimed = requireHash(payload[fingerprintField], `${code}_source_fingerprint`);
  const body = structuredClone(payload);
  delete body[fingerprintField];
  if (fingerprint(body) !== claimed) fail(`${code}_source_fingerprint_mismatch`, `${kind} source fingerprint does not match its JSON payload`);

  for (const [field, expected] of [["tenant_id", tenantId], ["workload_id", workloadId], ["execution_id", executionId]]) {
    if (Object.hasOwn(payload, field) && payload[field] !== expected) fail(`${code}_${field}_mismatch`, `${kind} payload belongs to another ${field.replace("_id", "")}`);
  }
  for (const field of ["evidence_origin", "data_origin"]) {
    if (Object.hasOwn(payload, field) && payload[field] !== evidenceOrigin) fail(`${code}_evidence_origin_mismatch`, `${kind} payload evidence origin does not match its descriptor`);
  }
  const payloadId = ID_FIELDS[kind].map((field) => payload[field]).find((value) => value !== undefined);
  if (payloadId !== undefined && payloadId !== artifactId) fail(`${code}_artifact_id_mismatch`, `${kind} artifact_id does not match its JSON payload`);
  return claimed;
}

function normalizeInputArtifact(artifact, context, index) {
  inputObject(artifact, ["kind", "artifactId", "path", "mediaType", "schemaVersion", "fingerprintField", "evidenceOrigin", "content"], [], `artifact_${index}`);
  const kind = requireText(artifact.kind, `artifact_${index}_kind`);
  if (!AUDIT_PACKAGE_KINDS.includes(kind)) fail("audit_artifact_kind_invalid", `unsupported audit artifact kind ${kind}`);
  const artifactId = requireText(artifact.artifactId, `artifact_${index}_artifact_id`);
  const path = requirePackagePath(artifact.path, `artifact_${index}_path`);
  if (artifact.mediaType !== "application/json") fail("audit_artifact_media_type_invalid", "audit package v1 accepts application/json artifacts only");
  const schemaVersion = requireText(artifact.schemaVersion, `artifact_${index}_schema_version`);
  const fingerprintField = requireText(artifact.fingerprintField, `artifact_${index}_fingerprint_field`);
  const evidenceOrigin = requireText(artifact.evidenceOrigin, `artifact_${index}_evidence_origin`);
  if (!ORIGINS.has(evidenceOrigin)) fail("audit_artifact_evidence_origin_invalid", `unsupported evidence origin ${evidenceOrigin}`);
  const bytes = toBytes(artifact.content, `artifact_${index}_content`);
  if (bytes.byteLength === 0) fail("audit_artifact_empty", `${kind} artifact is empty`);
  const payload = parseJson(bytes, `artifact_${index}`);
  const sourceFingerprint = verifyPayload({
    payload,
    kind,
    artifactId,
    schemaVersion,
    fingerprintField,
    evidenceOrigin,
    ...context,
    code: `audit_${kind}`
  });
  return {
    descriptor: {
      kind,
      artifact_id: artifactId,
      path,
      media_type: "application/json",
      schema_version: schemaVersion,
      fingerprint_field: fingerprintField,
      evidence_origin: evidenceOrigin,
      source_fingerprint: sourceFingerprint,
      sha256: digest(bytes),
      bytes: bytes.byteLength
    },
    file: { path, bytes }
  };
}

function normalizeManifestArtifact(artifact, index) {
  exactObject(artifact, ["kind", "artifact_id", "path", "media_type", "schema_version", "fingerprint_field", "evidence_origin", "source_fingerprint", "sha256", "bytes"], `manifest_artifact_${index}`);
  const kind = requireText(artifact.kind, `manifest_artifact_${index}_kind`);
  if (!AUDIT_PACKAGE_KINDS.includes(kind)) fail("audit_manifest_artifact_kind_invalid", `unsupported audit artifact kind ${kind}`);
  if (artifact.media_type !== "application/json") fail("audit_manifest_media_type_invalid", "audit package v1 accepts application/json artifacts only");
  const fingerprintField = requireText(artifact.fingerprint_field, `manifest_artifact_${index}_fingerprint_field`);
  if (!FINGERPRINT_FIELDS[kind]?.has(fingerprintField)) fail("audit_manifest_fingerprint_field_invalid", `${fingerprintField} is not valid for ${kind}`);
  const evidenceOrigin = requireText(artifact.evidence_origin, `manifest_artifact_${index}_evidence_origin`);
  if (!ORIGINS.has(evidenceOrigin)) fail("audit_manifest_evidence_origin_invalid", `unsupported evidence origin ${evidenceOrigin}`);
  return {
    kind,
    artifact_id: requireText(artifact.artifact_id, `manifest_artifact_${index}_artifact_id`),
    path: requirePackagePath(artifact.path, `manifest_artifact_${index}_path`),
    media_type: "application/json",
    schema_version: requireText(artifact.schema_version, `manifest_artifact_${index}_schema_version`),
    fingerprint_field: fingerprintField,
    evidence_origin: evidenceOrigin,
    source_fingerprint: requireHash(artifact.source_fingerprint, `manifest_artifact_${index}_source_fingerprint`),
    sha256: requireHash(artifact.sha256, `manifest_artifact_${index}_sha256`),
    bytes: requirePositiveInteger(artifact.bytes, `manifest_artifact_${index}_bytes`)
  };
}

function assertArtifactSet(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length !== AUDIT_PACKAGE_KINDS.length) {
    fail("audit_artifact_set_incomplete", "audit package requires exactly one declaration, approval, execution, and rollback artifact");
  }
  for (const field of ["kind", "artifact_id", "path"]) {
    const values = artifacts.map((artifact) => artifact[field]);
    if (new Set(values).size !== values.length) fail(`audit_artifact_${field}_duplicate`, `audit artifact ${field} values must be unique`);
  }
  for (const kind of AUDIT_PACKAGE_KINDS) if (!artifacts.some((artifact) => artifact.kind === kind)) fail("audit_artifact_kind_missing", `audit package is missing ${kind}`);
}

function sortArtifacts(artifacts) {
  return artifacts.slice().sort((left, right) => AUDIT_PACKAGE_KINDS.indexOf(left.kind) - AUDIT_PACKAGE_KINDS.indexOf(right.kind));
}

function normalizeManifest(manifest) {
  exactObject(manifest, ["schema_version", "package_id", "tenant_id", "workload_id", "execution_id", "evidence_origin", "created_at", "checksum_manifest_path", "artifacts", "package_fingerprint"], "audit_manifest");
  if (manifest.schema_version !== AUDIT_PACKAGE_VERSION) fail("audit_manifest_schema_version_invalid", `schema_version must equal ${AUDIT_PACKAGE_VERSION}`);
  if (!Array.isArray(manifest.artifacts)) fail("audit_manifest_artifacts_invalid", "audit_manifest.artifacts must be an array");
  const artifacts = manifest.artifacts.map(normalizeManifestArtifact);
  assertArtifactSet(artifacts);
  const sorted = sortArtifacts(artifacts);
  if (JSON.stringify(artifacts) !== JSON.stringify(sorted)) fail("audit_manifest_artifact_order_invalid", "audit artifacts must use declaration, approval, execution, rollback order");
  const evidenceOrigin = derivePackageOrigin(sorted);
  if (manifest.evidence_origin !== evidenceOrigin) fail("audit_manifest_evidence_origin_mismatch", "package evidence_origin must be derived from its artifacts");
  if (manifest.checksum_manifest_path !== "SHA256SUMS") fail("audit_checksum_manifest_path_invalid", "checksum_manifest_path must equal SHA256SUMS");
  const body = {
    schema_version: AUDIT_PACKAGE_VERSION,
    package_id: requireText(manifest.package_id, "audit_package_id"),
    tenant_id: requireText(manifest.tenant_id, "audit_tenant_id"),
    workload_id: requireText(manifest.workload_id, "audit_workload_id"),
    execution_id: requireText(manifest.execution_id, "audit_execution_id"),
    evidence_origin: evidenceOrigin,
    created_at: requireInstant(manifest.created_at, "audit_created_at"),
    checksum_manifest_path: "SHA256SUMS",
    artifacts: sorted
  };
  const claimed = requireHash(manifest.package_fingerprint, "audit_package_fingerprint");
  if (fingerprint(body) !== claimed) fail("audit_manifest_tampered", "audit package fingerprint does not match its manifest");
  return { ...body, package_fingerprint: claimed };
}

export function serializeAuditPackageManifest(manifest) {
  return `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`;
}

function renderChecksumsFromEntries(entries) {
  return `${entries.slice().sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0).map(({ path, sha256 }) => `${sha256.slice(7)}  ${path}`).join("\n")}\n`;
}

export function renderAuditPackageChecksums(manifestBytes, files) {
  if (!Array.isArray(files)) fail("audit_checksum_files_invalid", "checksum files must be an array");
  const entries = [{ path: "manifest.json", sha256: digest(toBytes(manifestBytes, "manifest_bytes")) }];
  for (const [index, file] of files.entries()) {
    exactObject(file, ["path", "bytes"], `checksum_file_${index}`);
    entries.push({ path: requirePackagePath(file.path, `checksum_file_${index}_path`), sha256: digest(toBytes(file.bytes, `checksum_file_${index}_bytes`)) });
  }
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail("audit_checksum_path_duplicate", "checksum paths must be unique");
  return renderChecksumsFromEntries(entries);
}

export function createAuditPackage(input) {
  inputObject(input, ["packageId", "tenantId", "workloadId", "executionId", "artifacts"], ["createdAt"], "audit_input");
  const createdAt = input.createdAt ?? new Date();
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.valueOf())) fail("audit_created_at_invalid", "createdAt must be a valid Date");
  const context = {
    tenantId: requireText(input.tenantId, "audit_tenant_id"),
    workloadId: requireText(input.workloadId, "audit_workload_id"),
    executionId: requireText(input.executionId, "audit_execution_id")
  };
  if (!Array.isArray(input.artifacts)) fail("audit_artifacts_invalid", "artifacts must be an array");
  const normalized = input.artifacts.map((artifact, index) => normalizeInputArtifact(artifact, context, index));
  assertArtifactSet(normalized.map(({ descriptor }) => descriptor));
  const sorted = sortArtifacts(normalized.map(({ descriptor }) => descriptor));
  const filesByPath = new Map(normalized.map(({ file }) => [file.path, file]));
  const files = sorted.map(({ path }) => filesByPath.get(path));
  const body = {
    schema_version: AUDIT_PACKAGE_VERSION,
    package_id: requireText(input.packageId, "audit_package_id"),
    tenant_id: context.tenantId,
    workload_id: context.workloadId,
    execution_id: context.executionId,
    evidence_origin: derivePackageOrigin(sorted),
    created_at: createdAt.toISOString(),
    checksum_manifest_path: "SHA256SUMS",
    artifacts: sorted
  };
  const manifest = Object.freeze({ ...body, package_fingerprint: fingerprint(body) });
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const checksumsText = renderAuditPackageChecksums(manifestBytes, files);
  return Object.freeze({
    manifest,
    manifestBytes,
    checksumsText,
    files: Object.freeze(files.map(({ path, bytes }) => Object.freeze({ path, bytes: Uint8Array.from(bytes) })))
  });
}

function parseChecksums(value) {
  const text = decodeUtf8(toBytes(value, "checksums_bytes"), "checksums");
  if (!text.endsWith("\n") || text.includes("\r")) fail("audit_checksums_format_invalid", "SHA256SUMS must use LF-terminated canonical lines");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) fail("audit_checksums_format_invalid", "SHA256SUMS contains an empty line");
  const entries = lines.map((line, index) => {
    const match = /^([a-f0-9]{64})  (manifest\.json|artifacts\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json)$/.exec(line);
    if (!match) fail("audit_checksums_format_invalid", `invalid SHA256SUMS line ${index + 1}`);
    return { sha256: `sha256:${match[1]}`, path: match[2] };
  });
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail("audit_checksum_path_duplicate", "SHA256SUMS contains a duplicate path");
  if (text !== renderChecksumsFromEntries(entries)) fail("audit_checksums_order_invalid", "SHA256SUMS entries must use canonical path order");
  return new Map(entries.map((entry) => [entry.path, entry.sha256]));
}

export function verifyAuditPackage(input) {
  inputObject(input, ["manifestBytes", "checksumsBytes", "files"], ["expectedContext"], "audit_verify_input");
  const manifestBytes = toBytes(input.manifestBytes, "manifest_bytes");
  const manifest = normalizeManifest(parseJson(manifestBytes, "manifest"));
  const canonicalManifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  if (digest(canonicalManifestBytes) !== digest(manifestBytes)) fail("audit_manifest_noncanonical", "manifest.json must use the canonical serialization");
  const checksumByPath = parseChecksums(input.checksumsBytes);
  const expectedPaths = new Set(["manifest.json", ...manifest.artifacts.map(({ path }) => path)]);
  if (checksumByPath.size !== expectedPaths.size || [...expectedPaths].some((path) => !checksumByPath.has(path))) {
    fail("audit_checksum_set_mismatch", "SHA256SUMS must contain manifest.json and every declared artifact exactly once");
  }
  if (checksumByPath.get("manifest.json") !== digest(manifestBytes)) fail("audit_manifest_checksum_mismatch", "manifest.json checksum does not match");
  if (!Array.isArray(input.files)) fail("audit_files_invalid", "files must be an array");
  const fileByPath = new Map();
  for (const [index, file] of input.files.entries()) {
    exactObject(file, ["path", "bytes"], `audit_file_${index}`);
    const path = requirePackagePath(file.path, `audit_file_${index}_path`);
    if (fileByPath.has(path)) fail("audit_file_path_duplicate", `duplicate package file ${path}`);
    fileByPath.set(path, toBytes(file.bytes, `audit_file_${index}_bytes`));
  }
  if (fileByPath.size !== manifest.artifacts.length || [...fileByPath.keys()].some((path) => !expectedPaths.has(path))) {
    fail("audit_file_set_mismatch", "package files must exactly match the artifact manifest; untracked files are rejected");
  }
  for (const artifact of manifest.artifacts) {
    const bytes = fileByPath.get(artifact.path);
    if (!bytes) fail("audit_artifact_missing", `${artifact.path} is missing`);
    if (bytes.byteLength !== artifact.bytes) fail("audit_artifact_size_mismatch", `${artifact.path} byte length does not match`);
    const calculated = digest(bytes);
    if (calculated !== artifact.sha256 || checksumByPath.get(artifact.path) !== calculated) fail("audit_artifact_checksum_mismatch", `${artifact.path} checksum does not match`);
    const payload = parseJson(bytes, `audit_${artifact.kind}`);
    const sourceFingerprint = verifyPayload({
      payload,
      kind: artifact.kind,
      artifactId: artifact.artifact_id,
      schemaVersion: artifact.schema_version,
      fingerprintField: artifact.fingerprint_field,
      evidenceOrigin: artifact.evidence_origin,
      tenantId: manifest.tenant_id,
      workloadId: manifest.workload_id,
      executionId: manifest.execution_id,
      code: `audit_${artifact.kind}`
    });
    if (sourceFingerprint !== artifact.source_fingerprint) fail("audit_source_fingerprint_mismatch", `${artifact.path} source fingerprint changed`);
  }

  let contextVerified = false;
  if (input.expectedContext !== undefined) {
    exactObject(input.expectedContext, ["tenant_id", "workload_id", "execution_id"], "audit_expected_context");
    const fields = [["tenant_id", "tenant"], ["workload_id", "workload"], ["execution_id", "execution"]];
    for (const [field, label] of fields) {
      requireText(input.expectedContext[field], `audit_expected_${field}`);
      if (manifest[field] !== input.expectedContext[field]) fail(`audit_${label}_mismatch`, `audit package belongs to another ${label}`);
    }
    contextVerified = true;
  }

  return Object.freeze({
    valid: true,
    integrity_verified: true,
    context_verified: contextVerified,
    package_id: manifest.package_id,
    tenant_id: manifest.tenant_id,
    workload_id: manifest.workload_id,
    execution_id: manifest.execution_id,
    evidence_origin: manifest.evidence_origin,
    artifact_count: manifest.artifacts.length,
    package_fingerprint: manifest.package_fingerprint,
    authenticity_verified: false,
    authorization_verified: false,
    legal_or_certification_conclusion: false
  });
}
