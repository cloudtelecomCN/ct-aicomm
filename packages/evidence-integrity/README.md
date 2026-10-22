# Evidence content integrity

The zero-dependency ESM module implements CT-603 content fingerprints,
canonical manifests, `SHA256SUMS`, and offline verification for Evidence Core
bundles.

```js
import { verifyEvidenceContentBundle } from "./index.mjs";

const result = verifyEvidenceContentBundle({
  manifestBytes,
  checksumsBytes,
  files,
  expectedManifestFingerprint: trustedFingerprint
});
```

The verifier protects every byte and every JSON field in each declared object.
It rejects unknown manifest fields, duplicate or unsafe paths, noncanonical
JSON, missing or extra files, identity drift, checksum drift, and a mismatch
with an externally pinned manifest fingerprint.

Integrity is not authenticity. The result always keeps authenticity,
authorization, independent review, and certification false. Read the
[normative guide](../../docs/evidence/content-integrity-v1.md) before using the
API or CLI.
