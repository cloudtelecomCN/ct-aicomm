#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEvidenceContentBundle,
  deriveEvidenceContentFingerprint
} from "../../packages/evidence-integrity/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIRECTORY = path.join(HERE, "v1");
const GENERATED = new Set(["manifest.json", "SHA256SUMS"]);

async function loadObjects() {
  const names = (await readdir(BUNDLE_DIRECTORY)).filter((name) => name.endsWith(".json") && !GENERATED.has(name)).sort();
  return Promise.all(names.map(async (name) => ({ path: name, content: await readFile(path.join(BUNDLE_DIRECTORY, name)) })));
}

for (const entry of await loadObjects()) {
  const payload = JSON.parse(new TextDecoder().decode(entry.content));
  await writeFile(path.join(BUNDLE_DIRECTORY, entry.path), `${JSON.stringify(payload, null, 2)}\n`);
}

const before = await loadObjects();
const contentFingerprint = deriveEvidenceContentFingerprint(before);
const evidencePath = path.join(BUNDLE_DIRECTORY, "evidence-version.synthetic.json");
const evidenceVersion = JSON.parse(await readFile(evidencePath, "utf8"));
evidenceVersion.content_fingerprint = contentFingerprint;
await writeFile(evidencePath, `${JSON.stringify(evidenceVersion, null, 2)}\n`);

const bundle = createEvidenceContentBundle({
  manifestId: "manifest-synthetic-evidence-v1",
  evidenceRef: {
    object_type: "evidence_version",
    object_id: evidenceVersion.evidence_id,
    version: evidenceVersion.version,
    tenant_id: evidenceVersion.tenant_id
  },
  dataOrigin: "synthetic",
  createdAt: new Date("2026-10-23T00:00:00.000Z"),
  objects: await loadObjects()
});

await writeFile(path.join(BUNDLE_DIRECTORY, "manifest.json"), bundle.manifestBytes);
await writeFile(path.join(BUNDLE_DIRECTORY, "SHA256SUMS"), bundle.checksumsText);
console.log(JSON.stringify({
  bundle_directory: BUNDLE_DIRECTORY,
  object_count: bundle.manifest.objects.length,
  content_fingerprint: bundle.manifest.content_fingerprint,
  manifest_fingerprint: bundle.manifest.manifest_fingerprint,
  data_origin: bundle.manifest.data_origin,
  performance_claim_allowed: false
}, null, 2));
