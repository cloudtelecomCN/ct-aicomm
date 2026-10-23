# CT-Advisor Resource & Source Catalog v1

CT-660 defines the public data contract for GPU, cloud-instance, region, network-path, software-stack, and pricing records used by CT-Advisor. A catalog record is decision-support input, not an availability promise, certification, execution instruction, or performance claim.

## Contract files

- `specs/advisor/resource-field-registry-v1.schema.json` defines the field-registry format.
- `specs/advisor/resource-catalog-v1.schema.json` defines a public catalog bundle.
- `examples/advisor/resource-field-registry-v1.json` freezes canonical fields and units.
- `examples/advisor/synthetic-resource-catalog-v1.json` provides one explicitly synthetic entry for each resource type.
- `packages/advisor/resource-catalog.mjs` verifies fields, validity, authorization, isolation, and SHA-256 digests offline.

## Every value keeps its context

Each resource contains typed facts and one immutable source snapshot. The source snapshot records its origin kind, confidence, publisher, observation time, effective interval, summary, analysis authorization, redistribution authorization, and its own digest. `unknown` and `not_applicable` are explicit states; missing data must not be replaced with an invented value.

## Validity and authorization

Consumers evaluate a resource as `not_yet_effective`, `current`, or `expired` at a declared UTC time. A resource is usable for analysis only when it is active, current, authorized for analysis, and all required facts are provided. Expired or prohibited data remains visible for traceability but cannot silently enter a calculation.

Public catalog entries must be either public or explicitly synthetic and must permit both analysis and redistribution. Tenant-private records are stored and served by the commercial workspace only; the public bundle validator rejects them.

## Integrity boundary

The source snapshot and resource have separate canonical SHA-256 digests. Changing a fact, source summary, authorization decision, or validity timestamp invalidates the corresponding digest. Catalog data remains bounded by:

- decision support only;
- no execution authorization;
- no performance claim;
- explicit synthetic labeling; and
- physical exclusion of tenant-private records from the public catalog.

Run `npm test` to verify the schemas, fixtures, digest checks, expiry handling, and public/private boundary without network access or credentials.
