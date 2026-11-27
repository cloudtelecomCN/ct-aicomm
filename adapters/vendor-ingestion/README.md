# Vendor-neutral infrastructure ingestion

[中文](README.zh-CN.md)

This adapter package creates a vendor-neutral, read-only observation batch from a customer-owned export. It contains no vendor SDKs, credentials, API calls, cloud provisioning, device writes, traffic control, ranking, or commercial decision logic.

## What “coverage” means

`profiles.mjs` registers every organization and product group in the current CT-AIComm enterprise coverage plan and identifies an accepted input format plus the evidence still required. An accepted format describes what this mapper can ingest. It does not claim that a vendor product emits that format or that an integration is live or certified.

The current shared input tracks are:

- `gnmi-json-ietf`: a customer-side gNMI collector has already converted an authorized notification to JSON-IETF values;
- `prometheus`: a customer-side collector/exporter has normalized metric samples;
- `otlp-json`: a customer-side OpenTelemetry Collector has exported approved spans/metrics;
- `cloud-resource-normalized-json`: a customer-side cloud connector has normalized read-only inventory/metrics;
- `vendor-normalized-json`: a customer/integrator exporter has produced the explicit record shape below;
- `agent-call-evidence-v1` / `mcp`: use the dedicated Agent-call adapters for tool-call evidence.

The package intentionally does not open network connections. Customer-side exporters own authentication, endpoint allowlisting, rate limits, retries, regional routing, and data residency.

## Normalize an observation batch

```js
import { adaptVendorSnapshot, verifyVendorSnapshotFingerprint } from "./index.mjs";

const batch = adaptVendorSnapshot({
  profile_id: "nvidia",
  source: {
    protocol: "prometheus",
    name: "dcgm-exporter",
    version: "4.5.0-synthetic",
    source_ref: "cluster:demo/gpu-exporter",
    export_fingerprint: `sha256:${"a".repeat(64)}`
  },
  observed_at: "2026-11-25T10:00:00.000Z",
  data_origin: "synthetic",
  limitations: ["Synthetic fixture; no GPU was queried."],
  records: [{
    resource_ref: "gpu:node-01/0",
    metric: "gpu.utilization_pct",
    value: 0,
    unit: "%",
    recorded_at: "2026-11-25T10:00:00.000Z",
    aggregation: "last",
    sample_count: 1
  }]
});

if (!verifyVendorSnapshotFingerprint(batch)) throw new Error("fingerprint mismatch");
```

All example values are synthetic. `export_fingerprint` is supplied by the source owner and is not independently authenticated by this mapper. Every metric name and unit must be explicitly mapped by the customer-owned exporter; this code does not infer conversions or meanings.

## Supported coverage profiles

See [the full bilingual enterprise coverage matrix](../../docs/enterprise-adapter-coverage.md). Profiles currently include network OEMs (ZTE, Huawei, Fiberhome, Ruijie, H3C), Chinese cloud providers, the three operators, system integrators, observability providers, Agent/MCP platforms, accelerator vendors, NVIDIA, AWS/Azure China ecosystems, and AXON Networks.

## Required next step for a live connector

For each product, pin the exact model/release/API/exporter, obtain an authorized read-only sample, document metric names and units, and produce synthetic fixtures first. A profile remains “requires fixture” until that evidence is reviewed. Do not store credentials or raw sensitive payloads in repository files or evidence batches.

