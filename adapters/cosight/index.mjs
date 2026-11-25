import { createHash } from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ASSURANCE = new Set(["not_observed", "declared", "external_assertion"]);
const STATUS = new Set(["succeeded", "failed", "timeout", "cancelled"]);
const TRANSPORT = new Set(["stdio", "http", "sse", "websocket", "other"]);

function assertId(value, field) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new TypeError(`${field} must be a CT-AIComm identifier`);
  return value;
}

function assertVersion(value, field) {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) throw new TypeError(`${field} must be a CT-AIComm version`);
  return value;
}

function assertFingerprint(value, field) {
  if (typeof value !== "string" || !FINGERPRINT_PATTERN.test(value)) throw new TypeError(`${field} must be a sha256 fingerprint`);
  return value;
}

function canonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("event values must be finite JSON numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("event values must not contain cycles");
    ancestors.add(value);
    const result = `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("event values must contain only JSON-compatible objects");
  }
  if (ancestors.has(value)) throw new TypeError("event values must not contain cycles");
  ancestors.add(value);
  const result = `{${Object.keys(value).sort().map((key) => {
    const item = value[key];
    if (item === undefined) throw new TypeError("event values must not contain undefined fields");
    return `${JSON.stringify(key)}:${canonicalJson(item, ancestors)}`;
  }).join(",")}}`;
  ancestors.delete(value);
  return result;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function assertIsoDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO-8601 timestamp with timezone`);
  }
  return value;
}

function mapIdentity(identity = {}) {
  const identityAssurance = identity.identity_assurance ?? "not_observed";
  const authorizationAssurance = identity.authorization_assurance ?? "not_observed";
  if (!ASSURANCE.has(identityAssurance) || !ASSURANCE.has(authorizationAssurance)) {
    throw new TypeError("identity assurance values are invalid");
  }
  const actorRef = identity.actor_ref ?? "agent:cosight-unverified";
  assertId(actorRef, "identity.actor_ref");
  const representedPrincipalRef = identity.represented_principal_ref ?? null;
  if (representedPrincipalRef !== null) assertId(representedPrincipalRef, "identity.represented_principal_ref");
  const authorizationScopes = identity.authorization_scopes ?? [];
  if (!Array.isArray(authorizationScopes) || authorizationScopes.length > 64) throw new TypeError("identity.authorization_scopes must be an array of at most 64 identifiers");
  authorizationScopes.forEach((scope) => assertId(scope, "identity.authorization_scopes[]"));
  if (new Set(authorizationScopes).size !== authorizationScopes.length) throw new TypeError("identity.authorization_scopes must be unique");
  const credentialFingerprint = identity.credential_fingerprint ?? null;
  if (credentialFingerprint !== null) assertFingerprint(credentialFingerprint, "identity.credential_fingerprint");
  if (identityAssurance === "external_assertion" && credentialFingerprint === null) throw new TypeError("external identity assertions require a credential fingerprint");
  if (authorizationAssurance === "external_assertion" && authorizationScopes.length === 0) throw new TypeError("external authorization assertions require at least one scope");
  return {
    actor_ref: actorRef,
    represented_principal_ref: representedPrincipalRef,
    identity_assurance: identityAssurance,
    authorization_assurance: authorizationAssurance,
    authorization_scopes: [...authorizationScopes],
    credential_fingerprint: credentialFingerprint,
  };
}

/**
 * Convert a Co-Sight-style MCP tool-call record plus observed call metadata into
 * CT-AIComm Agent Call Evidence 1.0.0. Raw args/results are used transiently to
 * calculate fingerprints and are never copied into the returned evidence.
 */
