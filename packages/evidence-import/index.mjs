import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes,
  verifyEvidenceContentBundle
} from "../evidence-integrity/index.mjs";

export const EVIDENCE_IMPORT_VERSION = "1.0.0";

export const EVIDENCE_CANONICAL_UNITS = Object.freeze([
  "1",
  "bit/s",
  "byte/s",
  "bytes",
  "count",
  "ms",
  "ns",
  "percent",
  "request/s",
  "s",
  "token/s",
  "us"
]);

export const EVIDENCE_IMPORT_ERROR_CODES = Object.freeze({
  inputInvalid: "evidence_import_input_invalid",
  fieldUnknown: "evidence_import_field_unknown",
  fieldMissing: "evidence_import_field_missing",
  ledgerInvalid: "evidence_import_ledger_invalid",
  ledgerFingerprintMismatch: "evidence_import_ledger_fingerprint_mismatch",
  attemptIdConflict: "evidence_import_attempt_id_conflict",
  idempotencyConflict: "evidence_import_idempotency_conflict",
  integrityFailed: "evidence_import_integrity_failed",
  objectInvalid: "evidence_import_object_invalid",
  tenantMismatch: "evidence_import_tenant_mismatch",
  unitInvalid: "evidence_import_unit_invalid",
  timeInvalid: "evidence_import_time_invalid",
  timeOrderInvalid: "evidence_import_time_order_invalid",
  referenceInvalid: "evidence_import_reference_invalid",
  referenceMissing: "evidence_import_reference_missing",
  referenceSetMismatch: "evidence_import_reference_set_mismatch",
  versionConflict: "evidence_import_version_conflict"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{7,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const UNITS = new Set(EVIDENCE_CANONICAL_UNITS);
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
const OBJECT_FIELDS = Object.freeze({
  scope: Object.freeze(["schema_version", "object_type", "scope_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "sites", "endpoints", "direction", "purpose", "validity", "workload_class"]),
  method: Object.freeze(["schema_version", "object_type", "method_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "tool", "parameters", "sampling", "exclusion_rules", "statistics", "environment_prerequisites"]),
  run: Object.freeze(["schema_version", "object_type", "run_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "scope_ref", "method_ref", "planned_window", "actual_window", "environment", "workload", "clock", "run_status", "exit_reason"]),
  observation: Object.freeze(["schema_version", "object_type", "observation_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "run_ref", "observed_at", "metric", "value", "unit", "observation_point", "sample_count", "origin", "quality", "aggregation", "limitations"]),
  artifact: Object.freeze(["schema_version", "object_type", "artifact_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "kind", "media_type", "content_fingerprint", "size_bytes", "storage_locator", "classification", "derived_from"]),
  evidence_version: Object.freeze(["schema_version", "object_type", "evidence_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "scope_ref", "method_ref", "run_refs", "observation_refs", "artifact_refs", "boundary", "status", "sealed_at", "content_fingerprint"]),
  review: Object.freeze(["schema_version", "object_type", "review_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "evidence_ref", "reviewer", "independence_disclosure", "review_scope", "method", "findings", "conclusion", "concluded_at"]),
  policy_decision: Object.freeze(["schema_version", "object_type", "decision_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "consumer", "rule", "evidence_refs", "outcome", "reason", "decided_at"]),
  export_grant: Object.freeze(["schema_version", "object_type", "grant_id", "version", "tenant_id", "created_by", "created_at", "authorization_scope", "resource_refs", "recipient", "purpose", "field_scope", "expires_at", "watermark", "status"])
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(EVIDENCE_IMPORT_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_IMPORT_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function requireIdempotencyKey(value) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, "command.idempotencyKey must be 8-128 safe characters");
  }
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !HASH.test(value)) fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a sha256 fingerprint`);
  return value;
}

function requireSemver(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a strict semantic version`);
  return value;
}

function canonicalInstant(value, label) {
  if (typeof value !== "string") fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function toBytes(value, label) {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `${label} must be a string or Uint8Array`);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function identityKey(value) {
  return `${value.tenant_id}\u0000${value.object_type}\u0000${value.object_id}\u0000${value.version}`;
}

function issue(code, path) {
  return Object.freeze({ code, path });
}

function uniqueIssues(issues) {
  const byKey = new Map();
  for (const item of issues) byKey.set(`${item.code}\u0000${item.path}`, item);
  return [...byKey.values()].sort((left, right) => {
    const leftKey = `${left.code}\u0000${left.path}`;
    const rightKey = `${right.code}\u0000${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function requestFingerprint(command) {
  const files = command.files.map((file, index) => {
    if (!isObject(file) || typeof file.path !== "string" || !(typeof file.bytes === "string" || file.bytes instanceof Uint8Array)) {
      fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `command.files[${index}] must contain path and bytes`);
    }
    return { path: file.path, sha256: digestEvidenceBytes(toBytes(file.bytes, `command.files[${index}].bytes`)) };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return digestEvidenceBytes(canonicalizeEvidenceValue({
    schema_version: EVIDENCE_IMPORT_VERSION,
    tenant_id: command.tenantId,
    source_id: command.sourceId,
    expected_manifest_fingerprint: command.expectedManifestFingerprint,
    manifest_sha256: digestEvidenceBytes(toBytes(command.manifestBytes, "command.manifestBytes")),
    checksums_sha256: digestEvidenceBytes(toBytes(command.checksumsBytes, "command.checksumsBytes")),
    files
  }));
}

function normalizeCommand(value) {
  exactObject(value, [
    "attemptId",
    "idempotencyKey",
    "tenantId",
    "sourceId",
    "receivedAt",
    "expectedManifestFingerprint",
    "manifestBytes",
    "checksumsBytes",
    "files"
  ], [], "command");
  if (!Array.isArray(value.files) || value.files.length === 0) fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, "command.files must be a non-empty array");
  const command = {
    attemptId: requireId(value.attemptId, "command.attemptId"),
    idempotencyKey: requireIdempotencyKey(value.idempotencyKey),
    tenantId: requireId(value.tenantId, "command.tenantId"),
    sourceId: requireId(value.sourceId, "command.sourceId"),
    receivedAt: canonicalInstant(value.receivedAt, "command.receivedAt"),
    expectedManifestFingerprint: requireHash(value.expectedManifestFingerprint, "command.expectedManifestFingerprint"),
    manifestBytes: toBytes(value.manifestBytes, "command.manifestBytes"),
    checksumsBytes: toBytes(value.checksumsBytes, "command.checksumsBytes"),
    files: value.files.map((file, index) => {
      exactObject(file, ["path", "bytes"], [], `command.files[${index}]`);
      if (typeof file.path !== "string" || file.path.length < 1 || file.path.length > 140) {
        fail(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, `command.files[${index}].path is invalid`);
      }
      return { path: file.path, bytes: toBytes(file.bytes, `command.files[${index}].bytes`) };
    })
  };
  return { ...command, requestFingerprint: requestFingerprint(command) };
}

function recordBody(input) {
  return {
    schema_version: EVIDENCE_IMPORT_VERSION,
    record_type: "evidence_import_record",
    attempt_id: input.attemptId,
    idempotency_key: input.idempotencyKey,
    request_fingerprint: input.requestFingerprint,
    tenant_id: input.tenantId,
    source_id: input.sourceId,
    received_at: input.receivedAt,
    evidence_ref: input.evidenceRef,
    data_origin: input.dataOrigin,
    manifest_fingerprint: input.manifestFingerprint,
    content_fingerprint: input.contentFingerprint,
    outcome: input.outcome,
    imported_object_count: input.importedObjectCount,
    duplicate_object_count: input.duplicateObjectCount,
    errors: uniqueIssues(input.errors),
    external_anchor_verified: input.externalAnchorVerified,
    authenticity_verified: false,
    authorization_verified: false,
    performance_claim_allowed: false,
    certification_issued: false,
    previous_record_fingerprint: input.previousRecordFingerprint
  };
}

function createRecord(input) {
  const body = recordBody(input);
  return deepFreeze({ ...body, record_fingerprint: digestEvidenceBytes(canonicalizeEvidenceValue(body)) });
}

function appendRecord(ledger, command, details) {
  const previousRecordFingerprint = ledger.attempts.at(-1)?.record_fingerprint ?? null;
  const record = createRecord({
    attemptId: command.attemptId,
    idempotencyKey: command.idempotencyKey,
    requestFingerprint: command.requestFingerprint,
    tenantId: command.tenantId,
    sourceId: command.sourceId,
    receivedAt: command.receivedAt,
    evidenceRef: details.evidenceRef ?? null,
    dataOrigin: details.dataOrigin ?? null,
    manifestFingerprint: details.manifestFingerprint ?? null,
    contentFingerprint: details.contentFingerprint ?? null,
    outcome: details.outcome,
    importedObjectCount: details.importedObjectCount ?? 0,
    duplicateObjectCount: details.duplicateObjectCount ?? 0,
    errors: details.errors ?? [],
    externalAnchorVerified: details.externalAnchorVerified ?? false,
    previousRecordFingerprint
  });
  return { record, attempts: [...ledger.attempts, record] };
}

function normalizeReference(value, path, ownerTenant, expectedType, identities, issues) {
  const fields = ["object_type", "object_id", "version", "tenant_id"];
  if (!isObject(value)
    || Object.keys(value).length !== fields.length
    || !fields.every((field) => Object.hasOwn(value, field) && typeof value[field] === "string")) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, path));
    return;
  }
  if (!Object.hasOwn(OBJECT_ID_FIELDS, value.object_type)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.object_type`));
  if (!ID.test(value.object_id)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.object_id`));
  if (!SEMVER.test(value.version)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.version`));
  if (!ID.test(value.tenant_id)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.tenant_id`));
  if (expectedType && value.object_type !== expectedType) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.object_type`));
  if (value.tenant_id !== ownerTenant) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.tenantMismatch, `${path}.tenant_id`));
  if (!identities.has(identityKey(value))) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceMissing, path));
}

function validTime(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function checkInstant(value, path, receivedMs, issues, allowFuture = false) {
  if (!validTime(value)) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeInvalid, path));
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!allowFuture && milliseconds > receivedMs) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid, path));
  return milliseconds;
}

function checkWindow(window, path, receivedMs, issues, allowFuture = false) {
  if (!isObject(window)) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeInvalid, path));
    return null;
  }
  const starts = checkInstant(window.starts_at, `${path}.starts_at`, receivedMs, issues, allowFuture);
  const ends = checkInstant(window.ends_at, `${path}.ends_at`, receivedMs, issues, allowFuture);
  if (starts !== null && ends !== null && starts > ends) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid, path));
  return starts === null || ends === null ? null : { starts, ends };
}

function parseObjects(command, manifest) {
  const byPath = new Map(command.files.map((file) => [file.path, file.bytes]));
  return manifest.objects.map((descriptor) => ({ descriptor, payload: JSON.parse(new TextDecoder().decode(byPath.get(descriptor.path))) }));
}

function validateUnits(entry, path, issues) {
  if (entry.payload.object_type === "observation") {
    if (!UNITS.has(entry.payload.unit)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.unitInvalid, `${path}.unit`));
  }
  if (entry.payload.object_type === "method" && Array.isArray(entry.payload.parameters)) {
    entry.payload.parameters.forEach((parameter, index) => {
      const parameterPath = `${path}.parameters[${index}].unit`;
      if (typeof parameter?.value === "number" && !UNITS.has(parameter?.unit)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.unitInvalid, parameterPath));
      if (typeof parameter?.value !== "number" && parameter?.unit !== null) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.unitInvalid, parameterPath));
    });
  }
}

