import { createHash } from "node:crypto";

export const EVIDENCE_CONTENT_INTEGRITY_VERSION = "1.0.0";
export const EVIDENCE_CONTENT_CANONICALIZATION = "RFC8785";

export const EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES = Object.freeze({
  inputInvalid: "evidence_integrity_input_invalid",
  fieldUnknown: "evidence_integrity_field_unknown",
  fieldMissing: "evidence_integrity_field_missing",
  pathInvalid: "evidence_integrity_path_invalid",
  pathDuplicate: "evidence_integrity_path_duplicate",
  objectInvalid: "evidence_integrity_object_invalid",
  objectSetInvalid: "evidence_integrity_object_set_invalid",
  objectIdentityMismatch: "evidence_integrity_object_identity_mismatch",
  objectNoncanonical: "evidence_integrity_object_noncanonical",
  objectChecksumMismatch: "evidence_integrity_object_checksum_mismatch",
  objectFingerprintMismatch: "evidence_integrity_object_fingerprint_mismatch",
  manifestNoncanonical: "evidence_integrity_manifest_noncanonical",
  manifestFingerprintMismatch: "evidence_integrity_manifest_fingerprint_mismatch",
  contentFingerprintMismatch: "evidence_integrity_content_fingerprint_mismatch",
  checksumFormatInvalid: "evidence_integrity_checksum_format_invalid",
  checksumSetMismatch: "evidence_integrity_checksum_set_mismatch",
  anchorMismatch: "evidence_integrity_anchor_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const OBJECT_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;
const DATA_ORIGINS = new Set(["synthetic", "hybrid", "measured"]);
const OBJECT_ID_FIELDS = Object.freeze({
  scope: "scope_id",
  method: "method_id",
  run: "run_id",
  observation: "observation_id",
  artifact: "artifact_id",
  evidence_version: "evidence_id",
  review: "review_id",
  policy_decision: "decision_id",
  export_grant: "grant_id"
});
const CONTENT_OBJECT_TYPES = new Set(["scope", "method", "run", "observation", "artifact"]);
const DOWNSTREAM_OBJECT_TYPES = new Set(["review", "policy_decision", "export_grant"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, label) {
  if (!isObject(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function inputObject(value, required, optional, label) {
  if (!isObject(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label} is invalid`);
  return value;
}

function requireSemver(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label} must be a strict semantic version`);
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !HASH.test(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a sha256 fingerprint`);
  return value;
}

function requireInstant(value, label) {
  if (typeof value !== "string") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function requireObjectPath(value, label) {
  if (typeof value !== "string" || !OBJECT_PATH.test(value) || value.includes("..") || value.includes("\\") || value.includes("/")) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathInvalid, `${label} must be a flat safe JSON filename`);
  }
  if (value === "manifest.json") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathInvalid, `${label} is reserved`);
  return value;
}

function toBytes(value, label) {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${label} must be a string or Uint8Array`);
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label} must be valid UTF-8`);
  }
}

function assertWellFormedUnicode(value, location) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${location} contains an unpaired surrogate`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${location} contains an unpaired surrogate`);
    }
  }
}

function canonical(value, location) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertWellFormedUnicode(value, location);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${location} must be a finite JSON number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${location} must not be sparse`);
    return `[${value.map((item, index) => canonical(item, `${location}[${index}]`)).join(",")}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => {
      assertWellFormedUnicode(key, `${location} key`);
      return `${JSON.stringify(key)}:${canonical(value[key], `${location}.${key}`)}`;
    }).join(",")}}`;
  }
  fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `${location} contains an unsupported value`);
}

export function canonicalizeEvidenceValue(value) {
  return canonical(value, "$");
}

export function digestEvidenceBytes(value) {
  return `sha256:${createHash("sha256").update(toBytes(value, "content")).digest("hex")}`;
}

function parseJsonObject(bytes, label, noncanonicalCode = EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectNoncanonical) {
  const text = decodeUtf8(bytes, label);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label} must contain valid JSON`);
  }
  if (!isObject(value)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label} must contain one JSON object`);
  if (text !== `${JSON.stringify(value, null, 2)}\n`) fail(noncanonicalCode, `${label} must use two-space JSON with one trailing LF`);
  canonicalizeEvidenceValue(value);
  return value;
}

function normalizeEvidenceReference(value, label = "evidence_ref") {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], label);
  if (value.object_type !== "evidence_version") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label}.object_type must equal evidence_version`);
  return {
    object_type: "evidence_version",
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: requireSemver(value.version, `${label}.version`),
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`)
  };
}

