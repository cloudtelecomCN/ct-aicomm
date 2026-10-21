# Registry entry signatures and version history

[中文](entry-integrity.zh-CN.md)

Registry entry integrity v1 turns an approved metadata contribution into an independently verifiable version record. It binds the protocol snapshot, source contribution digest, review receipt digest, declared artifacts, release sequence, and previous version digest before an Ed25519 signature is created.

## Verification model

1. Canonicalize the closed entry object with `ct-aicomm-json-v1`.
2. Compute its SHA-256 entry digest.
3. Sign a payload that binds the digest, canonicalization, Ed25519 key ID, schema version, and publication time.
4. Re-read every declared artifact and compare its SHA-256 digest.
5. Verify contiguous sequence numbers, strictly increasing SemVer versions and publication times, unique contribution IDs, and the previous-digest link.

Run the committed two-version synthetic history:

```sh
node scripts/verify-registry-history.mjs
```

The verifier fails on content tampering, artifact tampering or absence, unknown keys, bad signatures, version deletion or reorder, sequence gaps, duplicate contributions, and broken predecessor links. `requireArtifacts: false` is available only for metadata inspection and reports that artifacts were not verified.

## Key boundary

The public keyring contains only Ed25519 public keys. The committed key is explicitly limited to synthetic fixtures. Production private keys must remain in an offline signer or managed HSM/KMS and must never enter this repository, CI variables, logs, website bundles, or contribution packets. Key rotation can use a new `key_id` while the entry digest chain preserves history; key revocation and release authorization remain separate operator controls.

Signing proves integrity and signer possession, not protocol quality, benchmark performance, legal approval, or production suitability. The versioned machine contract is [`specs/registry/registry-entry-record-v1.schema.json`](../../specs/registry/registry-entry-record-v1.schema.json), and the source package is [`packages/registry-entry-integrity/`](../../packages/registry-entry-integrity/).