function validateEnvelope(entry, path, issues) {
  const payload = entry.payload;
  const fields = OBJECT_FIELDS[payload.object_type];
  if (!fields) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.object_type`));
    return;
  }
  const expected = new Set(fields);
  for (const field of Object.keys(payload)) {
    if (!expected.has(field)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.${field}`));
  }
  for (const field of fields) {
    if (!Object.hasOwn(payload, field)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.${field}`));
  }
  if (payload.schema_version !== EVIDENCE_IMPORT_VERSION) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.schema_version`));
  if (typeof payload.created_by !== "string" || !ID.test(payload.created_by)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.created_by`));
  const authorization = payload.authorization_scope;
  if (!isObject(authorization)) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope`));
    return;
  }
  const authorizationFields = new Set(["visibility", "purpose", "recipients", "expires_at"]);
  for (const field of Object.keys(authorization)) {
    if (!authorizationFields.has(field)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope.${field}`));
  }
  for (const field of authorizationFields) {
    if (!Object.hasOwn(authorization, field)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope.${field}`));
  }
  if (!new Set(["private", "shared", "public"]).has(authorization.visibility)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope.visibility`));
  if (typeof authorization.purpose !== "string" || authorization.purpose.length < 3) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope.purpose`));
  if (!Array.isArray(authorization.recipients)
    || authorization.recipients.some((recipient) => typeof recipient !== "string" || !ID.test(recipient))
    || new Set(authorization.recipients).size !== authorization.recipients.length) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.objectInvalid, `${path}.authorization_scope.recipients`));
  }
}

