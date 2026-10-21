# Registry contribution v2

## Contribution

- Contribution ID:
- Change type: `add` / `update` / `deprecate`
- Protocol and version:

## Contributor checklist

- [ ] The packet is stored at `registry/contributions/<contribution_id>.json`, and the filename matches `contribution_id`.
- [ ] Every specification, implementation, and provenance URL is a public HTTPS source.
- [ ] I have declared the rights basis and confirmed that no confidential material is included.
- [ ] I have disclosed all relevant employer, vendor, consulting, investment, maintainer, or other relationships.
- [ ] The packet contains catalog metadata only and makes no benchmark or production-performance claim.
- [ ] The change contains no credentials, private endpoints, customer data, or private topology.
- [ ] `node scripts/validate-registry-contribution.mjs --files <path>` passes locally.

## Reviewer-only checklist

- [ ] Registry maintainer review completed by someone other than the submitter.
- [ ] Independent domain review completed by an unconflicted reviewer.
- [ ] Metadata and protocol version verified.
- [ ] Provenance, rights, and source reachability verified.
- [ ] Conflict-of-interest declaration reviewed.
- [ ] Technical scope and interoperability tags verified.

Preflight success is not publication approval. Keep the packet's review status as `pending` in contributor-authored changes.
