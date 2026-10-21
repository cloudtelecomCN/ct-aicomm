# Agent protocol SDK 1.0

This zero-dependency package constructs and verifies the public CT-DataPlane Agent control messages defined by [`control-protocol-v1.schema.json`](../../specs/agent/control-protocol-v1.schema.json). It provides typed builders for registration, policy preparation, policy application, policy revocation, and correlated receipts.

Builders reject unknown input fields, malformed identities, non-SemVer Agent versions, invalid fingerprints, duplicate or unsupported capabilities, expired preparations, invalid revisions, and operation/status mismatches. Random message IDs and nonces are generated locally unless deterministic test values are supplied.

The SDK is a serialization and correlation boundary only. It contains no credential authority, trust roots, production keys, transport client, endpoint discovery, policy approval, or network mutation callback. A valid message is not execution authorization. Authentication, authorization, replay storage, and mTLS transport remain operator-owned controls outside this public package.

Run the synthetic lifecycle example:

```sh
node examples/agent/protocol-sdk.mjs
```

TypeScript declarations are available in [`index.d.ts`](index.d.ts). The package is source-distributed and is not an npm Registry publication.
