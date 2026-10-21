import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { isIP } from "node:net";

export const REGISTRY_ENTRY_INTEGRITY_VERSION = "1.0.0";
const CANONICALIZATION = "ct-aicomm-json-v1";
const HASH = /^sha256:[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ARTIFACT_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const ENTRY_KEYS = ["schema_version", "entry_id", "entry_version", "sequence", "status", "published_at", "source_contribution", "review_receipt_digest", "previous_version_digest", "protocol", "artifacts"];
const SOURCE_KEYS = ["id", "digest"];
const PROTOCOL_KEYS = ["id", "name", "version", "category", "summary", "specification_urls", "implementation_urls", "interoperability_tags"];
const ARTIFACT_KEYS = ["path", "media_type", "sha256"];
const RECORD_KEYS = ["entry", "integrity", "signature"];
const INTEGRITY_KEYS = ["canonicalization", "entry_digest"];
const SIGNATURE_KEYS = ["schema_version", "algorithm", "key_id", "signed_at", "value"];

function failure(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, keys, code) {
  if (!isObject(value)) failure(`${code}_object_invalid`, `${code} must be a plain object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) failure(`${code}_field_unknown`, `${code}.${key} is not allowed`);
  for (const key of keys) if (!Object.hasOwn(value, key)) failure(`${code}_field_missing`, `${code}.${key} is required`);
}

function string(value, code, { min = 1, max = 500, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) failure(`${code}_invalid`, `${code} has an invalid value`);
}

function hash(value, code) {
  string(value, code, { min: 71, max: 71, pattern: HASH });
}

function uniqueStringArray(value, code, { min = 0, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) failure(`${code}_invalid`, `${code} must contain ${min}-${max} strings`);
  const seen = new Set();
  for (const item of value) {
    string(item, code);
    if (seen.has(item)) failure(`${code}_duplicate`, `${code} values must be unique`);
    seen.add(item);
  }
}

function isoInstant(value, code) {
  string(value, code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) failure(`${code}_invalid`, `${code} must be an ISO-8601 UTC instant`);
}

function privateIpv4(hostname) {
  const [a, b] = hostname.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function publicHttpsUrl(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const privateIpv6 = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
  const privateHost = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || (isIP(hostname) === 4 && privateIpv4(hostname)) || (isIP(hostname) === 6 && privateIpv6);
  return parsed.protocol === "https:" && !parsed.username && !parsed.password && !privateHost;
}

function canonical(value, location) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) failure("canonical_number_invalid", `${location} must use a safe integer`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) failure("canonical_array_sparse", `${location} must not be sparse`);
    return `[${value.map((item, index) => canonical(item, `${location}[${index}]`)).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], `${location}.${key}`)}`).join(",")}}`;
  }
  failure("canonical_value_invalid", `${location} contains an unsupported value`);
}

export function canonicalizeRegistryValue(value) {
  return canonical(value, "$");
}

