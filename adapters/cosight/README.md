# Co-Sight MCP event adapter

This adapter converts one Co-Sight-style MCP tool-call record into the CT-AIComm `agent_call_evidence` 1.0.0 envelope. It is a local mapping library. It does not connect to Co-Sight, execute MCP tools, authenticate an Agent, decide authorization, or upload evidence.

## Compatibility status

Co-Sight's public task model records tool name, arguments, result, and timestamp. Those fields alone are insufficient for a fully evidenced record. The caller must also supply an observed capture envelope with call ID, MCP version and transport, start and completion timestamps, duration, outcome, source classification, and exact runtime/recorder versions and artifact fingerprints. Until Co-Sight exposes a stable event hook/export format, an integration must obtain these values from a wrapper or exporter; it must not infer missing values.

Identity and authorization default to `not_observed`, with an empty scope list and null principal/credential fingerprint. `external_assertion` is accepted only when the upstream event supplies its credential fingerprint and non-empty scopes. This mapper does not verify that assertion; downstream verification must do so. The stable fallback actor reference `agent:cosight-unverified` is a label, not an authenticated identity.

## Privacy and evidence boundaries

Arguments and successful results are canonicalized in memory and immediately reduced to SHA-256 fingerprints. They are never copied to the returned record. Callers remain responsible for not logging or persisting raw Co-Sight arguments/results before or after mapping. Hashes do not prove that the source event is truthful or that a measurement is valid.

Every record states that CT-AIComm did not execute the call, authenticate identity, decide authorization, or make performance/certification claims. `data_origin` must be explicitly set to `synthetic` or `measured`; `measured` means an observed runtime event, not a performance claim.

## Usage

```js
import { adaptCoSightToolCall, verifyCoSightEvidenceFingerprint } from "./index.mjs";

const evidence = adaptCoSightToolCall({
  toolCall: {
    tool_name: "list_protocols",
    tool_args: { category: "rdma" },
    tool_result: { items: [] },
    timestamp: "2026-11-25T10:00:01.000Z",
  },
  capture: {
    evidence_id: "evidence-cosight-001",
    call_id: "call-cosight-001",
    protocol_version: "2025-11-25",
    transport: "stdio",
    started_at: "2026-11-25T10:00:00.900Z",
    completed_at: "2026-11-25T10:00:01.000Z",
    duration_ms: 100,
    status: "succeeded",
    data_origin: "synthetic",
    source_kind: "application_log",
    runtime: { name: "cosight", version: "0.0.0-synthetic", artifact_fingerprint: `sha256:${"a".repeat(64)}` },
    recorder: { name: "ct-aicomm-cosight-adapter", version: "0.1.0", artifact_fingerprint: `sha256:${"b".repeat(64)}` },
  },
});

if (!verifyCoSightEvidenceFingerprint(evidence)) throw new Error("evidence fingerprint check failed");
```

Production integrations must replace the example's synthetic origin and placeholder component fingerprints with measured provenance from the exact running artifacts. Use the CT-AIComm Agent Call Evidence Schema as the normative field contract.

