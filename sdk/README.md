# CT-AIComm public SDK boundary

This zero-dependency ESM entry point exposes only the versioned public protocol and evidence helpers listed in [`../specs/public-api-v1.json`](../specs/public-api-v1.json). Import directly from a source checkout:

```js
import { normalizeNetworkTelemetry, validateControlMessage } from "./sdk/index.mjs";
```

The SDK validates and normalizes caller-supplied evidence. It does not contain credentials, discover private infrastructure, authorize execution, attach eBPF programs, or claim that synthetic data is measured. Version `0.16.0` adds CT-610 local imports and the mandatory authorization, clock, budget, concurrency, and stop-condition preflight gate. It retains the CT-609 Link Evidence Passport freeze and prior Evidence Core modules. Identity authentication, private query authorization, measurement execution, message-broker delivery, private Artifact content access, legal approval, trusted signing, certification, and production evidence access remain deliberately excluded. It is source-distributed and is not an npm registry publication.

Passport integrators can import `createPassportScenarioMethodFreeze`, `createPassportRunPlan`, `startPassportRun`, `assertPassportRunFreeze`, and `createPassportReplacementRun`. The contract freezes the exact site pair, direction, protocol, workload configuration, method references, tool fingerprint, parameters, sampling, exclusions, statistics, and prerequisites. Once a run is started, changed values fail with `passport_new_run_required` and require a different `run_id`; the SDK does not execute a benchmark or certify its result.

Evidence catalog consumers can import `queryEvidenceRecords`, `getEvidenceQueryRecord`, `createEvidenceQueryStatus`, and `buildEvidenceQueryRequest`. Records containing tenant, principal, storage, endpoint, credential, or contact fields fail closed. The SDK performs no network access and defines no production server; only the separate implementation can authenticate and authorize a private lookup.

Evidence export services can import `createEvidenceExportAuditLedger`, `evaluateEvidenceExportRequest`, `recordEvidenceExportDelivery`, and `verifyEvidenceExportAuditLedger`. The policy engine fails closed across tenant, recipient, purpose, exact resource version, field scope, time, grant status, and caller-supplied authentication-context anchor. It records no private payload, credential, storage locator, or download URL and does not claim to authenticate the principal or attest the transport.

Downstream products can import `createEvidenceTtlContract`, `createEvidenceInvalidationEvent`, `createEvidenceDownstreamProjection`, `consumeEvidenceInvalidationEvent`, and `evaluateEvidenceDownstreamTtl`. Repeated at-least-once delivery is idempotent, while a missed event still causes local invalidation at the bounded TTL deadline. A current lease is only cache freshness and never a validity or certification claim.

Run the example with `node examples/sdk/validate-public-evidence.mjs`. Run one measured client-side TTFT observation with `node packages/ttft-collector/cli.mjs --endpoint=URL --model=MODEL --prompt=TEXT --environment-fingerprint=sha256:...`; provide credentials only through `VLLM_API_KEY`.

Third-party Connector authors can start with `examples/connectors/synthetic-static-connector.mjs` and call `runConnectorContract` from their own test suite. Passing the contract validates record shape and evidence boundaries; it does not authorize traffic execution or certify performance.

Agent integrators can use the typed source package in `packages/agent-protocol-sdk/` to construct registration, prepare, apply, revoke, and receipt records. That package contains no transport client, production credential authority, or execution callback.

Registry consumers can verify the committed synthetic history with `node scripts/verify-registry-history.mjs` or import `verifyRegistryEntryRecord` and `verifyRegistryEntryHistory`. Verification proves supplied-byte integrity and digest-chain continuity; it does not grant publication authority or certify a protocol.

Compliance integrators can import `createExecutionEvidenceBinding` and `verifyExecutionEvidenceBinding`. The verifier rejects self-contained verification: its expected context must come from an authenticated tenant and execution lookup outside this SDK.

Data-governance integrators can import `createDataPathDeclaration`, `validateDataPathDeclaration`, and `verifyDataPathDeclaration`. Structural validation does not authenticate context; authoritative verification requires the expected tenant, workload, and declaration revision.

Audit tooling can import `createAuditPackage` and `verifyAuditPackage`, or run the offline builder and verifier CLIs. Package verification detects omission and tampering and can bind identifiers to caller-supplied context; checksum verification alone does not authenticate an approver or authorize an execution.

Evidence reviewers can import `inspectEvidenceGaps` or run `scripts/inspect-evidence-gaps.mjs`. The caller must supply authoritative context, a trusted evaluation time, and authenticated verifier IDs separately from the submitted assessment. Only a zero-gap report emits `requirements_satisfied`; that status is not execution authorization, legal approval, or external certification.

Compliance architects can import `createComplianceRulePack`, `validateComplianceRulePack`, `verifyComplianceRulePackUpgrade`, and `mapComplianceRulePack`, or run `scripts/validate-compliance-rule-pack.mjs`. Mapping reports only locate submitted evidence against versioned references; they never issue a legal conclusion, external assessment, or certification.
