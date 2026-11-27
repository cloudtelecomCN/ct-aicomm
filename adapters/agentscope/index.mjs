import { adaptOtelGenAiToolSpan } from "../otel-genai/index.mjs";

/** Map an AgentScope OTel tool span through the shared Agent-call bridge. */
export function adaptAgentScopeToolSpan({ span, capture, identity } = {}) {
  if (capture?.runtime?.name !== "agentscope") throw new TypeError("capture.runtime.name must be agentscope");
  return adaptOtelGenAiToolSpan({ span, capture, identity });
}

