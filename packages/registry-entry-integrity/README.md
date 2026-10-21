# Registry entry integrity 1.0

[中文](README.zh-CN.md)

This zero-dependency Node.js package creates and verifies digest-bound, Ed25519-signed Registry entry versions. Each version binds the reviewed contribution, review receipt, protocol snapshot, declared artifact hashes, publication sequence, and immediately previous entry digest.

```js
import { verifyRegistryEntryHistory } from "./index.mjs";

const result = verifyRegistryEntryHistory(history.records, {
  publicKeys,
  artifactBytesByPath
});
```

Verification fails on changed metadata, missing or changed artifacts, an unknown key, an invalid signature, a removed or reordered version, a sequence gap, a duplicate contribution, or a broken previous-digest link. Pass `requireArtifacts: false` only for metadata inspection; that result explicitly reports `artifacts_verified: false`.

`createRegistryEntryRecord` accepts an Ed25519 private key only at call time for offline release tooling. This repository contains no production signing private key. The committed fixture uses a public test key marked for synthetic verification only. Key custody, rotation, revocation, and release authorization remain operator responsibilities.

Run `node scripts/verify-registry-history.mjs` to verify the committed synthetic history. Passing verification proves integrity and continuity of the supplied records; it does not certify protocol quality, benchmark performance, or production suitability.