function validateTimes(entry, path, receivedMs, identities, issues) {
  const payload = entry.payload;
  const created = checkInstant(payload.created_at, `${path}.created_at`, receivedMs, issues);
  const expires = payload.authorization_scope?.expires_at;
  if (expires !== null && expires !== undefined) {
    const expiresMs = checkInstant(expires, `${path}.authorization_scope.expires_at`, receivedMs, issues, true);
    if (created !== null && expiresMs !== null && expiresMs <= created) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid, `${path}.authorization_scope.expires_at`));
  }
  if (payload.object_type === "scope") checkWindow(payload.validity, `${path}.validity`, receivedMs, issues, true);
  if (payload.object_type === "run") {
    checkWindow(payload.planned_window, `${path}.planned_window`, receivedMs, issues, true);
    checkWindow(payload.actual_window, `${path}.actual_window`, receivedMs, issues);
  }
  if (payload.object_type === "observation") checkInstant(payload.observed_at, `${path}.observed_at`, receivedMs, issues);
  if (payload.object_type === "evidence_version") checkInstant(payload.sealed_at, `${path}.sealed_at`, receivedMs, issues);
  if (payload.object_type === "review") checkInstant(payload.concluded_at, `${path}.concluded_at`, receivedMs, issues);
  if (payload.object_type === "policy_decision") checkInstant(payload.decided_at, `${path}.decided_at`, receivedMs, issues);
  if (payload.object_type === "export_grant") {
    const grantExpires = checkInstant(payload.expires_at, `${path}.expires_at`, receivedMs, issues, true);
    if (created !== null && grantExpires !== null && grantExpires <= created) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid, `${path}.expires_at`));
  }

  if (payload.object_type === "observation" && isObject(payload.run_ref)) {
    const run = identities.get(identityKey(payload.run_ref))?.payload;
    if (run) {
      const window = run.actual_window;
      if (validTime(payload.observed_at) && validTime(window?.starts_at) && validTime(window?.ends_at)) {
        const observed = Date.parse(payload.observed_at);
        if (observed < Date.parse(window.starts_at) || observed > Date.parse(window.ends_at)) {
          issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.timeOrderInvalid, `${path}.observed_at`));
        }
      }
    }
  }
}

