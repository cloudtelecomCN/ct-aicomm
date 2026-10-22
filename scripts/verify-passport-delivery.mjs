#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPassportDeliveryPackage } from "../packages/link-evidence-passport/delivery.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MAX_FILE_BYTES = 16 * 1024 * 1024;

function usage() {
  return "Usage: node scripts/verify-passport-delivery.mjs <delivery-directory>";
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function loadDeliveryDirectory(directory) {
  const requestedRoot = path.resolve(directory);
  const rootMetadata = await lstat(requestedRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Delivery root must be a regular non-symlink directory");
  }
  const rootReal = await realpath(requestedRoot);
  const entries = (await readdir(rootReal, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`${entry.name} must be a regular non-symlink file`);
    }
    const requestedFile = path.join(rootReal, entry.name);
    const fileReal = await realpath(requestedFile);
    if (!inside(rootReal, fileReal)) throw new Error(`${entry.name} resolves outside the delivery root`);
    const metadata = await lstat(fileReal);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_FILE_BYTES) {
      throw new Error(`${entry.name} must be a regular file no larger than ${MAX_FILE_BYTES} bytes`);
    }
    files.push({ path: entry.name, content: await readFile(fileReal) });
  }
  return files;
}

export async function verifyPassportDeliveryDirectory(directory) {
  return verifyPassportDeliveryPackage({ files: await loadDeliveryDirectory(directory) });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error(usage());
  console.log(JSON.stringify(await verifyPassportDeliveryDirectory(args[0]), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      valid: false,
      code: error.code ?? "passport_delivery_cli_failed",
      error: error.message
    }, null, 2));
    process.exitCode = 1;
  });
}
