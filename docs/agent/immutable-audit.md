# Immutable execution audit

CT-511 converts every applied execution receipt into an append-only hash-chain record. Each record binds the policy ID, revision and fingerprint; Agent ID and short-lived credential ID; environment fingerprint; receipt IDs and state fingerprint; recorder timestamp and Agent timestamp; sequence number; and previous record hash.

The export includes the record count and terminal hash. `verifyAuditExport` recomputes every record hash and validates sequence continuity, previous-hash links, record count, and terminal hash. Modification, deletion, insertion, or reordering therefore invalidates the export. Records returned by the in-process API are deeply frozen.

Production persistence must use an append-only object or database transaction with a conditional previous-hash check. The hash chain makes tampering evident; it does not replace retention controls, durable replication, trusted timestamps, or external notarization.