function validateReferences(entry, path, identities, issues) {
  const payload = entry.payload;
  const tenant = payload.tenant_id;
  const one = (value, name, type) => normalizeReference(value, `${path}.${name}`, tenant, type, identities, issues);
  const many = (values, name, type) => {
    if (!Array.isArray(values)) {
      issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, `${path}.${name}`));
      return;
    }
    values.forEach((value, index) => normalizeReference(value, `${path}.${name}[${index}]`, tenant, type, identities, issues));
  };
  if (payload.object_type === "run") {
    one(payload.scope_ref, "scope_ref", "scope");
    one(payload.method_ref, "method_ref", "method");
  } else if (payload.object_type === "observation") {
    one(payload.run_ref, "run_ref", "run");
  } else if (payload.object_type === "artifact") {
    many(payload.derived_from, "derived_from");
  } else if (payload.object_type === "evidence_version") {
    one(payload.scope_ref, "scope_ref", "scope");
    one(payload.method_ref, "method_ref", "method");
    many(payload.run_refs, "run_refs", "run");
    many(payload.observation_refs, "observation_refs", "observation");
    many(payload.artifact_refs, "artifact_refs", "artifact");
  } else if (payload.object_type === "review") {
    one(payload.evidence_ref, "evidence_ref", "evidence_version");
  } else if (payload.object_type === "policy_decision") {
    many(payload.evidence_refs, "evidence_refs", "evidence_version");
  } else if (payload.object_type === "export_grant") {
    many(payload.resource_refs, "resource_refs");
  }
}

