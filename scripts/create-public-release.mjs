import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "cloudtelecomCN/ct-aicomm";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const MAX_GIT_BUFFER = 256 * 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    maxBuffer: MAX_GIT_BUFFER,
    windowsHide: true,
    ...options
  });
}

function sha(bytes, algorithm = "sha256") {
  return createHash(algorithm).update(bytes).digest("hex");
}

export function parseVersion(value) {
  const version = String(value).trim();
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version), `VERSION is not valid SemVer: ${version}`);
  return version;
}

export function extractReleaseNotes(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, "m").exec(changelog);
  assert(heading, `CHANGELOG.md has no section for ${version}`);
  const bodyStart = heading.index + heading[0].length;
  const remainder = changelog.slice(bodyStart);
  const nextHeading = remainder.search(/^## \[/m);
  const body = (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
  assert(body, `CHANGELOG.md section for ${version} is empty`);
  return `# CT-AIComm v${version}\n\n${body}\n`;
}

export function buildSpdxDocument({ version, tag, revision, created, files }) {
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const spdxFiles = sortedFiles.map((file) => ({
    SPDXID: `SPDXRef-File-${sha(Buffer.from(file.path)).slice(0, 20)}`,
    fileName: `./${file.path}`,
    checksums: [
      { algorithm: "SHA1", checksumValue: file.sha1 },
      { algorithm: "SHA256", checksumValue: file.sha256 }
    ],
    licenseConcluded: "NOASSERTION",
    licenseInfoInFiles: ["NOASSERTION"],
    copyrightText: "NOASSERTION"
  }));
  const verificationCode = sha(Buffer.from(sortedFiles.map((file) => file.sha1).sort().join("")), "sha1");
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `ct-aicomm-${tag}-source`,
    documentNamespace: `https://cloudtelecom.cn/spdx/ct-aicomm/${tag}/${revision}`,
    creationInfo: {
      created,
      creators: ["Organization: CloudTelecom", "Tool: CT-AIComm public release builder 1.0.0"]
    },
    documentDescribes: ["SPDXRef-Package-CTAIComm"],
    packages: [{
      name: "ct-aicomm",
      SPDXID: "SPDXRef-Package-CTAIComm",
      versionInfo: version,
      downloadLocation: `https://github.com/${REPOSITORY}/archive/refs/tags/${tag}.tar.gz`,
      filesAnalyzed: true,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      copyrightText: "NOASSERTION",
      packageVerificationCode: { packageVerificationCodeValue: verificationCode },
      externalRefs: [{
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: `pkg:github/cloudtelecomCN/ct-aicomm@${tag}`
      }],
      annotations: [{
        annotationDate: created,
        annotationType: "OTHER",
        annotator: "Organization: CloudTelecom",
        comment: "Licenses are file-class dependent. See LICENSE, LICENSE-DOCUMENTATION.md, and the open-source release manifest."
      }]
    }],
    files: spdxFiles,
    relationships: spdxFiles.map((file) => ({
      spdxElementId: "SPDXRef-Package-CTAIComm",
      relationshipType: "CONTAINS",
      relatedSpdxElement: file.SPDXID
    }))
  };
}

export function buildReleaseManifest({ version, tag, revision, created, artifacts }) {
  const workflowIdentity = `https://github.com/${REPOSITORY}/.github/workflows/release.yml@refs/tags/${tag}`;
  return {
    schema_version: "1.0.0",
    project: "CT-AIComm",
    release: {
      version,
      tag,
      channel: "pre-stable",
      source_repository: `https://github.com/${REPOSITORY}`,
      source_revision: revision,
      generated_at: created
    },
    evidence_boundary: {
      source_release: true,
      synthetic_examples_included: true,
      measured_production_performance_included: false,
      performance_claim_allowed: false
    },
    artifacts,
    verification: {
      checksum_algorithm: "SHA256",
      checksums_file: "SHA256SUMS",
      signature_bundle: "SHA256SUMS.sigstore.json",
      sigstore_certificate_identity: workflowIdentity,
      sigstore_oidc_issuer: "https://token.actions.githubusercontent.com",
      github_provenance: true
    }
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(["--output", "--revision", "--tag"].includes(flag) && value, `Unknown or incomplete argument: ${flag ?? "<missing>"}`);
    result[flag.slice(2)] = value;
  }
  return result;
}

