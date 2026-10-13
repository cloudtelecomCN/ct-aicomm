# Agent identity and short-lived credentials

CT-510 uses Ed25519-signed credentials with an Agent subject, Orchestrator audience, issue and expiry timestamps, a unique credential ID, and an explicit signing-key ID. The authority caps credential lifetime at one hour and defaults to five minutes. Credentials are held in memory and are not written to configuration files.

Key rotation makes a new key active while retaining previous public verification keys during the overlap window. An operator can revoke one credential ID, revoke an entire Agent identity, or retire an old key after its credentials expire. Verification rejects altered signatures, wrong audiences, future or expired credentials, revoked IDs, revoked Agents, and Agent-binding mismatches.

`redactCredentialLogs` recursively removes authorization, credential, password, private-key, secret, and token fields and also replaces credentials embedded in free-form messages. Callers must apply it before structured logging; raw credentials must never be included in receipts or audit records.
