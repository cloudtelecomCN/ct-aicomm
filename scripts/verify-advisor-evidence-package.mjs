#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAdvisorFormalEvidencePackage } from "../packages/advisor/formal-evidence-package.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return "Usage: node scripts/verify-advisor-evidence-package.mjs <package.zip> [--sha256 <sidecar>] [--package-id <id>] [--contract-id <id>]";
}

async function regularFile(filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return readFile(filePath);
}

function parseOptions(args) {
  if (args.length < 1 || args.length % 2 === 0) throw new Error(usage());
  const archivePath = path.resolve(args[0]);
  const options = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    if (!new Set(["--sha256", "--package-id", "--contract-id"]).has(key) || !args[index + 1] || options.has(key)) throw new Error(usage());
    options.set(key, args[index + 1]);
  }
  return {
    archivePath,
    sidecarPath: path.resolve(options.get("--sha256") ?? `${archivePath}.sha256`),
    expectedPackageId: options.get("--package-id"),
    expectedContractId: options.get("--contract-id"),
  };
}

export async function verifyAdvisorEvidencePackageFile(input) {
  const archivePath = path.resolve(input.archivePath);
  const sidecarPath = path.resolve(input.sidecarPath ?? `${archivePath}.sha256`);
  return Object.freeze({
    ...verifyAdvisorFormalEvidencePackage({
      archiveBytes: await regularFile(archivePath, "Evidence Package ZIP"),
      archiveName: path.basename(archivePath),
      archiveDigestSidecar: await regularFile(sidecarPath, "archive SHA-256 sidecar"),
      ...(input.expectedPackageId === undefined ? {} : { expectedPackageId: input.expectedPackageId }),
      ...(input.expectedContractId === undefined ? {} : { expectedContractId: input.expectedContractId }),
    }),
    archive_path: archivePath,
    sidecar_path: sidecarPath,
    verification_scope: "offline-integrity-format-and-declared-snapshot",
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  console.log(JSON.stringify(await verifyAdvisorEvidencePackageFile(options), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, code: error.code ?? "verification_failed", error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
