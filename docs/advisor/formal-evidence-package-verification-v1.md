# CT-Advisor formal Evidence Package verification v1

[中文](formal-evidence-package-verification-v1.zh-CN.md)

CT-668 publishes a zero-dependency Node.js verifier for the frozen CT-Advisor GPU Decision & Evidence Package format. The verifier is public and free. It does not contain customer data, entitlement logic, pricing, signing keys, private scoring configuration, or the commercial service that creates customer deliverables.

## What is verified

The verifier checks the exact bytes of a deterministic ZIP archive and rejects:

- a missing, extra, duplicate, absolute, traversal, backslash, NUL, directory, or symlink entry;
- encrypted, compressed, split, ZIP64, data-descriptor, extra-field, commented, overlapping, or CRC-invalid entries;
- a non-canonical or unsupported manifest, profile, semantic version, item order, media type, or D01-D13 file set;
- a byte count or SHA-256 mismatch between the ZIP, `manifest.json`, and `SHA256SUMS`;
- a wrong external `<package-id>.zip.sha256` sidecar;
- an incomplete or checksum-invalid D12 complete exit archive; and
- a D11 preflight record whose declared non-circular coverage does not match the delivered payloads.

The outer archive uses stored entries in canonical path order. `SHA256SUMS` covers `manifest.json` and every D01-D09/D11-D13 payload. D10 describes the aggregate container and therefore has no file entry. The digest of the complete ZIP is deliberately external, so neither the manifest nor the archive claims to hash itself.

## D11 preflight boundary

D11 is an assembly preflight over payload files other than D11. It excludes D10, D11, `manifest.json`, `SHA256SUMS`, and the outer ZIP. The public verifier subsequently verifies D11, the manifest, checksums, archive structure, and external sidecar. This two-stage model prevents circular self-verification.

## CLI

```bash
node scripts/verify-advisor-evidence-package.mjs \
  advisor_evidence_package_<uuid>.zip \
  --sha256 advisor_evidence_package_<uuid>.zip.sha256
```

Optional `--package-id` and `--contract-id` arguments bind verification to an expected context. A successful result follows `specs/advisor/formal-evidence-package-verification-v1.schema.json`.

## Security and claim boundary

A successful result proves archive integrity, format compatibility, declared snapshot state, and exact context when supplied. It does **not** prove source truth, signer identity, commercial entitlement, issuance authority, certification, legal compliance, performance, optimality, execution authorization, or current online revocation status.

An archive whose manifest state is `revoked` is reported as `revoked_as_packaged`. Every other state is reported as `snapshot_only_not_live_checked`. A historical archive remains auditable after a newer package revision or revocation record exists.