function validateEvidenceReferenceSet(objects, identities, issues) {
  const evidence = objects.find(({ payload }) => payload.object_type === "evidence_version")?.payload;
  if (!evidence) return;
  const declared = [evidence.scope_ref, evidence.method_ref, ...(evidence.run_refs ?? []), ...(evidence.observation_refs ?? []), ...(evidence.artifact_refs ?? [])]
    .filter(isObject)
    .map(identityKey)
    .sort();
  const protectedContent = objects
    .filter(({ descriptor }) => descriptor.role === "evidence-content")
    .map(({ descriptor }) => identityKey(descriptor))
    .sort();
  if (JSON.stringify(declared) !== JSON.stringify(protectedContent)) {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceSetMismatch, "$.evidence_version.content_refs"));
  }
  for (const key of declared) {
    if (!identities.has(key)) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceMissing, "$.evidence_version.content_refs"));
  }
}

function validateSemanticBundle(command, verification, manifest, objects) {
  const issues = [];
  const receivedMs = Date.parse(command.receivedAt);
  checkInstant(manifest.created_at, "$.manifest.created_at", receivedMs, issues);
  if (manifest.evidence_ref.tenant_id !== command.tenantId) issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.tenantMismatch, "$.manifest.evidence_ref.tenant_id"));
  const identities = new Map(objects.map((entry) => [identityKey(entry.descriptor), entry]));
  for (const entry of objects) {
    const path = `$.files.${entry.descriptor.path}`;
    if (entry.descriptor.tenant_id !== command.tenantId || entry.payload.tenant_id !== command.tenantId) {
      issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.tenantMismatch, `${path}.tenant_id`));
    }
    if (entry.payload.schema_version !== EVIDENCE_IMPORT_VERSION || !Object.hasOwn(OBJECT_ID_FIELDS, entry.payload.object_type)) {
      issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.referenceInvalid, path));
    }
    validateEnvelope(entry, path, issues);
    validateUnits(entry, path, issues);
    validateTimes(entry, path, receivedMs, identities, issues);
    validateReferences(entry, path, identities, issues);
  }
  validateEvidenceReferenceSet(objects, identities, issues);
  if (verification.data_origin !== "synthetic" && verification.data_origin !== "hybrid" && verification.data_origin !== "measured") {
    issues.push(issue(EVIDENCE_IMPORT_ERROR_CODES.inputInvalid, "$.manifest.data_origin"));
  }
  return uniqueIssues(issues);
}

function normalizeStoredObject(value, index, tenantId) {
  const required = ["object_type", "object_id", "version", "tenant_id", "object_fingerprint", "sha256", "manifest_fingerprint", "attempt_id", "imported_at"];
  exactObject(value, required, [], `ledger.objects[${index}]`);
  if (value.tenant_id !== tenantId) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.objects[${index}] crosses the tenant boundary`);
  if (!Object.hasOwn(OBJECT_ID_FIELDS, value.object_type)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.objects[${index}].object_type is invalid`);
  requireId(value.object_id, `ledger.objects[${index}].object_id`);
  requireSemver(value.version, `ledger.objects[${index}].version`);
  requireHash(value.object_fingerprint, `ledger.objects[${index}].object_fingerprint`);
  requireHash(value.sha256, `ledger.objects[${index}].sha256`);
  requireHash(value.manifest_fingerprint, `ledger.objects[${index}].manifest_fingerprint`);
  requireId(value.attempt_id, `ledger.objects[${index}].attempt_id`);
  canonicalInstant(value.imported_at, `ledger.objects[${index}].imported_at`);
  return { ...value };
}

