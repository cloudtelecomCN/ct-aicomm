import { adaptAgentCallEvidence } from "../agent-call-evidence/index.mjs";

const ATTR = {
  target: "gen_ai.tool.name",
  callId: "gen_ai.tool.call.id",
  request: "ct_aicomm.tool.arguments",
  response: "ct_aicomm.tool.result",
  protocolVersion: "ct_aicomm.mcp.version",
  transport: "ct_aicomm.mcp.transport",
  errorCode: "ct_aicomm.error.code",
  actor: "ct_aicomm.identity.actor_ref",
  principal: "ct_aicomm.identity.represented_principal_ref",
  scope: "ct_aicomm.identity.authorization_scope",
};

function unwrap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue", "bytesValue"]) {
    if (Object.hasOwn(value, key)) return value[key];
  }
  if (Array.isArray(value.arrayValue?.values)) return value.arrayValue.values.map(unwrap);
  if (value.kvlistValue?.values) return attributesToObject(value.kvlistValue.values);
  return value;
}

function attributesToObject(attributes) {
  if (Array.isArray(attributes)) {
    const output = {};
    for (const item of attributes) {
      if (!item || typeof item.key !== "string") continue;
      if (Object.hasOwn(output, item.key)) throw new TypeError(`OTel span has duplicate attribute ${item.key}`);
      output[item.key] = unwrap(item.value);
    }
    return output;
  }
  if (attributes && typeof attributes === "object") return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, unwrap(value)]));
  throw new TypeError("span.attributes must be an OTLP attribute array or object");
}

function requiredString(attributes, key) {
  const value = attributes[key];
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`OTel span is missing required attribute ${key}`);
  return value;
}

function parsePayload(value, key) {
  if (value === undefined) throw new TypeError(`OTel span is missing ${key}; payload-free spans need an upstream fingerprint bridge`);
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function timestampFromUnixNano(value, field) {
  let nanos;
  try { nanos = BigInt(value); } catch { throw new TypeError(`${field} must be Unix nanoseconds`); }
  if (nanos <= 0n) throw new TypeError(`${field} must be positive Unix nanoseconds`);
  const seconds = nanos / 1_000_000_000n;
  const fraction = String(nanos % 1_000_000_000n).padStart(9, "0");
  const date = new Date(Number(seconds * 1000n));
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} is outside the supported date range`);
  return `${date.toISOString().slice(0, 19)}.${fraction}Z`;
}

function normalizedStatus(status) {
  const code = status?.code;
  if (code === 1 || code === "STATUS_CODE_OK" || code === "OK") return "succeeded";
  if (code === 2 || code === "STATUS_CODE_ERROR" || code === "ERROR") return "failed";
  throw new TypeError("OTel span status must be explicitly OK or ERROR; unset spans are not converted into call evidence");
}

/**
 * Adapt one completed OTel GenAI tool span. Payload attributes are transiently
 * fingerprinted; this function never returns raw arguments or results.
 * The ct_aicomm.* attributes are an explicit bridge contract, not claims that
 * all OTel exporters or frameworks emit them natively.
 */
export function adaptOtelGenAiToolSpan({ span, capture, identity } = {}) {
  if (!span || typeof span !== "object") throw new TypeError("span is required");
  const attributes = attributesToObject(span.attributes);
  const status = normalizedStatus(span.status);
  const startNs = BigInt(span.startTimeUnixNano);
  const endNs = BigInt(span.endTimeUnixNano);
  if (endNs < startNs) throw new TypeError("OTel span end time must not precede start time");
  const traceId = span.traceId;
  const spanId = span.spanId;
  const args = parsePayload(attributes[ATTR.request], ATTR.request);
  const event = {
    target_name: requiredString(attributes, ATTR.target),
    request: args,
    source_event_id: `otel:${traceId}:${spanId}`,
  };
  if (status === "succeeded") event.response = parsePayload(attributes[ATTR.response], ATTR.response);
  const scopes = attributes[ATTR.scope] === undefined ? [] : (Array.isArray(attributes[ATTR.scope]) ? attributes[ATTR.scope] : [attributes[ATTR.scope]]);
  const identityFromSpan = identity ?? (attributes[ATTR.actor] ? {
    actor_ref: attributes[ATTR.actor],
    represented_principal_ref: attributes[ATTR.principal] ?? null,
    identity_assurance: "declared",
    authorization_assurance: scopes.length ? "declared" : "not_observed",
    authorization_scopes: scopes,
    credential_fingerprint: null,
  } : undefined);
  const outcome = status === "succeeded" ? "succeeded" : "failed";
  const evidenceCapture = {
    ...capture,
    call_id: attributes[ATTR.callId] ?? `otel:span/${spanId}`,
    protocol_version: requiredString(attributes, ATTR.protocolVersion),
    transport: requiredString(attributes, ATTR.transport),
    started_at: timestampFromUnixNano(span.startTimeUnixNano, "span.startTimeUnixNano"),
    completed_at: timestampFromUnixNano(span.endTimeUnixNano, "span.endTimeUnixNano"),
    duration_ms: Number((endNs - startNs + 500_000n) / 1_000_000n),
    status: outcome,
    error_code: status === "failed" ? (attributes[ATTR.errorCode] ?? "otel.tool_call_failed") : null,
    trace_id: traceId,
    span_id: spanId,
    source_kind: "otel_trace",
    operation: "tools/call",
  };
  return adaptAgentCallEvidence({ event, capture: evidenceCapture, identity: identityFromSpan, protocol: "mcp", targetKind: "tool" });
}

export const OTEL_AGENT_CALL_BRIDGE_ATTRIBUTES = Object.freeze({ ...ATTR });
