#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEvidenceContentBundle } from "../packages/evidence-integrity/index.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REQUIRED_ROOT_FILES = new Set(["manifest.json", "SHA256SUMS"]);

function usage() {
  return "Usage: node scripts/verify-evidence-content.mjs <bundle-directory> [--expected-manifest sha256:<64 lowercase hex>]";
}

function inside(root, candidate) {
  return candidate.startsWith(`${root}${path.sep}`);
}

async function regularFile(rootReal, filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const fileReal = await realpath(filePath);
  if (!inside(rootReal, fileReal)) throw new Error(`${label} resolves outside the bundle root`);
  return readFile(fileReal);
}

async function loadBundle(bundleDirectory) {
  const requestedRoot = path.resolve(bundleDirectory);
  const rootMetadata = await lstat(requestedRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("Bundle root must be a regular non-symlink directory");
  const rootReal = await realpath(requestedRoot);
  const entries = await readdir(rootReal, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  for (const required of REQUIRED_ROOT_FILES) {
    if (!names.includes(required)) throw new Error(`Bundle root is missing ${required}`);
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${entry.name} must be a regular non-symlink file`);
    if (REQUIRED_ROOT_FILES.has(entry.name)) continue;
    files.push({ path: entry.name, bytes: await regularFile(rootReal, path.join(rootReal, entry.name), entry.name) });
  }
  return {
    root: rootReal,
    manifestBytes: await regularFile(rootReal, path.join(rootReal, "manifest.json"), "manifest.json"),
    checksumsBytes: await regularFile(rootReal, path.join(rootReal, "SHA256SUMS"), "SHA256SUMS"),
    files
  };
}

function parseArgs(args) {
  if (args.length !== 1 && args.length !== 3) throw new Error(usage());
  if (args.length === 3 && args[1] !== "--expected-manifest") throw new Error(usage());
  return { bundleDirectory: args[0], expectedManifestFingerprint: args[2] };
}

export async function verifyEvidenceContentDirectory(bundleDirectory, expectedManifestFingerprint) {
  const loaded = await loadBundle(bundleDirectory);
  return Object.freeze({
    ...verifyEvidenceContentBundle({
      manifestBytes: loaded.manifestBytes,
      checksumsBytes: loaded.checksumsBytes,
      files: loaded.files,
      ...(expectedManifestFingerprint === undefined ? {} : { expectedManifestFingerprint })
    }),
    bundle_directory: loaded.root,
    verification_scope: "content-integrity-only"
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(await verifyEvidenceContentDirectory(parsed.bundleDirectory, parsed.expectedManifestFingerprint), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, code: error.code ?? "evidence_integrity_cli_failed", error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