function objectRole(objectType) {
  if (CONTENT_OBJECT_TYPES.has(objectType)) return "evidence-content";
  if (objectType === "evidence_version") return "evidence-version";
  if (DOWNSTREAM_OBJECT_TYPES.has(objectType)) return "downstream-record";
  fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `unsupported evidence object type ${objectType}`);
}

function identityFromPayload(payload, label) {
  if (payload.schema_version !== EVIDENCE_CONTENT_INTEGRITY_VERSION) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label}.schema_version must equal ${EVIDENCE_CONTENT_INTEGRITY_VERSION}`);
  const idField = OBJECT_ID_FIELDS[payload.object_type];
  if (!idField) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${label}.object_type is not an Evidence Core type`);
  return {
    object_type: payload.object_type,
    object_id: requireId(payload[idField], `${label}.${idField}`),
    version: requireSemver(payload.version, `${label}.version`),
    tenant_id: requireId(payload.tenant_id, `${label}.tenant_id`),
    role: objectRole(payload.object_type)
  };
}

function normalizeInputObject(entry, index) {
  exactObject(entry, ["path", "content"], `object_${index}`);
  const path = requireObjectPath(entry.path, `object_${index}.path`);
  const bytes = toBytes(entry.content, `object_${index}.content`);
  if (bytes.byteLength === 0) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `${path} must not be empty`);
  const payload = parseJsonObject(bytes, path);
  const identity = identityFromPayload(payload, path);
  return {
    descriptor: {
      path,
      ...identity,
      media_type: "application/json",
      canonicalization: EVIDENCE_CONTENT_CANONICALIZATION,
      object_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(payload)),
      sha256: digestEvidenceBytes(bytes),
      bytes: bytes.byteLength
    },
    file: { path, bytes },
    payload
  };
}

function sortDescriptors(descriptors) {
  return descriptors.slice().sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function assertDescriptorSet(descriptors, evidenceRef) {
  if (!Array.isArray(descriptors) || descriptors.length < 2) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "an integrity bundle requires an EvidenceVersion and at least one content object");
  }
  const paths = descriptors.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathDuplicate, "object paths must be unique");
  const identities = descriptors.map(({ object_type: type, object_id: id, version, tenant_id: tenant }) => `${type}\u0000${id}\u0000${version}\u0000${tenant}`);
  if (new Set(identities).size !== identities.length) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "object identities must be unique");
  if (descriptors.some(({ tenant_id: tenantId }) => tenantId !== evidenceRef.tenant_id)) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "all protected objects must use the evidence tenant_id");
  }
  const versions = descriptors.filter(({ object_type: type, object_id: id, version, tenant_id: tenant }) => type === "evidence_version" && id === evidenceRef.object_id && version === evidenceRef.version && tenant === evidenceRef.tenant_id);
  if (versions.length !== 1 || descriptors.filter(({ object_type: type }) => type === "evidence_version").length !== 1) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "the bundle must contain exactly the referenced EvidenceVersion");
  }
  if (!descriptors.some(({ role }) => role === "evidence-content")) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "the bundle must contain at least one evidence-content object");
  }
}

