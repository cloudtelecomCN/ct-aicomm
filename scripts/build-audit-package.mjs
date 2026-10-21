#!/usr/bin/env node

import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuditPackage } from "../packages/compliance/audit-package.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DESCRIPTOR_FIELDS = ["schema_version", "package_id", "tenant_id", "workload_id", "execution_id", "created_at", "artifacts"];
const ARTIFACT_FIELDS = ["kind", "artifact_id", "source", "path", "media_type", "schema_version", "fingerprint_field", "evidence_origin"];

function usage() {
  return "Usage: node scripts/build-audit-package.mjs <descriptor.json> <empty-output-directory>";
}

function exactObject(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not allowed`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
}

function safeSourcePath(value, index) {
  if (typeof value !== "string" || !value || value.includes("\\")) throw new Error(`artifacts[${index}].source must be a portable relative path`);
  const segments = value.split("/");
  if (path.isAbsolute(value) || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`artifacts[${index}].source must remain under the descriptor directory`);
  }
  return value;
}

async function readSource(descriptorDirectory, source, index) {
  const candidate = path.resolve(descriptorDirectory, ...source.split("/"));
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`artifacts[${index}].source must be a regular non-symlink file`);
  const [root, resolved] = await Promise.all([realpath(descriptorDirectory), realpath(candidate)]);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`artifacts[${index}].source escapes the descriptor directory`);
  }
  return readFile(resolved);
}

async function prepareOutput(outputDirectory) {
  try {
    const metadata = await lstat(outputDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Output path must be a regular directory");
    if ((await readdir(outputDirectory)).length !== 0) throw new Error("Output directory must be empty");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(outputDirectory, { recursive: true });
  }
}

export async function buildAuditPackageDirectory(descriptorPath, outputDirectory) {
  const absoluteDescriptor = path.resolve(descriptorPath);
  const absoluteOutput = path.resolve(outputDirectory);
  const descriptor = JSON.parse(await readFile(absoluteDescriptor, "utf8"));
  exactObject(descriptor, DESCRIPTOR_FIELDS, "descriptor");
  if (descriptor.schema_version !== "1.0.0") throw new Error("descriptor.schema_version must equal 1.0.0");
  if (!Array.isArray(descriptor.artifacts)) throw new Error("descriptor.artifacts must be an array");
  const descriptorDirectory = path.dirname(absoluteDescriptor);
  const artifacts = await Promise.all(descriptor.artifacts.map(async (artifact, index) => {
    exactObject(artifact, ARTIFACT_FIELDS, `artifacts[${index}]`);
    const source = safeSourcePath(artifact.source, index);
    const content = await readSource(descriptorDirectory, source, index);
    return {
      kind: artifact.kind,
      artifactId: artifact.artifact_id,
      path: artifact.path,
      mediaType: artifact.media_type,
      schemaVersion: artifact.schema_version,
      fingerprintField: artifact.fingerprint_field,
      evidenceOrigin: artifact.evidence_origin,
      content
    };
  }));
  const built = createAuditPackage({
    packageId: descriptor.package_id,
    tenantId: descriptor.tenant_id,
    workloadId: descriptor.workload_id,
    executionId: descriptor.execution_id,
    createdAt: new Date(descriptor.created_at),
    artifacts
  });

  await prepareOutput(absoluteOutput);
  await mkdir(path.join(absoluteOutput, "artifacts"), { recursive: false });
  await Promise.all([
    writeFile(path.join(absoluteOutput, "manifest.json"), built.manifestBytes, { flag: "wx" }),
    writeFile(path.join(absoluteOutput, "SHA256SUMS"), built.checksumsText, { encoding: "utf8", flag: "wx" }),
    ...built.files.map(({ path: relativePath, bytes }) => writeFile(path.join(absoluteOutput, ...relativePath.split("/")), bytes, { flag: "wx" }))
  ]);
  return Object.freeze({
    valid: true,
    package_id: built.manifest.package_id,
    package_fingerprint: built.manifest.package_fingerprint,
    evidence_origin: built.manifest.evidence_origin,
    artifact_count: built.files.length,
    output_directory: absoluteOutput,
    integrity_manifest_created: true,
    authenticity_verified: false,
    authorization_verified: false,
    legal_or_certification_conclusion: false
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error(usage());
  console.log(JSON.stringify(await buildAuditPackageDirectory(args[0], args[1]), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