async function artifactRecord(outputDirectory, file, mediaType, purpose) {
  const bytes = await readFile(path.join(outputDirectory, file));
  return { file, media_type: mediaType, purpose, size_bytes: bytes.length, sha256: sha(bytes) };
}

export async function createPublicRelease({ output, revision = "HEAD", tag: requestedTag } = {}) {
  const version = parseVersion(await readFile(path.join(ROOT, "VERSION"), "utf8"));
  const tag = requestedTag ?? `v${version}`;
  assert(tag === `v${version}`, `Release tag ${tag} does not match VERSION ${version}`);

  const status = git(["status", "--porcelain"], { encoding: "utf8" }).trim();
  assert(!status, "Release builds require a clean Git worktree");
  const sourceRevision = git(["rev-parse", `${revision}^{commit}`], { encoding: "utf8" }).trim();
  const tagRevision = git(["rev-parse", `refs/tags/${tag}^{commit}`], { encoding: "utf8" }).trim();
  assert(tagRevision === sourceRevision, `${tag} does not resolve to ${sourceRevision}`);

  const created = new Date(git(["show", "-s", "--format=%cI", sourceRevision], { encoding: "utf8" }).trim()).toISOString();
  const tracked = git(["ls-tree", "-r", "--name-only", "-z", sourceRevision], { encoding: "utf8" }).split("\0").filter(Boolean);
  assert(tracked.length > 0, "Release source inventory is empty");
  const files = tracked.map((file) => {
    const bytes = git(["show", `${sourceRevision}:${file}`]);
    return { path: file.replaceAll("\\", "/"), sha1: sha(bytes, "sha1"), sha256: sha(bytes) };
  });

  const outputDirectory = path.resolve(output ?? path.join(ROOT, "dist", "release", tag));
  await mkdir(outputDirectory, { recursive: true });
  const archiveName = `ct-aicomm-${tag}-source.tar.gz`;
  const sbomName = `ct-aicomm-${tag}.spdx.json`;
  const manifestName = `release-manifest-${tag}.json`;
  git(["archive", "--format=tar.gz", `--prefix=ct-aicomm-${tag}/`, `--output=${path.join(outputDirectory, archiveName)}`, sourceRevision]);

  const sbom = buildSpdxDocument({ version, tag, revision: sourceRevision, created, files });
  await writeFile(path.join(outputDirectory, sbomName), `${JSON.stringify(sbom, null, 2)}\n`);
  const artifacts = [
    await artifactRecord(outputDirectory, archiveName, "application/gzip", "Git source archive"),
    await artifactRecord(outputDirectory, sbomName, "application/spdx+json", "SPDX 2.3 source inventory")
  ];
  const releaseManifest = buildReleaseManifest({ version, tag, revision: sourceRevision, created, artifacts });
  await writeFile(path.join(outputDirectory, manifestName), `${JSON.stringify(releaseManifest, null, 2)}\n`);

  const checksumFiles = [archiveName, sbomName, manifestName];
  const checksumLines = [];
  for (const file of checksumFiles.sort()) {
    checksumLines.push(`${sha(await readFile(path.join(outputDirectory, file)))}  ${file}`);
  }
  await writeFile(path.join(outputDirectory, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);
  const notes = extractReleaseNotes(await readFile(path.join(ROOT, "CHANGELOG.md"), "utf8"), version);
  await writeFile(path.join(outputDirectory, "RELEASE_NOTES.md"), notes);

  const archiveStats = await stat(path.join(outputDirectory, archiveName));
  const result = { version, tag, source_revision: sourceRevision, output: outputDirectory, source_files: files.length, archive_bytes: archiveStats.size };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  createPublicRelease(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
