import { adaptAgentCallEvidence } from "../agent-call-evidence/index.mjs";

/** Map a deployment-owned Dify ToolInvoked event after call-ID correlation. */
export function adaptDifyToolInvoked({ event, capture, identity } = {}) {
  if (!event || typeof event !== "object") throw new TypeError("event is required");
  if (capture?.runtime?.name !== "dify") throw new TypeError("capture.runtime.name must be dify");
  if (capture?.protocol_name !== "mcp") throw new TypeError("capture.protocol_name must be explicitly mcp for this adapter");
  if (typeof capture.call_id !== "string" || !capture.call_id.trim()) {
    throw new TypeError("capture.call_id must be the joined Dify tool_call_id, not only the conversation message_id");
  }
  if (typeof event.tool_name !== "string") throw new TypeError("event.tool_name is required");
  if (!Object.hasOwn(event, "tool_inputs")) throw new TypeError("event.tool_inputs is required");
  const normalizedEvent = {
    target_name: event.tool_name,
    request: event.tool_inputs,
    ...(capture.status === "succeeded" ? { response: event.tool_outputs } : {}),
    ...(event.source_event_id ? { source_event_id: event.source_event_id } : {}),
  };
  const { protocol_name: _protocolName, ...evidenceCapture } = capture;
  return adaptAgentCallEvidence({ event: normalizedEvent, capture: evidenceCapture, identity, protocol: "mcp", targetKind: "tool" });
}

