# Agent control protocol v1

The protocol defines six versioned message types: registration, heartbeat, policy preparation, policy application, policy revocation, and receipt. Every message carries an Agent identity, message ID, UTC timestamp, high-entropy nonce, and typed payload. Receipts bind to the triggering message through `correlation_id` and fingerprint the resulting Agent state.

Messages outside the allowed age and clock-skew windows are rejected. Nonces are single-use. Policy preparation and application bind to the same SHA-256 policy fingerprint. Rejected and failed receipts require a machine-readable failure code.

This contract does not itself authorize execution. CT-509 implements the two-phase state machine that consumes it.

- Schema: [`../../specs/agent/control-protocol-v1.schema.json`](../../specs/agent/control-protocol-v1.schema.json)
- Reference implementation: [`../../packages/agent-control/protocol.mjs`](../../packages/agent-control/protocol.mjs)
