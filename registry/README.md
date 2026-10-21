# Registry contribution packets

Protocol metadata enters the public Registry through review-pending JSON packets in `registry/contributions/`.

Read the [Registry contribution specification v2](../docs/registry/contributing.md), copy the [synthetic example](../examples/registry/synthetic-quic-example-v1.json), and run the public preflight before opening a pull request. A passing preflight validates structure and public evidence boundaries; it does not approve or publish an entry.

Approved metadata can be released as a digest-bound signed version history. See [Registry entry signatures and version history](../docs/registry/entry-integrity.md) and verify the committed synthetic fixture with `node scripts/verify-registry-history.mjs`. The repository contains verification public keys only; production signing private keys remain outside the public source boundary.
