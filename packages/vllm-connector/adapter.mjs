import { createConnectorAdapter } from "../connector-sdk/index.mjs";
import { normalizeVllmMetrics } from "./metrics.mjs";

function configurationError(message) {
  const error = new Error(message);
  error.code = "vllm_adapter_configuration_invalid";
  throw error;
}

export function createVllmConnectorAdapter({ discover, loadMetrics, version = "1.0.0" } = {}) {
  if (typeof discover !== "function") configurationError("discover callback is required");
  if (typeof loadMetrics !== "function") configurationError("loadMetrics callback is required");

  return createConnectorAdapter({
    id: "vllm-openai",
    version,
    async discover(context) {
      return discover(context);
    },
    async collectMetrics(candidate, context) {
      const payload = await loadMetrics(candidate, context);
      if (!payload || typeof payload.text !== "string") configurationError("loadMetrics must return Prometheus text and explicit evidence metadata");
      if (typeof payload.collected_at !== "string" || !Number.isFinite(Date.parse(payload.collected_at))) {
        configurationError("loadMetrics must return an explicit ISO-8601 collected_at timestamp");
      }
      const snapshot = normalizeVllmMetrics(payload.text, {
        instance: candidate.id,
        version: payload.vllm_version,
        collectedAt: payload.collected_at
      });
      return {
        ...snapshot,
        data_origin: payload.data_origin,
        evidence: {
          ...snapshot.evidence,
          source: payload.source,
          limitations: payload.limitations ?? []
        }
      };
    }
  });
}
