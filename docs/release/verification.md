# Verify a public release

[中文](verification.zh-CN.md)

Every tagged CT-AIComm public release is built from the tag by GitHub Actions. The release includes a source archive, an SPDX 2.3 source SBOM, a machine-readable release manifest, SHA-256 checksums, a Sigstore keyless signature bundle, and GitHub build provenance.

The project version is stored in [`VERSION`](../../VERSION). The root `package.json` belongs to the private, zero-dependency contributor test runner and is not the project release version.

## Download and verify

Install [GitHub CLI](https://cli.github.com/) and [Cosign](https://docs.sigstore.dev/cosign/system_config/installation/), then run:

```bash
TAG=v0.1.0
gh release download "$TAG" --repo cloudtelecomCN/ct-aicomm --dir "ct-aicomm-$TAG"
cd "ct-aicomm-$TAG"
sha256sum --check SHA256SUMS
cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "https://github.com/cloudtelecomCN/ct-aicomm/.github/workflows/release.yml@refs/tags/$TAG" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  SHA256SUMS
gh attestation verify "ct-aicomm-$TAG-source.tar.gz" --repo cloudtelecomCN/ct-aicomm
```

A successful checksum proves the downloaded files match the signed manifest. A successful Cosign check proves the checksum file was signed by this repository's release workflow for the exact tag. GitHub attestation verification independently binds the archive digest to the GitHub-hosted build.

## Inspect the evidence boundary

Open `release-manifest-v0.1.0.json` before using the artifacts. `measured_production_performance_included` and `performance_claim_allowed` remain `false` unless a future release contains independently reviewed measured evidence. Synthetic examples must never be reported as real performance.

The SBOM inventories Git-tracked source files at the tagged revision. It is not a claim that every file has the same license; use `LICENSE`, `LICENSE-DOCUMENTATION.md`, and the [open-source release manifest](../governance/open-source-release-manifest.md) for the applicable license boundary.

## Maintainer release gate

Maintainers update `VERSION`, both changelogs, and the supported-version table in `SECURITY.md` in one reviewed commit. The tag must be exactly `v<VERSION>` and point at that commit. The release workflow refuses dirty, mismatched, or untagged source and publishes no long-lived signing key.
