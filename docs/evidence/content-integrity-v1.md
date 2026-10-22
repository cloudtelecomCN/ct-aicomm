# Evidence content integrity v1

Status: public contract for CT-603. This document defines deterministic
fingerprints and offline verification for an Evidence Core bundle. It does not
define signing authority, authorization, independent review, or certification.

## Protected bundle

A bundle is one flat directory containing:

- `manifest.json`: exact object identities, roles, sizes, byte checksums, and
  canonical object fingerprints;
- `SHA256SUMS`: the byte checksum of `manifest.json` and every declared object;
- one canonically formatted JSON file per protected Evidence Core object.

`protected_scope` is `entire-json-object`. Every field, nested value, array
member, and file byte is protected. Missing files and undeclared extra files are
both verification failures.

## Fingerprint layers

1. `object_fingerprint` is SHA-256 over the RFC 8785 canonical form of one JSON
   object. The raw `sha256` also protects its exact UTF-8 bytes.
2. `content_fingerprint` is SHA-256 over the identities and object fingerprints
   of Scope, Method, Run, Observation, and Artifact records. It is
   location-independent and must equal `EvidenceVersion.content_fingerprint`.
3. `manifest_fingerprint` protects the full manifest body, including every
   object descriptor and the aggregate content fingerprint.
4. `SHA256SUMS` protects the exact serialized manifest and object files.

Review, PolicyDecision, and ExportGrant are protected by the manifest but do not
change the EvidenceVersion content fingerprint. They are downstream records,
not inputs to the measured or declared evidence content.

## Offline verification

```bash
node scripts/verify-evidence-content.mjs examples/evidence/v1
node scripts/verify-evidence-content.mjs examples/evidence/v1 \
  --expected-manifest sha256:<trusted-manifest-fingerprint>
```

The CLI uses `realpath`, rejects symbolic links and subdirectories, requires an
exact file set, and performs no network access. The second form additionally
checks an externally trusted manifest fingerprint obtained from a pinned Git
commit, signed release, transparency record, or another independent channel.

## Threat boundary

Integrity is not authenticity.

Plain SHA-256 detects modification relative to the values being checked. An
attacker able to rewrite every object, the manifest, and `SHA256SUMS` can create
a new internally consistent bundle. Use `--expected-manifest` with a fingerprint
kept outside the untrusted bundle to detect that attack. CT-603 does not claim a
signature or trusted identity.

A successful result means only:

- all declared bytes and object identities match the manifest;
- all fingerprint layers are internally consistent;
- the external anchor matches when one was supplied.

It does not prove that a measurement happened, data is truthful, a reviewer is
independent, a policy approved use, or a certificate was issued.

## Stable failures

The module exports `EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES`. Important failures
include unsafe or duplicate paths, noncanonical JSON, object identity mismatch,
object checksum or fingerprint mismatch, content or manifest fingerprint
mismatch, checksum-set mismatch, and external-anchor mismatch.

## Synthetic fixture

`examples/evidence/v1` is deterministic synthetic data. It contains no customer
endpoint, production workload, external network measurement, or performance
claim. Regenerate it with:

```bash
node examples/evidence/generate-content-integrity-synthetic.mjs
```