export function digestRegistryArtifact(bytes) {
  if (!(typeof bytes === "string" || bytes instanceof Uint8Array)) failure("artifact_bytes_invalid", "artifact bytes must be a string or Uint8Array");
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateProtocol(protocol) {
  exactObject(protocol, PROTOCOL_KEYS, "protocol");
  string(protocol.id, "protocol_id", { min: 2, max: 64, pattern: SLUG });
  string(protocol.name, "protocol_name", { min: 2, max: 120 });
  string(protocol.version, "protocol_version", { min: 1, max: 64 });
  string(protocol.category, "protocol_category", { min: 2, max: 64, pattern: SLUG });
  string(protocol.summary, "protocol_summary", { min: 20, max: 500 });
  uniqueStringArray(protocol.specification_urls, "protocol_specification_urls", { min: 1, max: 12 });
  uniqueStringArray(protocol.implementation_urls, "protocol_implementation_urls", { max: 12 });
  uniqueStringArray(protocol.interoperability_tags, "protocol_interoperability_tags", { min: 1, max: 20 });
  for (const value of [...protocol.specification_urls, ...protocol.implementation_urls]) {
    try {
      if (!publicHttpsUrl(value)) throw new Error("not public HTTPS");
    } catch {
      failure("protocol_url_invalid", "protocol URLs must use public HTTPS without embedded credentials or private hosts");
    }
  }
}

function validateEntry(entry) {
  exactObject(entry, ENTRY_KEYS, "entry");
  if (entry.schema_version !== REGISTRY_ENTRY_INTEGRITY_VERSION) failure("entry_schema_version_invalid", `entry.schema_version must equal ${REGISTRY_ENTRY_INTEGRITY_VERSION}`);
  string(entry.entry_id, "entry_id", { min: 2, max: 64, pattern: SLUG });
  string(entry.entry_version, "entry_version", { min: 5, max: 32, pattern: SEMVER });
  if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 1) failure("entry_sequence_invalid", "entry.sequence must be a positive safe integer");
  if (!["published", "deprecated"].includes(entry.status)) failure("entry_status_invalid", "entry.status must be published or deprecated");
  isoInstant(entry.published_at, "entry_published_at");

  exactObject(entry.source_contribution, SOURCE_KEYS, "source_contribution");
  string(entry.source_contribution.id, "source_contribution_id", { min: 3, max: 96, pattern: SLUG });
  hash(entry.source_contribution.digest, "source_contribution_digest");
  hash(entry.review_receipt_digest, "review_receipt_digest");
  if (entry.sequence === 1 && entry.previous_version_digest !== null) failure("entry_previous_digest_invalid", "the first version must not have a previous digest");
  if (entry.sequence > 1) hash(entry.previous_version_digest, "entry_previous_version_digest");

  validateProtocol(entry.protocol);
  if (entry.protocol.id !== entry.entry_id) failure("entry_protocol_id_mismatch", "entry.entry_id must equal protocol.id");

  if (!Array.isArray(entry.artifacts) || entry.artifacts.length < 1 || entry.artifacts.length > 32) failure("entry_artifacts_invalid", "entry.artifacts must contain 1-32 records");
  const paths = [];
  for (const artifact of entry.artifacts) {
    exactObject(artifact, ARTIFACT_KEYS, "artifact");
    string(artifact.path, "artifact_path", { min: 3, max: 240, pattern: ARTIFACT_PATH });
    string(artifact.media_type, "artifact_media_type", { min: 3, max: 120 });
    hash(artifact.sha256, "artifact_sha256");
    paths.push(artifact.path);
  }
  if (new Set(paths).size !== paths.length) failure("artifact_path_duplicate", "artifact paths must be unique");
  if (paths.some((path, index) => index > 0 && paths[index - 1] > path)) failure("artifact_order_invalid", "artifact paths must use ascending Unicode code-point order");
  return entry;
}

function signaturePayload(record) {
  return {
    algorithm: record.signature.algorithm,
    canonicalization: record.integrity.canonicalization,
    entry_digest: record.integrity.entry_digest,
    key_id: record.signature.key_id,
    schema_version: record.signature.schema_version,
    signed_at: record.signature.signed_at
  };
}

function normalizePrivateKey(value) {
  let key;
  try {
    key = value?.type === "private" ? value : createPrivateKey(value);
  } catch {
    failure("signing_private_key_invalid", "a valid Ed25519 private key is required at call time");
  }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") failure("signing_private_key_invalid", "a valid Ed25519 private key is required at call time");
  return key;
}

function normalizePublicKey(value) {
  let key;
  try {
    key = value?.type === "public" ? value : createPublicKey(value);
  } catch {
    failure("verification_public_key_invalid", "a valid Ed25519 public key is required");
  }
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") failure("verification_public_key_invalid", "a valid Ed25519 public key is required");
  return key;
}

export function createRegistryEntryRecord(entry, { privateKey, keyId } = {}) {
  validateEntry(entry);
  string(keyId, "signature_key_id", { min: 3, max: 96, pattern: SLUG });
  const entryDigest = digestRegistryArtifact(canonicalizeRegistryValue(entry));
  const record = {
    entry: structuredClone(entry),
    integrity: { canonicalization: CANONICALIZATION, entry_digest: entryDigest },
    signature: {
      schema_version: REGISTRY_ENTRY_INTEGRITY_VERSION,
      algorithm: "Ed25519",
      key_id: keyId,
      signed_at: entry.published_at,
      value: ""
    }
  };
  const payload = Buffer.from(canonicalizeRegistryValue(signaturePayload(record)));
  record.signature.value = `base64:${sign(null, payload, normalizePrivateKey(privateKey)).toString("base64")}`;
  return record;
}

function getPublicKey(publicKeys, keyId) {
  const value = publicKeys instanceof Map ? publicKeys.get(keyId) : publicKeys?.[keyId];
  if (!value) failure("signature_key_unknown", `no public key is registered for ${keyId}`);
  return normalizePublicKey(value);
}