export function adaptCoSightToolCall({ toolCall, capture, identity } = {}) {
  if (!toolCall || typeof toolCall !== "object") throw new TypeError("toolCall is required");
  if (!capture || typeof capture !== "object") throw new TypeError("capture metadata is required");
  const toolName = assertId(toolCall.tool_name, "toolCall.tool_name");
  if (!Object.hasOwn(toolCall, "tool_args")) throw new TypeError("toolCall.tool_args is required");
  const callId = assertId(capture.call_id, "capture.call_id");
  const protocolVersion = assertVersion(capture.protocol_version, "capture.protocol_version");
  const transport = capture.transport;
  if (!TRANSPORT.has(transport)) throw new TypeError("capture.transport is unsupported");
  const startedAt = assertIsoDate(capture.started_at, "capture.started_at");
  const completedAt = assertIsoDate(capture.completed_at, "capture.completed_at");
  const durationMs = Number(capture.duration_ms);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new TypeError("capture.duration_ms must be a non-negative safe integer");
  const status = capture.status;
  if (!STATUS.has(status)) throw new TypeError("capture.status is unsupported");
  const errorCode = capture.error_code ?? null;
  if (status === "succeeded" && (errorCode !== null || !Object.hasOwn(toolCall, "tool_result") || toolCall.tool_result === undefined)) {
    throw new TypeError("successful calls require a result and must not declare an error code");
  }
  if (status !== "succeeded" && (typeof errorCode !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(errorCode))) {
    throw new TypeError("non-successful calls require a normalized error code");
  }
  const dataOrigin = capture.data_origin;
  if (!new Set(["synthetic", "measured"]).has(dataOrigin)) throw new TypeError("capture.data_origin must be explicitly synthetic or measured");
  const sourceKind = capture.source_kind;
  if (!new Set(["protocol_transcript", "otel_trace", "application_log", "declared"]).has(sourceKind)) {
    throw new TypeError("capture.source_kind is unsupported");
  }
  const runtime = capture.runtime;
  const recorder = capture.recorder;
  for (const [component, name] of [[runtime, "capture.runtime"], [recorder, "capture.recorder"]]) {
    if (!component || typeof component !== "object") throw new TypeError(`${name} is required`);
    assertId(component.name, `${name}.name`);
    assertVersion(component.version, `${name}.version`);
    assertFingerprint(component.artifact_fingerprint, `${name}.artifact_fingerprint`);
  }
  const evidence = {
    schema_version: "1.0.0",
    record_type: "agent_call_evidence",
    evidence_id: assertId(capture.evidence_id, "capture.evidence_id"),
    recorded_at: assertIsoDate(capture.recorded_at ?? completedAt, "capture.recorded_at"),
    protocol: { name: "mcp", version: protocolVersion, transport },
    call: {
      call_id: callId,
      operation: assertId(capture.operation ?? "tools/call", "capture.operation"),
      target: { kind: "tool", name: toolName },
    },
    identity: mapIdentity(identity),
    timing: { started_at: startedAt, completed_at: completedAt, duration_ms: durationMs },
    outcome: {
      status,
      error_code: errorCode,
      request_fingerprint: fingerprint(toolCall.tool_args),
      response_fingerprint: status === "succeeded" ? fingerprint(toolCall.tool_result) : null,
    },
    correlation: {
      trace_id: capture.trace_id ?? null,
      span_id: capture.span_id ?? null,
      parent_call_id: capture.parent_call_id ?? null,
    },
    provenance: {
      data_origin: dataOrigin,
      source: { kind: sourceKind, fingerprint: fingerprint(toolCall) },
      runtime: { ...runtime },
      recorder: { ...recorder },
    },
    boundary: {
      raw_payload_retained: false,
      credentials_retained: false,
      ct_aicomm_executed_call: false,
      identity_authentication_performed: false,
      authorization_decision_performed: false,
      performance_claim_allowed: false,
      certification_claim_allowed: false,
    },
  };
  if (evidence.correlation.trace_id !== null && !/^[a-f0-9]{32}$/u.test(evidence.correlation.trace_id)) throw new TypeError("capture.trace_id must be a 32-character lowercase hexadecimal ID");
  if (evidence.correlation.span_id !== null && !/^[a-f0-9]{16}$/u.test(evidence.correlation.span_id)) throw new TypeError("capture.span_id must be a 16-character lowercase hexadecimal ID");
  if ((evidence.correlation.trace_id === null) !== (evidence.correlation.span_id === null)) throw new TypeError("capture.trace_id and capture.span_id must be supplied together");
  if (evidence.correlation.parent_call_id !== null) assertId(evidence.correlation.parent_call_id, "capture.parent_call_id");
  evidence.content_fingerprint = fingerprint(evidence);
  return Object.freeze(evidence);
}

export function verifyCoSightEvidenceFingerprint(evidence) {
  if (!evidence || typeof evidence !== "object" || typeof evidence.content_fingerprint !== "string") return false;
  const { content_fingerprint: supplied, ...content } = evidence;
  return FINGERPRINT_PATTERN.test(supplied) && fingerprint(content) === supplied;
}

