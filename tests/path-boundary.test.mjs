import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareReleaseOutputDirectory } from "../scripts/create-public-release.mjs";
import { resolveExistingPathWithinRoot } from "../scripts/path-boundary.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "ct-aicomm-path-boundary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "root");
  const outside = path.join(directory, "outside");
  await Promise.all([mkdir(root), mkdir(outside)]);
  return { directory, root, outside };
}

async function createDirectoryLink(t, target, link) {
  try {
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
    t.diagnostic(`symbolic-link assertion skipped because this host denies link creation (${error.code})`);
    return false;
  }
}

test("resolves repository files only after enforcing lexical and real paths", async (t) => {
  const { root, outside } = await fixture(t);
  const insideFile = path.join(root, "inside.mjs");
  const outsideFile = path.join(outside, "outside.mjs");
  await Promise.all([
    writeFile(insideFile, "export default true;\n"),
    writeFile(outsideFile, "export default false;\n")
  ]);

  assert.equal(await resolveExistingPathWithinRoot(root, "inside.mjs"), await realpath(insideFile));
  await assert.rejects(
    resolveExistingPathWithinRoot(root, path.join("..", "outside", "outside.mjs")),
    /escapes the allowed root/u
  );

  const link = path.join(root, "linked-outside");
  if (await createDirectoryLink(t, outside, link)) {
    await assert.rejects(
      resolveExistingPathWithinRoot(root, path.join("linked-outside", "outside.mjs")),
      /escapes the allowed root/u
    );
  }
});

test("release output stays below an explicit empty output root", async (t) => {
  const { directory, root, outside } = await fixture(t);
  const environment = { CT_RELEASE_OUTPUT_ROOT: root };
  const output = path.join(root, "v0.1.0");

  assert.equal(
    await prepareReleaseOutputDirectory({ output, tag: "v0.1.0", environment }),
    output
  );
  await writeFile(path.join(output, "existing.txt"), "do not overwrite\n");
  await assert.rejects(
    prepareReleaseOutputDirectory({ output, tag: "v0.1.0", environment }),
    /must be empty/u
  );
  await assert.rejects(
    prepareReleaseOutputDirectory({ output: path.join(directory, "escaped"), tag: "v0.1.0", environment }),
    /escapes the allowed root/u
  );

  const link = path.join(root, "linked-output");
  if (await createDirectoryLink(t, outside, link)) {
    await assert.rejects(
      prepareReleaseOutputDirectory({ output: path.join(link, "release"), tag: "v0.1.0", environment }),
      /escapes the allowed root/u
    );
  }
});
