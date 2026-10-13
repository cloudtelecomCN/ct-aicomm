# End-to-end Trace Bundle

CT-518 defines a fingerprinted Trace Bundle that links one terminal inference request to its decision explanation, applied Agent audit record, optional rollback event, and measured Bench sample.

The join is rejected when request or trace identities differ, a stage fingerprint is invalid, the Agent receipt is not applied, the rollback points at another execution record, or the Bench sample is synthetic. A successful execution without rollback is represented explicitly as `occurred: false`; absence is never presented as proof that a rollback succeeded.

`buildTraceBundle` validates source evidence and emits a compact immutable index. `verifyTraceBundle` detects later modification of any indexed stage reference.
