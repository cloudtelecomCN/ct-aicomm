# Decision explanation object

CT-516 turns the CT-515 ranking into a complete machine-readable explanation. It lists every candidate in deterministic order, preserves elimination reasons, records hard and soft constraints, and exposes raw inputs, normalized components, weights, weighted contributions, final scores, score fingerprints, and evidence references.

A candidate is selected only when no hard constraint failed. The selected candidate is the eligible entry with the lowest deterministic score; exact ties were already resolved by stable candidate ID. If a hard constraint fails or no candidate is eligible, `selected_candidate_id` is `null` and the basis states why.

The builder rejects eligible candidates whose score evidence is incomplete and rejects rankings that are not sorted deterministically. It does not generate a black-box narrative or infer unstated business meaning. The complete object receives its own deterministic fingerprint for review, approval, and later audit.
