# Registry contribution specification v2

[中文](contributing.zh-CN.md)

Registry contribution v2 defines the public, review-pending packet used to propose protocol metadata. It covers metadata, provenance and rights, conflicts of interest, and review requirements. Passing preflight means only that the packet is structurally reviewable; it does not approve, endorse, benchmark, sign, or publish a protocol.

## Submit a packet

1. Fork this repository and copy [`examples/registry/synthetic-quic-example-v1.json`](../../examples/registry/synthetic-quic-example-v1.json) to `registry/contributions/<contribution_id>.json`.
2. Replace the synthetic values with public, source-backed metadata. The filename must equal `<contribution_id>.json`.
3. Run `node scripts/validate-registry-contribution.mjs --files registry/contributions/<contribution_id>.json`.
4. Open a pull request with the **Registry contribution v2** template. The read-only `Registry contribution preflight` workflow validates changed packets from external pull requests.

Use `change_type: update` or `deprecate` and set `supersedes` to `protocol-id@version` instead of deleting or renaming history.

## Metadata boundary

Each packet identifies one protocol version, category, summary, public specification links, optional public implementation links, and interoperability tags. URLs must use public HTTPS endpoints without embedded credentials. Private IP addresses, private hostnames, credentials, customer data, private topology, and confidential source material are prohibited.

Registry metadata is not benchmark evidence. Do not add latency, throughput, cost, availability, or production-performance claims to a contribution packet. Submit reproducible measurements through the CT-Bench evidence workflow instead.

## Provenance and rights

Every packet must include:

- the contributor's public GitHub login and optional affiliation;
- at least one public source with title, publisher, kind, URL, and access date;
- an SPDX license identifier when known, plus a SHA-256 digest when a source artifact is intentionally pinned;
- a rights basis and explicit attestations that the contributor has the necessary rights and that the packet contains no confidential material.

`link-only` means the contribution records a public reference without copying the referenced content. A missing or false rights attestation fails preflight.

## Conflict of interest

Set `declared` to `true` whenever an employer, vendor, consulting, investment, maintainer, or other relationship could reasonably affect the submission. Describe each relevant party and relationship. A declaration does not automatically reject a contribution; it lets maintainers assign an unconflicted independent reviewer. `declared: false` requires an empty relationship list.

## Review requirements

Contributor-authored packets must remain `status: pending`. They request both a Registry maintainer and an independent domain reviewer, and require metadata, provenance and rights, conflict-of-interest, and technical checks. The submitter cannot approve their own packet.

CODEOWNERS requests the public Registry maintainer. Repository branch protection should require the preflight status and the configured reviewer approvals before merge. A passing CI check is never a publication decision. Entry signing, immutable version history, and release verification are handled separately from this v2 intake contract.

## Preflight commands

Validate one or more files:

```sh
node scripts/validate-registry-contribution.mjs --files registry/contributions/example-v1.json
```

Validate every committed packet:

```sh
node scripts/validate-registry-contribution.mjs --all
```

The versioned machine contract is [`specs/registry/registry-contribution-v2.schema.json`](../../specs/registry/registry-contribution-v2.schema.json).