function normalizeRecord(value, index, previousFingerprint, tenantId) {
  const bodyFields = [
    "schema_version", "record_type", "attempt_id", "idempotency_key", "request_fingerprint", "tenant_id", "source_id", "received_at",
    "evidence_ref", "data_origin", "manifest_fingerprint", "content_fingerprint", "outcome", "imported_object_count", "duplicate_object_count",
    "errors", "external_anchor_verified", "authenticity_verified", "authorization_verified", "performance_claim_allowed", "certification_issued",
    "previous_record_fingerprint"
  ];
  exactObject(value, [...bodyFields, "record_fingerprint"], [], `ledger.attempts[${index}]`);
  if (value.schema_version !== EVIDENCE_IMPORT_VERSION || value.record_type !== "evidence_import_record" || value.tenant_id !== tenantId) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] has an invalid envelope`);
  }
  if (value.previous_record_fingerprint !== previousFingerprint) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerFingerprintMismatch, `ledger.attempts[${index}] breaks the append-only chain`);
  requireHash(value.record_fingerprint, `ledger.attempts[${index}].record_fingerprint`);
  const body = Object.fromEntries(bodyFields.map((field) => [field, value[field]]));
  if (digestEvidenceBytes(canonicalizeEvidenceValue(body)) !== value.record_fingerprint) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerFingerprintMismatch, `ledger.attempts[${index}] fingerprint does not match`);
  }
  requireId(value.attempt_id, `ledger.attempts[${index}].attempt_id`);
  requireIdempotencyKey(value.idempotency_key);
  requireHash(value.request_fingerprint, `ledger.attempts[${index}].request_fingerprint`);
  requireId(value.source_id, `ledger.attempts[${index}].source_id`);
  canonicalInstant(value.received_at, `ledger.attempts[${index}].received_at`);
  if (value.evidence_ref !== null) {
    exactObject(value.evidence_ref, ["object_type", "object_id", "version", "tenant_id"], [], `ledger.attempts[${index}].evidence_ref`);
    if (value.evidence_ref.object_type !== "evidence_version" || value.evidence_ref.tenant_id !== tenantId) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}].evidence_ref is invalid`);
    requireId(value.evidence_ref.object_id, `ledger.attempts[${index}].evidence_ref.object_id`);
    requireSemver(value.evidence_ref.version, `ledger.attempts[${index}].evidence_ref.version`);
  }
  if (value.data_origin !== null && !new Set(["synthetic", "hybrid", "measured"]).has(value.data_origin)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}].data_origin is invalid`);
  for (const field of ["manifest_fingerprint", "content_fingerprint", "previous_record_fingerprint"]) {
    if (value[field] !== null) requireHash(value[field], `ledger.attempts[${index}].${field}`);
  }
  if (!new Set(["committed", "replayed", "rejected"]).has(value.outcome)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}].outcome is invalid`);
  if (!Number.isSafeInteger(value.imported_object_count) || value.imported_object_count < 0
    || !Number.isSafeInteger(value.duplicate_object_count) || value.duplicate_object_count < 0) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] has invalid object counts`);
  }
  if (!Array.isArray(value.errors)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}].errors must be an array`);
  for (const [errorIndex, entry] of value.errors.entries()) {
    exactObject(entry, ["code", "path"], [], `ledger.attempts[${index}].errors[${errorIndex}]`);
    if (typeof entry.code !== "string" || !/^[a-z][a-z0-9_]{2,127}$/.test(entry.code)
      || typeof entry.path !== "string" || !entry.path.startsWith("$") || entry.path.length > 500) {
      fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}].errors[${errorIndex}] is invalid`);
    }
  }
  if (value.outcome === "rejected" && (value.imported_object_count !== 0 || value.errors.length === 0)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] has an invalid rejected outcome`);
  if (value.outcome === "committed" && (value.imported_object_count < 1 || value.errors.length !== 0)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] has an invalid committed outcome`);
  if (value.outcome === "replayed" && (value.imported_object_count !== 0 || value.errors.length !== 0)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] has an invalid replayed outcome`);
  if (typeof value.external_anchor_verified !== "boolean"
    || value.authenticity_verified !== false
    || value.authorization_verified !== false
    || value.performance_claim_allowed !== false
    || value.certification_issued !== false) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] crosses the trust boundary`);
  }
  if (value.outcome !== "rejected" && (!value.external_anchor_verified || value.manifest_fingerprint === null || value.content_fingerprint === null || value.evidence_ref === null)) {
    fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.attempts[${index}] lacks verified import metadata`);
  }
  return structuredClone(value);
}

