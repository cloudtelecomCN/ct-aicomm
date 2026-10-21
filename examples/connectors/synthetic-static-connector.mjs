import { pathToFileURL } from "node:url";
import { createConnectorAdapter, runConnectorContract } from "../../packages/connector-sdk/index.mjs";

const discoveredAt = "2026-10-21T08:00:00.000Z";

export function createSyntheticStaticConnector() {
  return createConnectorAdapter({
    id: "synthetic-static",
    version: "1.0.0",
    async discover() {
      return [{
        id: "synthetic-instance-01",
        source: "contract-fixture",
        endpoint: "http://192.0.2.10:8000",
        metrics_endpoint: "http://192.0.2.10:8000/metrics",
        region: "synthetic-east",
        zone: "synthetic-east-a",
        models: ["synthetic/model-not-real"],
        ready: true,
        discovered_at: discoveredAt,
        source_revision: "synthetic-fixture-v1"
      }];
    },
    async collectMetrics() {
      return {
        collected_at: "2026-10-21T08:00:05.000Z",
        data_origin: "synthetic",
        health: "ready",
        missing_required_metrics: [],
        queue: { waiting_requests: 2, running_requests: 4 },
        cache: { kv_usage_ratio: 0.5 },
        latency_aggregate_seconds: { ttft_mean: 0.12, queue_mean: 0.02, inference_mean: 0.08 },
        evidence: {
          source: "embedded-contract-fixture",
          raw_sample_count: 6,
          aggregate_only: true,
          per_request_correlation_allowed: false,
          limitations: ["Contract fixture only; values were not measured on an inference service."]
        }
      };
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runConnectorContract(createSyntheticStaticConnector()), null, 2));
}