function contentFingerprintBody(descriptors) {
  const objects = descriptors
    .filter(({ role }) => role === "evidence-content")
    .map(({ object_type, object_id, version, tenant_id, object_fingerprint }) => ({ object_type, object_id, version, tenant_id, object_fingerprint }))
    .sort((left, right) => {
      const leftKey = `${left.object_type}\u0000${left.object_id}\u0000${left.version}\u0000${left.tenant_id}`;
      const rightKey = `${right.object_type}\u0000${right.object_id}\u0000${right.version}\u0000${right.tenant_id}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  if (objects.length === 0) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "no evidence-content objects are available for fingerprinting");
  return {
    schema_version: EVIDENCE_CONTENT_INTEGRITY_VERSION,
    fingerprint_scope: "evidence-content-objects",
    canonicalization: EVIDENCE_CONTENT_CANONICALIZATION,
    objects
  };
}

export function deriveEvidenceContentFingerprint(objectsInput) {
  if (!Array.isArray(objectsInput)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "objects must be an array");
  const descriptors = objectsInput.map(normalizeInputObject).map(({ descriptor }) => descriptor);
  return digestEvidenceBytes(canonicalizeEvidenceValue(contentFingerprintBody(descriptors)));
}

function normalizeManifestDescriptor(value, index) {
  exactObject(value, ["path", "object_type", "object_id", "version", "tenant_id", "role", "media_type", "canonicalization", "object_fingerprint", "sha256", "bytes"], `manifest.objects[${index}]`);
  const objectType = value.object_type;
  if (!Object.hasOwn(OBJECT_ID_FIELDS, objectType)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `manifest.objects[${index}].object_type is invalid`);
  const expectedRole = objectRole(objectType);
  if (value.role !== expectedRole) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectIdentityMismatch, `manifest.objects[${index}].role does not match object_type`);
  if (value.media_type !== "application/json") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `manifest.objects[${index}].media_type must equal application/json`);
  if (value.canonicalization !== EVIDENCE_CONTENT_CANONICALIZATION) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `manifest.objects[${index}].canonicalization must equal ${EVIDENCE_CONTENT_CANONICALIZATION}`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectInvalid, `manifest.objects[${index}].bytes must be a positive safe integer`);
  return {
    path: requireObjectPath(value.path, `manifest.objects[${index}].path`),
    object_type: objectType,
    object_id: requireId(value.object_id, `manifest.objects[${index}].object_id`),
    version: requireSemver(value.version, `manifest.objects[${index}].version`),
    tenant_id: requireId(value.tenant_id, `manifest.objects[${index}].tenant_id`),
    role: expectedRole,
    media_type: "application/json",
    canonicalization: EVIDENCE_CONTENT_CANONICALIZATION,
    object_fingerprint: requireHash(value.object_fingerprint, `manifest.objects[${index}].object_fingerprint`),
    sha256: requireHash(value.sha256, `manifest.objects[${index}].sha256`),
    bytes: value.bytes
  };
}

function manifestBody(input) {
  return {
    schema_version: EVIDENCE_CONTENT_INTEGRITY_VERSION,
    manifest_id: input.manifest_id,
    evidence_ref: input.evidence_ref,
    data_origin: input.data_origin,
    created_at: input.created_at,
    canonicalization: EVIDENCE_CONTENT_CANONICALIZATION,
    checksum_manifest_path: "SHA256SUMS",
    protected_scope: "entire-json-object",
    content_fingerprint: input.content_fingerprint,
    objects: input.objects
  };
}

function normalizeManifest(value) {
  exactObject(value, ["schema_version", "manifest_id", "evidence_ref", "data_origin", "created_at", "canonicalization", "checksum_manifest_path", "protected_scope", "content_fingerprint", "objects", "manifest_fingerprint"], "manifest");
  if (value.schema_version !== EVIDENCE_CONTENT_INTEGRITY_VERSION) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `manifest.schema_version must equal ${EVIDENCE_CONTENT_INTEGRITY_VERSION}`);
  if (!DATA_ORIGINS.has(value.data_origin)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "manifest.data_origin is invalid");
  if (value.canonicalization !== EVIDENCE_CONTENT_CANONICALIZATION) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, `manifest.canonicalization must equal ${EVIDENCE_CONTENT_CANONICALIZATION}`);
  if (value.checksum_manifest_path !== "SHA256SUMS") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "manifest.checksum_manifest_path must equal SHA256SUMS");
  if (value.protected_scope !== "entire-json-object") fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "manifest.protected_scope must equal entire-json-object");
  if (!Array.isArray(value.objects)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "manifest.objects must be an array");
  const evidenceRef = normalizeEvidenceReference(value.evidence_ref, "manifest.evidence_ref");
  const objects = value.objects.map(normalizeManifestDescriptor);
  const sorted = sortDescriptors(objects);
  if (JSON.stringify(objects) !== JSON.stringify(sorted)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectSetInvalid, "manifest objects must use ascending path order");
  assertDescriptorSet(objects, evidenceRef);
  const contentFingerprint = requireHash(value.content_fingerprint, "manifest.content_fingerprint");
  const calculatedContent = digestEvidenceBytes(canonicalizeEvidenceValue(contentFingerprintBody(objects)));
  if (contentFingerprint !== calculatedContent) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.contentFingerprintMismatch, "manifest content fingerprint does not match protected evidence-content objects");
  const body = manifestBody({
    manifest_id: requireId(value.manifest_id, "manifest.manifest_id"),
    evidence_ref: evidenceRef,
    data_origin: value.data_origin,
    created_at: requireInstant(value.created_at, "manifest.created_at"),
    content_fingerprint: contentFingerprint,
    objects
  });
  const claimed = requireHash(value.manifest_fingerprint, "manifest.manifest_fingerprint");
  const calculated = digestEvidenceBytes(canonicalizeEvidenceValue(body));
  if (claimed !== calculated) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.manifestFingerprintMismatch, "manifest fingerprint does not match its protected fields");
  return { ...body, manifest_fingerprint: claimed };
}

export function serializeEvidenceContentManifest(manifest) {
  return `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`;
}

function renderChecksums(entries) {
  const sorted = entries.slice().sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return `${sorted.map(({ path, sha256 }) => `${sha256.slice("sha256:".length)}  ${path}`).join("\n")}\n`;
}

export function renderEvidenceContentChecksums(manifestBytes, files) {
  if (!Array.isArray(files)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "files must be an array");
  const entries = [{ path: "manifest.json", sha256: digestEvidenceBytes(manifestBytes) }];
  for (const [index, file] of files.entries()) {
    exactObject(file, ["path", "bytes"], `file_${index}`);
    entries.push({ path: requireObjectPath(file.path, `file_${index}.path`), sha256: digestEvidenceBytes(file.bytes) });
  }
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathDuplicate, "checksum paths must be unique");
  return renderChecksums(entries);
}

export function createEvidenceContentBundle(input) {
  inputObject(input, ["manifestId", "evidenceRef", "dataOrigin", "objects"], ["createdAt"], "input");
  if (!DATA_ORIGINS.has(input.dataOrigin)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "input.dataOrigin is invalid");
  const createdAt = input.createdAt ?? new Date();
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.valueOf())) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "input.createdAt must be a valid Date");
  if (!Array.isArray(input.objects)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "input.objects must be an array");
  const evidenceRef = normalizeEvidenceReference(input.evidenceRef);
  const normalized = input.objects.map(normalizeInputObject);
  const descriptors = sortDescriptors(normalized.map(({ descriptor }) => descriptor));
  assertDescriptorSet(descriptors, evidenceRef);
  const contentFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(contentFingerprintBody(descriptors)));
  const evidenceVersion = normalized.find(({ descriptor }) => descriptor.object_type === "evidence_version" && descriptor.object_id === evidenceRef.object_id && descriptor.version === evidenceRef.version && descriptor.tenant_id === evidenceRef.tenant_id);
  if (evidenceVersion.payload.content_fingerprint !== contentFingerprint) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.contentFingerprintMismatch, "EvidenceVersion.content_fingerprint does not match the protected content set");
  }
  if (evidenceVersion.payload.boundary?.data_origin !== input.dataOrigin) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectIdentityMismatch, "input.dataOrigin must match EvidenceVersion.boundary.data_origin");
  }
  const body = manifestBody({
    manifest_id: requireId(input.manifestId, "input.manifestId"),
    evidence_ref: evidenceRef,
    data_origin: input.dataOrigin,
    created_at: createdAt.toISOString(),
    content_fingerprint: contentFingerprint,
    objects: descriptors
  });
  const manifest = Object.freeze({ ...body, manifest_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(body)) });
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const fileByPath = new Map(normalized.map(({ file }) => [file.path, file]));
  const files = descriptors.map(({ path }) => fileByPath.get(path));
  return Object.freeze({
    manifest,
    manifestBytes,
    checksumsText: renderEvidenceContentChecksums(manifestBytes, files),
    files: Object.freeze(files.map(({ path, bytes }) => Object.freeze({ path, bytes: Uint8Array.from(bytes) })))
  });
}

function parseChecksums(value) {
  const text = decodeUtf8(toBytes(value, "checksums"), "SHA256SUMS");
  if (!text.endsWith("\n") || text.includes("\r")) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumFormatInvalid, "SHA256SUMS must use LF-terminated canonical lines");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumFormatInvalid, "SHA256SUMS contains an empty line");
  const entries = lines.map((line, index) => {
    const match = /^([a-f0-9]{64})  (manifest\.json|[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json)$/.exec(line);
    if (!match || (match[2] !== "manifest.json" && !OBJECT_PATH.test(match[2]))) {
      fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumFormatInvalid, `invalid SHA256SUMS line ${index + 1}`);
    }
    return { sha256: `sha256:${match[1]}`, path: match[2] };
  });
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathDuplicate, "SHA256SUMS contains a duplicate path");
  if (text !== renderChecksums(entries)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumFormatInvalid, "SHA256SUMS entries must use ascending path order");
  return new Map(entries.map(({ path, sha256 }) => [path, sha256]));
}

function assertDescriptorMatches(descriptor, payload, path) {
  const identity = identityFromPayload(payload, path);
  for (const field of ["object_type", "object_id", "version", "tenant_id", "role"]) {
    if (descriptor[field] !== identity[field]) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectIdentityMismatch, `${path} ${field} does not match its manifest descriptor`);
  }
  const objectFingerprint = digestEvidenceBytes(canonicalizeEvidenceValue(payload));
  if (descriptor.object_fingerprint !== objectFingerprint) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectFingerprintMismatch, `${path} object fingerprint does not match`);
}

export function verifyEvidenceContentBundle(input) {
  inputObject(input, ["manifestBytes", "checksumsBytes", "files"], ["expectedManifestFingerprint"], "verify_input");
  const manifestBytes = toBytes(input.manifestBytes, "manifestBytes");
  const manifestPayload = parseJsonObject(manifestBytes, "manifest.json", EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.manifestNoncanonical);
  const manifest = normalizeManifest(manifestPayload);
  const canonicalManifest = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  if (digestEvidenceBytes(canonicalManifest) !== digestEvidenceBytes(manifestBytes)) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.manifestNoncanonical, "manifest.json is not canonically serialized");
  }
  const checksumByPath = parseChecksums(input.checksumsBytes);
  const expectedPaths = new Set(["manifest.json", ...manifest.objects.map(({ path }) => path)]);
  if (checksumByPath.size !== expectedPaths.size || [...expectedPaths].some((path) => !checksumByPath.has(path))) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumSetMismatch, "SHA256SUMS must contain manifest.json and every protected object exactly once");
  }
  if (checksumByPath.get("manifest.json") !== digestEvidenceBytes(manifestBytes)) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectChecksumMismatch, "manifest.json checksum does not match");
  }
  if (!Array.isArray(input.files)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.inputInvalid, "verify_input.files must be an array");
  const fileByPath = new Map();
  for (const [index, file] of input.files.entries()) {
    exactObject(file, ["path", "bytes"], `verify_input.files[${index}]`);
    const path = requireObjectPath(file.path, `verify_input.files[${index}].path`);
    if (fileByPath.has(path)) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.pathDuplicate, `duplicate file ${path}`);
    fileByPath.set(path, toBytes(file.bytes, `verify_input.files[${index}].bytes`));
  }
  if (fileByPath.size !== manifest.objects.length || [...fileByPath.keys()].some((path) => !expectedPaths.has(path))) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumSetMismatch, "files must exactly match the protected object manifest");
  }
  let evidenceVersionPayload;
  for (const descriptor of manifest.objects) {
    const bytes = fileByPath.get(descriptor.path);
    if (!bytes) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.checksumSetMismatch, `${descriptor.path} is missing`);
    if (bytes.byteLength !== descriptor.bytes) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectChecksumMismatch, `${descriptor.path} byte length does not match`);
    const calculated = digestEvidenceBytes(bytes);
    if (calculated !== descriptor.sha256 || checksumByPath.get(descriptor.path) !== calculated) {
      fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectChecksumMismatch, `${descriptor.path} checksum does not match`);
    }
    const payload = parseJsonObject(bytes, descriptor.path);
    assertDescriptorMatches(descriptor, payload, descriptor.path);
    if (descriptor.object_type === "evidence_version") evidenceVersionPayload = payload;
  }
  if (evidenceVersionPayload.content_fingerprint !== manifest.content_fingerprint) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.contentFingerprintMismatch, "EvidenceVersion.content_fingerprint does not match manifest.content_fingerprint");
  }
  if (evidenceVersionPayload.boundary?.data_origin !== manifest.data_origin) {
    fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.objectIdentityMismatch, "EvidenceVersion.boundary.data_origin does not match manifest.data_origin");
  }
  let anchorVerified = false;
  if (input.expectedManifestFingerprint !== undefined) {
    const expected = requireHash(input.expectedManifestFingerprint, "verify_input.expectedManifestFingerprint");
    if (expected !== manifest.manifest_fingerprint) fail(EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES.anchorMismatch, "manifest fingerprint does not match the external expected value");
    anchorVerified = true;
  }
  return Object.freeze({
    schema_version: EVIDENCE_CONTENT_INTEGRITY_VERSION,
    manifest_id: manifest.manifest_id,
    evidence_ref: Object.freeze(manifest.evidence_ref),
    data_origin: manifest.data_origin,
    object_count: manifest.objects.length,
    content_fingerprint: manifest.content_fingerprint,
    manifest_fingerprint: manifest.manifest_fingerprint,
    integrity_verified: true,
    external_anchor_verified: anchorVerified,
    authenticity_verified: false,
    authorization_verified: false,
    independent_review_verified: false,
    certification_issued: false
  });
}