function normalizeLedger(value) {
  exactObject(value, ["schema_version", "tenant_id", "objects", "attempts"], [], "ledger");
  if (value.schema_version !== EVIDENCE_IMPORT_VERSION) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `ledger.schema_version must equal ${EVIDENCE_IMPORT_VERSION}`);
  const tenantId = requireId(value.tenant_id, "ledger.tenant_id");
  if (!Array.isArray(value.objects) || !Array.isArray(value.attempts)) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, "ledger objects and attempts must be arrays");
  const objects = value.objects.map((entry, index) => normalizeStoredObject(entry, index, tenantId));
  const keys = objects.map(identityKey);
  if (new Set(keys).size !== keys.length) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, "ledger object identities must be unique");
  const attempts = [];
  let previous = null;
  for (const [index, entry] of value.attempts.entries()) {
    const normalized = normalizeRecord(entry, index, previous, tenantId);
    attempts.push(normalized);
    previous = normalized.record_fingerprint;
  }
  if (new Set(attempts.map(({ attempt_id: id }) => id)).size !== attempts.length) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, "ledger attempt IDs must be unique");
  const idempotentRequests = attempts.map(({ idempotency_key: key, request_fingerprint: fingerprint }) => `${key}\u0000${fingerprint}`);
  if (new Set(idempotentRequests).size !== idempotentRequests.length) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, "ledger contains a duplicated idempotent request");
  const attemptById = new Map(attempts.map((attempt) => [attempt.attempt_id, attempt]));
  for (const object of objects) {
    const attempt = attemptById.get(object.attempt_id);
    if (!attempt
      || attempt.outcome !== "committed"
      || attempt.received_at !== object.imported_at
      || attempt.manifest_fingerprint !== object.manifest_fingerprint) {
      fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, "stored objects must originate from their committed import attempt");
    }
  }
  for (const attempt of attempts) {
    const imported = objects.filter(({ attempt_id: attemptId }) => attemptId === attempt.attempt_id).length;
    if (attempt.imported_object_count !== imported) fail(EVIDENCE_IMPORT_ERROR_CODES.ledgerInvalid, `attempt ${attempt.attempt_id} imported object count does not match the ledger`);
  }
  return { schema_version: EVIDENCE_IMPORT_VERSION, tenant_id: tenantId, objects, attempts };
}

export function createEvidenceImportLedger(input) {
  exactObject(input, ["tenantId"], [], "input");
  return deepFreeze({
    schema_version: EVIDENCE_IMPORT_VERSION,
    tenant_id: requireId(input.tenantId, "input.tenantId"),
    objects: [],
    attempts: []
  });
}

export function verifyEvidenceImportLedger(input) {
  const ledger = normalizeLedger(input);
  return deepFreeze({
    schema_version: EVIDENCE_IMPORT_VERSION,
    tenant_id: ledger.tenant_id,
    stored_object_count: ledger.objects.length,
    attempt_count: ledger.attempts.length,
    last_record_fingerprint: ledger.attempts.at(-1)?.record_fingerprint ?? null,
    append_only_chain_verified: true,
    content_authenticity_verified: false,
    authorization_verified: false,
    certification_issued: false
  });
}

