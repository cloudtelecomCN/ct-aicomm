import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifestPath = "specs/release/open-source-release-manifest-v1.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.schema_version === "1.0.0", "Unexpected release manifest version");
assert(manifest.repository === "cloudtelecomCN/ct-aicomm", "Unexpected public repository");

const categories = ["public_now", "deferred", "prohibited"];
const ids = new Set();
for (const category of categories) {
  const items = manifest.classifications?.[category];
  assert(Array.isArray(items) && items.length > 0, `${category} must not be empty`);
  for (const item of items) {
    assert(/^[a-z0-9][a-z0-9-]+$/.test(item.id), `Invalid item id: ${item.id}`);
    assert(!ids.has(item.id), `Duplicate item id: ${item.id}`);
    ids.add(item.id);
    assert(Array.isArray(item.paths) && item.paths.length > 0, `${item.id} needs paths`);
    assert(item.owner?.trim().length >= 3, `${item.id} needs an owner`);
    assert(["Apache-2.0", "CC-BY-4.0", "PROPRIETARY-NOT-FOR-RELEASE"].includes(item.license), `${item.id} has an invalid license`);
    assert(item.rationale?.trim().length >= 12, `${item.id} needs a rationale`);
    assert(item.release_gate?.trim().length >= 12, `${item.id} needs a release gate`);
    if (category === "prohibited") assert(item.license === "PROPRIETARY-NOT-FOR-RELEASE", `${item.id} must not carry an open license`);
    else assert(item.license !== "PROPRIETARY-NOT-FOR-RELEASE", `${item.id} must declare an open license`);
  }
}

const publicRules = manifest.classifications.public_now.flatMap((item) => item.paths.map((rule) => ({ id: item.id, rule })));
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
for (const file of trackedFiles) {
  const matches = publicRules.filter(({ rule }) => rule.endsWith("/") ? file.startsWith(rule) : file === rule);
  assert(matches.length === 1, `${file} must match exactly one public_now rule; matched ${matches.map(({ id }) => id).join(", ") || "none"}`);
}

for (const item of [...manifest.classifications.deferred, ...manifest.classifications.prohibited]) {
  for (const rule of item.paths) {
    assert(!trackedFiles.some((file) => rule.endsWith("/") ? file.startsWith(rule) : file === rule), `${item.id} path is already tracked: ${rule}`);
  }
}

console.log(`CT-545 release manifest covers ${trackedFiles.length} tracked files with ${ids.size} owned asset classes.`);
