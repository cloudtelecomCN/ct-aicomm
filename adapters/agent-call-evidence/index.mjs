import { createHash } from "node:crypto";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ASSURANCE = new Set(["not_observed", "declared", "external_assertion"]);
const STATUS = new Set(["succeeded", "failed", "timeout", "cancelled"]);
const TRANSPORT = new Set(["stdio", "http", "sse", "websocket", "other"]);

function id(value, field) {
  if (typeof value !== "string" || !ID.test(value)) throw new TypeError(`${field} must be a CT-AIComm identifier`);
  return value;
}

function version(value, field) {
  if (typeof value !== "string" || !VERSION.test(value)) throw new TypeError(`${field} must be a CT-AIComm version`);
  return value;
}

function fingerprintValue(value, field) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new TypeError(`${field} must be a sha256 fingerprint`);
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
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("event values must contain only JSON-compatible objects");
  }
  if (ancestors.has(value)) throw new TypeError("event values must not contain cycles");
  ancestors.add(value);
  const result = `{${Object.keys(value).sort().map((key) => {
    if (value[key] === undefined) throw new TypeError("event values must not contain undefined fields");
    return `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`;
  }).join(",")}}`;
  ancestors.delete(value);
  return result;
}

export function fingerprintAgentCallValue(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function isoDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO-8601 timestamp with timezone`);
  }
  return value;
}

function mapIdentity(identity = {}) {
  const identityAssurance = identity.identity_assurance ?? "not_observed";
  const authorizationAssurance = identity.authorization_assurance ?? "not_observed";
  if (!ASSURANCE.has(identityAssurance) || !ASSURANCE.has(authorizationAssurance)) throw new TypeError("identity assurance values are invalid");
  const actorRef = identity.actor_ref ?? "agent:unobserved";
  id(actorRef, "identity.actor_ref");
  const representedPrincipalRef = identity.represented_principal_ref ?? null;
  if (representedPrincipalRef !== null) id(representedPrincipalRef, "identity.represented_principal_ref");
  const scopes = identity.authorization_scopes ?? [];
  if (!Array.isArray(scopes) || scopes.length > 64) throw new TypeError("identity.authorization_scopes must be an array of at most 64 identifiers");
  scopes.forEach((scope) => id(scope, "identity.authorization_scopes[]"));
  if (new Set(scopes).size !== scopes.length) throw new TypeError("identity.authorization_scopes must be unique");
  const credentialFingerprint = identity.credential_fingerprint ?? null;
  if (credentialFingerprint !== null) fingerprintValue(credentialFingerprint, "identity.credential_fingerprint");
  if (identityAssurance === "external_assertion" && credentialFingerprint === null) throw new TypeError("external identity assertions require a credential fingerprint");
  if (authorizationAssurance === "external_assertion" && scopes.length === 0) throw new TypeError("external authorization assertions require at least one scope");
  return {
    actor_ref: actorRef,
    represented_principal_ref: representedPrincipalRef,
    identity_assurance: identityAssurance,
    authorization_assurance: authorizationAssurance,
    authorization_scopes: [...scopes],
    credential_fingerprint: credentialFingerprint,
  };
}

function component(value, field) {
  if (!value || typeof value !== "object") throw new TypeError(`${field} is required`);
  id(value.name, `${field}.name`);
  version(value.version, `${field}.version`);
  fingerprintValue(value.artifact_fingerprint, `${field}.artifact_fingerprint`);
  return { name: value.name, version: value.version, artifact_fingerprint: value.artifact_fingerprint };
}

/**
 * Build Agent-call evidence from an observed event. Payload values are hashed in
 * memory and are never copied to the returned record. This mapper does not
 * authenticate identity, authorize a call, or validate source truthfulness.
 */
export function adaptAgentCallEvidence({ event, capture, identity, protocol = "mcp", targetKind = "tool" } = {}) {
  if (!event || typeof event !== "object") throw new TypeError("event is required");
  if (!capture || typeof capture !== "object") throw new TypeError("capture metadata is required");
  if (!new Set(["mcp", "a2a", "custom"]).has(protocol)) throw new TypeError("protocol is unsupported");
  if (!new Set(["tool", "agent", "endpoint"]).has(targetKind)) throw new TypeError("targetKind is unsupported");
  const targetName = id(event.target_name, "event.target_name");
  if (!Object.hasOwn(event, "request")) throw new TypeError("event.request is required to compute the request fingerprint");
  const callId = id(capture.call_id, "capture.call_id");
  const protocolVersion = version(capture.protocol_version, "capture.protocol_version");
  if (!TRANSPORT.has(capture.transport)) throw new TypeError("capture.transport is unsupported");
  const startedAt = isoDate(capture.started_at, "capture.started_at");
  const completedAt = isoDate(capture.completed_at, "capture.completed_at");
  const durationMs = Number(capture.duration_ms);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new TypeError("capture.duration_ms must be a non-negative safe integer");
  if (!STATUS.has(capture.status)) throw new TypeError("capture.status is unsupported");
  const errorCode = capture.error_code ?? null;
  if (capture.status === "succeeded" && (errorCode !== null || !Object.hasOwn(event, "response") || event.response === undefined)) {
    throw new TypeError("successful calls require a response and must not declare an error code");
  }
  if (capture.status !== "succeeded" && (typeof errorCode !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(errorCode))) {
    throw new TypeError("non-successful calls require a normalized error code");
  }
  if (!new Set(["synthetic", "measured"]).has(capture.data_origin)) throw new TypeError("capture.data_origin must be explicitly synthetic or measured");
  if (!new Set(["protocol_transcript", "otel_trace", "application_log", "declared"]).has(capture.source_kind)) throw new TypeError("capture.source_kind is unsupported");
  const runtime = component(capture.runtime, "capture.runtime");
  const recorder = component(capture.recorder, "capture.recorder");
  const traceId = capture.trace_id ?? null;
  const spanId = capture.span_id ?? null;
  if (traceId !== null && !/^[a-f0-9]{32}$/u.test(traceId)) throw new TypeError("capture.trace_id must be a 32-character lowercase hexadecimal ID");
  if (spanId !== null && !/^[a-f0-9]{16}$/u.test(spanId)) throw new TypeError("capture.span_id must be a 16-character lowercase hexadecimal ID");
  if ((traceId === null) !== (spanId === null)) throw new TypeError("capture.trace_id and capture.span_id must be supplied together");
  const parentCallId = capture.parent_call_id ?? null;
  if (parentCallId !== null) id(parentCallId, "capture.parent_call_id");
  const sourceValue = { source_call_id: callId, target_name: targetName, request: event.request };
  if (Object.hasOwn(event, "response")) sourceValue.response = event.response;
  if (event.source_event_id !== undefined) sourceValue.source_event_id = id(event.source_event_id, "event.source_event_id");
  const evidence = {
    schema_version: "1.0.0",
    record_type: "agent_call_evidence",
    evidence_id: id(capture.evidence_id, "capture.evidence_id"),
    recorded_at: isoDate(capture.recorded_at ?? completedAt, "capture.recorded_at"),
    protocol: { name: protocol, version: protocolVersion, transport: capture.transport },
    call: { call_id: callId, operation: id(capture.operation ?? (protocol === "mcp" ? "tools/call" : "invoke"), "capture.operation"), target: { kind: targetKind, name: targetName } },
    identity: mapIdentity(identity),
    timing: { started_at: startedAt, completed_at: completedAt, duration_ms: durationMs },
    outcome: {
      status: capture.status,
      error_code: errorCode,
      request_fingerprint: fingerprintAgentCallValue(event.request),
      response_fingerprint: capture.status === "succeeded" ? fingerprintAgentCallValue(event.response) : null,
    },
    correlation: { trace_id: traceId, span_id: spanId, parent_call_id: parentCallId },
    provenance: {
      data_origin: capture.data_origin,
      source: { kind: capture.source_kind, fingerprint: fingerprintAgentCallValue(sourceValue) },
      runtime,
      recorder,
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
  evidence.content_fingerprint = fingerprintAgentCallValue(evidence);
  return Object.freeze(evidence);
}

export function verifyAgentCallEvidenceFingerprint(evidence) {
  if (!evidence || typeof evidence !== "object" || typeof evidence.content_fingerprint !== "string") return false;
  const { content_fingerprint: supplied, ...content } = evidence;
  return SHA256.test(supplied) && fingerprintAgentCallValue(content) === supplied;
}
