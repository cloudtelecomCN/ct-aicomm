# Agent Kill Switch

CT-514 provides the same fail-closed emergency action to a local operator and the authenticated control plane. Activation first disables all automatic policy execution, then repeatedly invokes CT-512 until the oldest retained confirmed route state is active.

The operation is idempotent. Once active, every execution guard fails with `kill_switch_active`, and duplicate activation does not repeat restoration. If a route-map write fails during restoration, the switch remains active and reports `kill_switch_restore_failed`; a partial restore never re-enables automation.

The event records trigger source, actor, reason, time, baseline revision and state fingerprint, every rollback result, and a deterministic event fingerprint. There is intentionally no automatic reset. Re-enabling execution requires a separately authenticated operational workflow and fresh policy preparation.
