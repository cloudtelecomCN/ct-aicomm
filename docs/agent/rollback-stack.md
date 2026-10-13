# Confirmed rollback stack

CT-512 records a complete route-state snapshot only after receiving an `applied` execution receipt. The snapshot fingerprint must match the stored state, and confirmed policy revisions must increase monotonically.

A rollback can restore only the entry immediately below the active policy. The caller must provide the expected active revision, preventing a concurrent policy change from being overwritten. Arbitrary revisions, unconfirmed receipts, altered snapshots, stale revisions, and a rollback without a confirmed predecessor are rejected before the execution callback runs.

After a successful restore, the replaced revision leaves the active stack and is retained in the retired-revision record. The rollback event binds the old and restored policy fingerprints, restored state fingerprint, source receipt, reason, timestamp, and execution result. CT-513 uses this primitive when health thresholds trip.
