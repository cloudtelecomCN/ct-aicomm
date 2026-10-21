#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyRegistryEntryHistory } from "../packages/registry-entry-integrity/index.mjs";

function value(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function safePath(root, requested) {
  if (typeof requested !== "string" || requested.length === 0 || isAbsolute(requested)) throw new Error(`Unsafe repository path: ${requested}`);
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`Path escapes repository root: ${requested}`);
  return path;
}

export async function verifyHistoryFiles({
  root = process.cwd(),
  historyPath = "registry/entries/synthetic-quic-example/history.json",
  keysPath = "registry/keys/synthetic-fixture-ed25519-public.json"
} = {}) {
  root = resolve(root);
  const [history, keyring] = await Promise.all([
    readFile(safePath(root, historyPath), "utf8").then(JSON.parse),
    readFile(safePath(root, keysPath), "utf8").then(JSON.parse)
  ]);
  if (history.schema_version !== "1.0.0" || !Array.isArray(history.records)) throw new Error("Unsupported Registry history document");
  if (keyring.schema_version !== "1.0.0" || !Array.isArray(keyring.keys)) throw new Error("Unsupported Registry public keyring");

  const publicKeys = Object.fromEntries(keyring.keys.map((key) => {
    if (key.algorithm !== "Ed25519" || key.private_key_committed !== false) throw new Error(`Unsafe or unsupported key record: ${key.key_id}`);
    return [key.key_id, key.public_key_pem];
  }));
  const artifactPaths = [...new Set(history.records.flatMap(({ entry }) => entry.artifacts.map(({ path }) => path)))];
  const artifactBytesByPath = Object.fromEntries(await Promise.all(artifactPaths.map(async (path) => [path, await readFile(safePath(root, path))])));
  const result = verifyRegistryEntryHistory(history.records, { publicKeys, artifactBytesByPath });
  return {
    ...result,
    history_path: historyPath,
    record_count: history.records.length,
    data_origin: history.data_origin,
    performance_claim_allowed: history.performance_claim_allowed
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyHistoryFiles({
    root: value("--root", process.cwd()),
    historyPath: value("--history", "registry/entries/synthetic-quic-example/history.json"),
    keysPath: value("--keys", "registry/keys/synthetic-fixture-ed25519-public.json")
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
