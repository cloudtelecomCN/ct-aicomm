import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(await readFile(path.join(ROOT, "PUBLIC_RELEASE_ALLOWLIST.json"), "utf8"));
const ignored = new Set([".git", "node_modules", "dist", "coverage"]);
const sourceExtensions = new Set([".c", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenSourceMarkers = [
  "packages/orchestrator/",
  "packages/advisor/",
  "packages/agent-control/",
  "agent/bpf/",
  "registryAdmin",
  "orchestratorAgent",
  "CLOUDFLARE_API_TOKEN",
  "wrangler.jsonc"
];

async function walk(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    const status = await lstat(absolute);
    if (status.isSymbolicLink()) throw new Error(`symbolic links are prohibited: ${relative}`);
    if (status.isDirectory()) output.push(...await walk(absolute, relative));
    else if (status.isFile()) output.push(relative);
  }
  return output;
}

function allowed(file) {
  return policy.allowed_exact.includes(file) || policy.allowed_prefixes.some((prefix) => file.startsWith(prefix));
}

const files = (await walk(ROOT)).sort();
const failures = [];
for (const file of files) {
  if (!allowed(file)) failures.push(`${file}: not in public allowlist`);
  if (policy.forbidden_prefixes.some((prefix) => file.startsWith(prefix))) failures.push(`${file}: forbidden path`);
  if (file !== "scripts/check-public-boundary.mjs" && sourceExtensions.has(path.extname(file))) {
    const text = await readFile(path.join(ROOT, file), "utf8");
    for (const marker of forbiddenSourceMarkers) {
      if (text.includes(marker)) failures.push(`${file}: contains forbidden source marker ${marker}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ policy: policy.policy, files_checked: files.length, status: "passed" })}\n`);
}
