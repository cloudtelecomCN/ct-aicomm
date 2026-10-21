# CT-AIComm public SDK boundary

This zero-dependency ESM entry point exposes only the versioned public protocol and evidence helpers listed in [`../specs/public-api-v1.json`](../specs/public-api-v1.json). Import directly from a source checkout:

```js
import { normalizeNetworkTelemetry, validateControlMessage } from "./sdk/index.mjs";
```

The SDK validates and normalizes caller-supplied evidence. It does not contain credentials, discover private infrastructure, authorize execution, attach eBPF programs, or claim that synthetic data is measured. Version `0.7.0` adds CT-558 deterministic audit packages containing one declaration, approval, execution, and rollback artifact. Tenant lookup, legal approval, trusted signing, and production evidence access remain deliberately excluded. It is source-distributed and is not an npm registry publication.

Run the example with `node examples/sdk/validate-public-evidence.mjs`. Run one measured client-side TTFT observation with `node packages/ttft-collector/cli.mjs --endpoint=URL --model=MODEL --prompt=TEXT --environment-fingerprint=sha256:...`; provide credentials only through `VLLM_API_KEY`.

Third-party Connector authors can start with `examples/connectors/synthetic-static-connector.mjs` and call `runConnectorContract` from their own test suite. Passing the contract validates record shape and evidence boundaries; it does not authorize traffic execution or certify performance.

Agent integrators can use the typed source package in `packages/agent-protocol-sdk/` to construct registration, prepare, apply, revoke, and receipt records. That package contains no transport client, production credential authority, or execution callback.

Registry consumers can verify the committed synthetic history with `node scripts/verify-registry-history.mjs` or import `verifyRegistryEntryRecord` and `verifyRegistryEntryHistory`. Verification proves supplied-byte integrity and digest-chain continuity; it does not grant publication authority or certify a protocol.

Compliance integrators can import `createExecutionEvidenceBinding` and `verifyExecutionEvidenceBinding`. The verifier rejects self-contained verification: its expected context must come from an authenticated tenant and execution lookup outside this SDK.

Data-governance integrators can import `createDataPathDeclaration`, `validateDataPathDeclaration`, and `verifyDataPathDeclaration`. Structural validation does not authenticate context; authoritative verification requires the expected tenant, workload, and declaration revision.

Audit tooling can import `createAuditPackage` and `verifyAuditPackage`, or run the offline builder and verifier CLIs. Package verification detects omission and tampering and can bind identifiers to caller-supplied context; checksum verification alone does not authenticate an approver or authorize an execution.