function getArtifact(artifactBytesByPath, path) {
  return artifactBytesByPath instanceof Map ? artifactBytesByPath.get(path) : artifactBytesByPath?.[path];
}

export function verifyRegistryEntryRecord(record, { publicKeys, artifactBytesByPath, requireArtifacts = true } = {}) {
  exactObject(record, RECORD_KEYS, "record");
  validateEntry(record.entry);
  exactObject(record.integrity, INTEGRITY_KEYS, "integrity");
  if (record.integrity.canonicalization !== CANONICALIZATION) failure("canonicalization_invalid", `integrity.canonicalization must equal ${CANONICALIZATION}`);
  hash(record.integrity.entry_digest, "entry_digest");
  const expectedDigest = digestRegistryArtifact(canonicalizeRegistryValue(record.entry));
  if (record.integrity.entry_digest !== expectedDigest) failure("entry_digest_mismatch", "entry content does not match entry_digest");

  exactObject(record.signature, SIGNATURE_KEYS, "signature");
  if (record.signature.schema_version !== REGISTRY_ENTRY_INTEGRITY_VERSION) failure("signature_schema_version_invalid", "signature schema version is unsupported");
  if (record.signature.algorithm !== "Ed25519") failure("signature_algorithm_invalid", "only Ed25519 signatures are supported");
  string(record.signature.key_id, "signature_key_id", { min: 3, max: 96, pattern: SLUG });
  isoInstant(record.signature.signed_at, "signature_signed_at");
  if (record.signature.signed_at !== record.entry.published_at) failure("signature_time_mismatch", "signature time must equal the entry publication time");
  string(record.signature.value, "signature_value", { min: 91, max: 95, pattern: /^base64:[A-Za-z0-9+/]+={0,2}$/ });
  const payload = Buffer.from(canonicalizeRegistryValue(signaturePayload(record)));
  const signature = Buffer.from(record.signature.value.slice("base64:".length), "base64");
  if (!verify(null, payload, getPublicKey(publicKeys, record.signature.key_id), signature)) failure("entry_signature_invalid", "entry signature verification failed");

  let artifactsVerified = false;
  if (requireArtifacts) {
    for (const artifact of record.entry.artifacts) {
      const bytes = getArtifact(artifactBytesByPath, artifact.path);
      if (bytes === undefined) failure("artifact_missing", `artifact bytes are required for ${artifact.path}`);
      if (digestRegistryArtifact(bytes) !== artifact.sha256) failure("artifact_digest_mismatch", `artifact digest mismatch for ${artifact.path}`);
    }
    artifactsVerified = true;
  }
  return { entry_digest: expectedDigest, key_id: record.signature.key_id, artifacts_verified: artifactsVerified };
}

function compareSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

export function verifyRegistryEntryHistory(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) failure("history_empty", "history must contain at least one signed entry record");
  let previous = null;
  const versions = new Set();
  const contributions = new Set();
  const keys = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const result = verifyRegistryEntryRecord(record, options);
    const entry = record.entry;
    if (entry.sequence !== index + 1) failure("history_sequence_invalid", "history sequence must start at 1 and remain contiguous");
    if (index > 0 && entry.entry_id !== previous.entry.entry_id) failure("history_entry_id_mismatch", "all history records must share one entry_id");
    if (index > 0 && entry.previous_version_digest !== previous.integrity.entry_digest) failure("history_previous_digest_mismatch", "entry does not reference the immediately previous version digest");
    if (index > 0 && compareSemver(previous.entry.entry_version, entry.entry_version) >= 0) failure("history_version_not_increasing", "entry versions must increase monotonically");
    if (index > 0 && Date.parse(previous.entry.published_at) >= Date.parse(entry.published_at)) failure("history_time_not_increasing", "publication times must increase monotonically");
    if (versions.has(entry.entry_version)) failure("history_version_duplicate", "entry versions must be unique");
    if (contributions.has(entry.source_contribution.id)) failure("history_contribution_duplicate", "source contribution ids must be unique");
    versions.add(entry.entry_version);
    contributions.add(entry.source_contribution.id);
    keys.add(result.key_id);
    previous = record;
  }
  return {
    entry_id: previous.entry.entry_id,
    versions: records.map(({ entry }) => entry.entry_version),
    latest_digest: previous.integrity.entry_digest,
    key_ids: [...keys].sort(),
    artifacts_verified: options.requireArtifacts !== false
  };
}
