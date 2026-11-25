import { adaptAgentCallEvidence } from "../agent-call-evidence/index.mjs";

/**
 * Adapt a deployment-owned WeKnora bridge event. This is not a native WeKnora
 * plugin: the caller must emit the documented bridge contract from an
 * approved audit/trace hook and must not infer absent identity or scope data.
 */
export function adaptWeKnoraBridgeEvent({ bridgeEvent, identity } = {}) {
  if (!bridgeEvent || typeof bridgeEvent !== "object") throw new TypeError("bridgeEvent is required");
  if (bridgeEvent.source !== "tencent/weknora") throw new TypeError("bridgeEvent.source must be tencent/weknora");
  if (bridgeEvent.capture?.runtime?.name !== "weknora") throw new TypeError("capture.runtime.name must be weknora");
  const { source: _source, capture, ...event } = bridgeEvent;
  return adaptAgentCallEvidence({ event, capture, identity, protocol: "mcp", targetKind: "tool" });
}
