#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuditPackage } from "../packages/compliance/audit-package.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_ENTRIES = ["SHA256SUMS", "artifacts", "manifest.json"];

function usage() {
  return "Usage: node scripts/verify-audit-package.mjs <package-directory> [--tenant ID --workload ID --execution ID]";
}

async function regularFile(filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return readFile(filePath);
}

async function loadPackage(packageDirectory) {
  const root = path.resolve(packageDirectory);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("Package root must be a regular non-symlink directory");
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify(ROOT_ENTRIES)) {
    throw new Error("Package root must contain exactly manifest.json, SHA256SUMS, and artifacts/");
  }
  const artifactDirectory = entries.find(({ name }) => name === "artifacts");
  if (!artifactDirectory?.isDirectory() || artifactDirectory.isSymbolicLink()) throw new Error("artifacts must be a regular non-symlink directory");
  const artifactEntries = await readdir(path.join(root, "artifacts"), { withFileTypes: true });
  const files = await Promise.all(artifactEntries.map(async (entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`artifacts/${entry.name} must be a regular non-symlink file`);
    return {
      path: `artifacts/${entry.name}`,
      bytes: await regularFile(path.join(root, "artifacts", entry.name), `artifacts/${entry.name}`)
    };
  }));
  return {
    root,
    manifestBytes: await regularFile(path.join(root, "manifest.json"), "manifest.json"),
    checksumsBytes: await regularFile(path.join(root, "SHA256SUMS"), "SHA256SUMS"),
    files
  };
}

function parseContext(args) {
  if (args.length === 0) return undefined;
  if (args.length !== 6) throw new Error(usage());
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (options.has(args[index])) throw new Error(usage());
    options.set(args[index], args[index + 1]);
  }
  if (options.size !== 3 || !["--tenant", "--workload", "--execution"].every((flag) => options.has(flag))) throw new Error(usage());
  return {
    tenant_id: options.get("--tenant"),
    workload_id: options.get("--workload"),
    execution_id: options.get("--execution")
  };
}

export async function verifyAuditPackageDirectory(packageDirectory, expectedContext) {
  const loaded = await loadPackage(packageDirectory);
  return Object.freeze({
    ...verifyAuditPackage({
      manifestBytes: loaded.manifestBytes,
      checksumsBytes: loaded.checksumsBytes,
      files: loaded.files,
      ...(expectedContext === undefined ? {} : { expectedContext })
    }),
    package_directory: loaded.root,
    verification_scope: "integrity-and-declared-context"
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && args.length !== 7) throw new Error(usage());
  const expectedContext = parseContext(args.slice(1));
  console.log(JSON.stringify(await verifyAuditPackageDirectory(args[0], expectedContext), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, code: error.code ?? "verification_failed", error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
