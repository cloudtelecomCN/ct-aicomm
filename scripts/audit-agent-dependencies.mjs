import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["packages/agent-control", "scripts"];
const allowedBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const importPattern = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
const findings = [];
let filesScanned = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".js", ".mjs", ".cjs"].includes(extname(entry.name))) await inspect(path);
  }
}

async function inspect(path) {
  filesScanned += 1;
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier.startsWith(".") || specifier.startsWith("/") || allowedBuiltins.has(specifier)) continue;
    findings.push({ path: path.slice(root.length + 1).replaceAll("\\", "/"), specifier });
  }
}

for (const sourceRoot of sourceRoots) await walk(resolve(root, sourceRoot));
const report = {
  schema_version: "1.0.0",
  scope: sourceRoots,
  files_scanned: filesScanned,
  third_party_runtime_dependencies: findings,
  status: findings.length === 0 ? "passed" : "failed"
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (findings.length > 0) process.exitCode = 1;
