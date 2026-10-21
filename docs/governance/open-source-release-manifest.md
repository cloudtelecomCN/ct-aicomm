# Open-source release manifest

The [CT-545 manifest](../../specs/release/open-source-release-manifest-v1.json) is the authoritative, machine-readable publication boundary for `cloudtelecomCN/ct-aicomm`. Its [versioned schema](../../specs/release/open-source-release-manifest-v1.schema.json) separates assets into three states:

- **public_now**: source, contracts, tests, documentation, and evidence receipts already approved for this repository;
- **deferred**: intended open assets whose compatibility, isolation, packaging, or signing gate is incomplete;
- **prohibited**: credentials, private infrastructure, counterpart data, raw restricted samples, and approvals that have no direct public release path.

Every asset class has a named functional owner, an explicit license, a rationale, and a release gate. The validator enumerates every Git-tracked file and requires exactly one `public_now` match. It also fails if a deferred or prohibited path becomes tracked.

Run:

```bash
node scripts/validate-open-source-release-manifest.mjs
node --test tests/open-source-release-manifest.test.mjs
```

Adding a new top-level asset without updating the manifest is a release failure. Moving an asset from deferred to public requires satisfying its recorded gate and reviewing security, privacy, provenance, and license rights. Prohibited material must be transformed into a separately reviewed synthetic example or checksum-only receipt; renaming it does not make it publishable.
