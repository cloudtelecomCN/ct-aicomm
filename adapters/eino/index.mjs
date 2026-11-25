import { adaptAgentCallEvidence } from "../agent-call-evidence/index.mjs";

/**
 * Adapt a deployment-owned Eino bridge event. This is not a native Eino plugin:
 * the caller must assemble observed timing, protocol, status, and provenance
 * from Eino callbacks and its MCP client wrapper.
 */
export function adaptEinoBridgeEvent({ bridgeEvent, identity } = {}) {
  if (!bridgeEvent || typeof bridgeEvent !== "object") throw new TypeError("bridgeEvent is required");
  if (bridgeEvent.source !== "cloudwego/eino") throw new TypeError("bridgeEvent.source must be cloudwego/eino");
  if (bridgeEvent.capture?.runtime?.name !== "eino") throw new TypeError("capture.runtime.name must be eino");
  const { source: _source, capture, ...event } = bridgeEvent;
  return adaptAgentCallEvidence({ event, capture, identity, protocol: "mcp", targetKind: "tool" });
}
