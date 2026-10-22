import { mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export function isPathWithin(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "") return allowRoot;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertWithin(root, candidate, { allowRoot = false, label = "Path" } = {}) {
  if (!isPathWithin(root, candidate, { allowRoot })) {
    throw new Error(`${label} escapes the allowed root: ${candidate}`);
  }
}

export async function resolveExistingPathWithinRoot(root, candidate, options = {}) {
  const rootResolved = path.resolve(root);
  const candidateResolved = path.resolve(rootResolved, candidate);
  assertWithin(rootResolved, candidateResolved, options);

  const [rootReal, candidateReal] = await Promise.all([
    realpath(rootResolved),
    realpath(candidateResolved)
  ]);
  assertWithin(rootReal, candidateReal, options);
  return candidateReal;
}

async function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function prepareEmptyDirectoryWithinRoot(root, candidate, options = {}) {
  const rootResolved = path.resolve(root);
  const candidateResolved = path.resolve(candidate);
  const boundaryOptions = { allowRoot: true, label: "Output directory", ...options };

  await mkdir(rootResolved, { recursive: true });
  assertWithin(rootResolved, candidateResolved, boundaryOptions);

  const rootReal = await realpath(rootResolved);
  const ancestorReal = await nearestExistingAncestor(candidateResolved);
  assertWithin(rootReal, ancestorReal, boundaryOptions);

  await mkdir(candidateResolved, { recursive: true });
  const candidateReal = await realpath(candidateResolved);
  assertWithin(rootReal, candidateReal, boundaryOptions);

  const entries = await readdir(candidateReal);
  if (entries.length > 0) {
    throw new Error(`${boundaryOptions.label} must be empty: ${candidateResolved}`);
  }
  return candidateReal;
}
