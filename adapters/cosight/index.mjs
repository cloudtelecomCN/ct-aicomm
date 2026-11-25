import { adaptAgentCallEvidence, verifyAgentCallEvidenceFingerprint } from "../agent-call-evidence/index.mjs";

/** Map a Co-Sight-style MCP tool event through the shared Agent-call contract. */
export function adaptCoSightToolCall({ toolCall, capture, identity } = {}) {
  if (!toolCall || typeof toolCall !== "object") throw new TypeError("toolCall is required");
  const event = {
    target_name: toolCall.tool_name,
    request: toolCall.tool_args,
    ...(Object.hasOwn(toolCall, "tool_result") ? { response: toolCall.tool_result } : {}),
    ...(toolCall.timestamp !== undefined ? { source_event_id: `cosight:${toolCall.timestamp}` } : {}),
  };
  return adaptAgentCallEvidence({ event, capture, identity, protocol: "mcp", targetKind: "tool" });
}

export { verifyAgentCallEvidenceFingerprint as verifyCoSightEvidenceFingerprint };
