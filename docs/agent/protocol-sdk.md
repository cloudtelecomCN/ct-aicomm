# Agent protocol SDK 1.0

The public Agent protocol SDK turns the versioned control schema into typed, zero-dependency message builders. It covers registration, prepare, apply, revoke, and receipts while preserving the existing two-phase execution boundary.

`createPreparePolicyMessage` binds a policy identity, monotonic revision, SHA-256 content fingerprint, expiry, target route, and previous route. `createApplyPolicyMessage` must bind the same policy identity and fingerprint to the accepted prepare receipt. `createRevokePolicyMessage` declares a closed reason and the previously applied revision to restore. None of these builders sends or executes the message.

`createAgentReceipt` permits only the success state associated with its operation, or a rejected/failed state with a machine-readable failure code. `verifyAgentReceipt` checks message freshness, Agent identity, request correlation, operation, status, and both message fingerprints. This is structural evidence, not cryptographic proof of the sender.

The source package deliberately excludes production credentials, private keys, trust roots, internal control-plane routes, transport clients, and mutation callbacks. Operators must add mutually authenticated transport, authorization, replay protection, approval gates, and the execution implementation outside this public SDK.

- Package: [`../../packages/agent-protocol-sdk/`](../../packages/agent-protocol-sdk/)
- Type declarations: [`../../packages/agent-protocol-sdk/index.d.ts`](../../packages/agent-protocol-sdk/index.d.ts)
- Protocol schema: [`../../specs/agent/control-protocol-v1.schema.json`](../../specs/agent/control-protocol-v1.schema.json)
- Synthetic example: [`../../examples/agent/protocol-sdk.mjs`](../../examples/agent/protocol-sdk.mjs)