export function importEvidenceBundle(ledgerInput, commandInput) {
  const ledger = normalizeLedger(ledgerInput);
  const command = normalizeCommand(commandInput);
  if (command.tenantId !== ledger.tenant_id) fail(EVIDENCE_IMPORT_ERROR_CODES.tenantMismatch, "command tenant does not match ledger tenant");

  const sameAttempt = ledger.attempts.find(({ attempt_id: id }) => id === command.attemptId);
  if (sameAttempt) {
    if (sameAttempt.idempotency_key === command.idempotencyKey && sameAttempt.request_fingerprint === command.requestFingerprint) {
      return deepFreeze({ ledger: deepFreeze(ledger), record: deepFreeze(sameAttempt), idempotent_replay: true });
    }
    fail(EVIDENCE_IMPORT_ERROR_CODES.attemptIdConflict, "attemptId already identifies a different request");
  }

  const sameRequest = ledger.attempts.find(({ idempotency_key: key, request_fingerprint: fingerprint }) => (
    key === command.idempotencyKey && fingerprint === command.requestFingerprint
  ));
  if (sameRequest) {
    return deepFreeze({ ledger: deepFreeze(ledger), record: deepFreeze(sameRequest), idempotent_replay: true });
  }
  const sameKey = ledger.attempts.find(({ idempotency_key: key }) => key === command.idempotencyKey);
  if (sameKey) {
    const appended = appendRecord(ledger, command, {
      outcome: "rejected",
      errors: [issue(EVIDENCE_IMPORT_ERROR_CODES.idempotencyConflict, "$.idempotency_key")]
    });
    return deepFreeze({
      ledger: deepFreeze({ ...ledger, attempts: appended.attempts }),
      record: appended.record,
      idempotent_replay: false
    });
  }

  let verification;
  try {
    verification = verifyEvidenceContentBundle({
      manifestBytes: command.manifestBytes,
      checksumsBytes: command.checksumsBytes,
      files: command.files,
      expectedManifestFingerprint: command.expectedManifestFingerprint
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : EVIDENCE_IMPORT_ERROR_CODES.integrityFailed;
    const appended = appendRecord(ledger, command, {
      outcome: "rejected",
      errors: [issue(code, "$.bundle")]
    });
    return deepFreeze({
      ledger: deepFreeze({ ...ledger, attempts: appended.attempts }),
      record: appended.record,
      idempotent_replay: false
    });
  }

  const manifest = JSON.parse(new TextDecoder().decode(command.manifestBytes));
  const objects = parseObjects(command, manifest);
  const semanticIssues = validateSemanticBundle(command, verification, manifest, objects);
  if (semanticIssues.length > 0) {
    const appended = appendRecord(ledger, command, {
      evidenceRef: verification.evidence_ref,
      dataOrigin: verification.data_origin,
      manifestFingerprint: verification.manifest_fingerprint,
      contentFingerprint: verification.content_fingerprint,
      outcome: "rejected",
      errors: semanticIssues,
      externalAnchorVerified: true
    });
    return deepFreeze({
      ledger: deepFreeze({ ...ledger, attempts: appended.attempts }),
      record: appended.record,
      idempotent_replay: false
    });
  }

  const storedByIdentity = new Map(ledger.objects.map((entry) => [identityKey(entry), entry]));
  const conflicts = [];
  const additions = [];
  let duplicates = 0;
  for (const descriptor of manifest.objects) {
    const existing = storedByIdentity.get(identityKey(descriptor));
    if (!existing) {
      additions.push({
        object_type: descriptor.object_type,
        object_id: descriptor.object_id,
        version: descriptor.version,
        tenant_id: descriptor.tenant_id,
        object_fingerprint: descriptor.object_fingerprint,
        sha256: descriptor.sha256,
        manifest_fingerprint: verification.manifest_fingerprint,
        attempt_id: command.attemptId,
        imported_at: command.receivedAt
      });
    } else if (existing.object_fingerprint === descriptor.object_fingerprint && existing.sha256 === descriptor.sha256) {
      duplicates += 1;
    } else {
      conflicts.push(issue(EVIDENCE_IMPORT_ERROR_CODES.versionConflict, `$.objects.${descriptor.object_type}:${descriptor.object_id}@${descriptor.version}`));
    }
  }

  if (conflicts.length > 0) {
    const appended = appendRecord(ledger, command, {
      evidenceRef: verification.evidence_ref,
      dataOrigin: verification.data_origin,
      manifestFingerprint: verification.manifest_fingerprint,
      contentFingerprint: verification.content_fingerprint,
      outcome: "rejected",
      duplicateObjectCount: duplicates,
      errors: conflicts,
      externalAnchorVerified: true
    });
    return deepFreeze({
      ledger: deepFreeze({ ...ledger, attempts: appended.attempts }),
      record: appended.record,
      idempotent_replay: false
    });
  }

  const outcome = additions.length === 0 ? "replayed" : "committed";
  const appended = appendRecord(ledger, command, {
    evidenceRef: verification.evidence_ref,
    dataOrigin: verification.data_origin,
    manifestFingerprint: verification.manifest_fingerprint,
    contentFingerprint: verification.content_fingerprint,
    outcome,
    importedObjectCount: additions.length,
    duplicateObjectCount: duplicates,
    externalAnchorVerified: true
  });
  return deepFreeze({
    ledger: deepFreeze({ ...ledger, objects: [...ledger.objects, ...additions], attempts: appended.attempts }),
    record: appended.record,
    idempotent_replay: false
  });
}
