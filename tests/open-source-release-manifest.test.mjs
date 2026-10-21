import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("specs/release/open-source-release-manifest-v1.json", "utf8"));

test("classifies every tracked public asset exactly once", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const rules = manifest.classifications.public_now.flatMap((item) => item.paths.map((path) => ({ ...item, path })));
  for (const file of files) {
    const matches = rules.filter((item) => item.path.endsWith("/") ? file.startsWith(item.path) : file === item.path);
    assert.equal(matches.length, 1, `${file} classification count`);
  }
});

test("assigns an owner, license, rationale, and gate to all asset classes", () => {
  for (const [category, items] of Object.entries(manifest.classifications)) {
    for (const item of items) {
      assert.ok(item.owner);
      assert.ok(item.license);
      assert.ok(item.rationale);
      assert.ok(item.release_gate);
      assert.equal(item.license === "PROPRIETARY-NOT-FOR-RELEASE", category === "prohibited");
    }
  }
});
