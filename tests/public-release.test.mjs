import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildReleaseManifest, buildSpdxDocument, extractReleaseNotes, parseVersion } from "../scripts/create-public-release.mjs";

const [versionText, changelog, changelogChinese, workflow, guide, guideChinese] = await Promise.all([
  readFile("VERSION", "utf8"),
  readFile("CHANGELOG.md", "utf8"),
  readFile("CHANGELOG.zh-CN.md", "utf8"),
  readFile(".github/workflows/release.yml", "utf8"),
  readFile("docs/release/verification.md", "utf8"),
  readFile("docs/release/verification.zh-CN.md", "utf8")
]);

test("uses one SemVer version across bilingual release records", () => {
  const version = parseVersion(versionText);
  assert.equal(version, "0.1.0");
  assert.match(changelog, new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"));
  assert.match(changelogChinese, new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"));
  assert.match(extractReleaseNotes(changelog, version), /Evidence boundary/);
  assert.throws(() => parseVersion("01.0.0"), /valid SemVer/);
});

test("builds deterministic SPDX source inventory and release boundary", () => {
  const input = {
    version: "0.1.0",
    tag: "v0.1.0",
    revision: "a".repeat(40),
    created: "2026-10-22T00:00:00.000Z",
    files: [
      { path: "README.md", sha1: "1".repeat(40), sha256: "a".repeat(64) },
      { path: "agent/main.go", sha1: "2".repeat(40), sha256: "b".repeat(64) }
    ]
  };
  const first = buildSpdxDocument(input);
  const second = buildSpdxDocument({ ...input, files: [...input.files].reverse() });
  assert.deepEqual(first, second);
  assert.equal(first.spdxVersion, "SPDX-2.3");
  assert.equal(first.files.length, 2);
  assert.equal(first.packages[0].filesAnalyzed, true);

  const manifest = buildReleaseManifest({ ...input, artifacts: [] });
  assert.equal(manifest.evidence_boundary.measured_production_performance_included, false);
  assert.equal(manifest.evidence_boundary.performance_claim_allowed, false);
  assert.match(manifest.verification.sigstore_certificate_identity, /refs\/tags\/v0\.1\.0$/);
});

test("release workflow signs, verifies, attests, and publishes from an exact tag", () => {
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /attestations:\s*write/);
  assert.match(workflow, /cosign sign-blob --yes --bundle/);
  assert.match(workflow, /cosign verify-blob/);
  assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/);
  assert.match(workflow, /sigstore\/cosign-installer@[0-9a-f]{40}/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--verify-tag/);
  assert.doesNotMatch(workflow, /uses:\s*[^\n]+@(main|master|v\d+)/);
});

test("documents checksum, keyless signature, provenance, and synthetic boundaries", () => {
  for (const content of [guide, guideChinese]) {
    assert.match(content, /sha256sum --check SHA256SUMS/);
    assert.match(content, /cosign verify-blob/);
    assert.match(content, /gh attestation verify/);
    assert.match(content, /performance_claim_allowed/);
  }
});
