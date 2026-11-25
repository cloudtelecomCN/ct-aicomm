#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import validateEvidence from "./evidence-schema.generated.mjs";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const fields = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${fields.join(",")}}`;
}

function computeEvidenceFingerprint({ content_fingerprint: _fingerprint, ...content }) {
  return `sha256:${createHash("sha256").update(canonicalJson(content), "utf8").digest("hex")}`;
}

export function verifyPublicEvidence(value) {
  const errors = [];
  const schemaValid = validateEvidence(value);
  if (!schemaValid) {
    for (const error of validateEvidence.errors) {
      errors.push(`${error.instancePath || "/"}: ${error.message}`);
    }
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }
  if (value.object_type === "evidence_version") {
    if (value.boundary.data_origin !== "synthetic") errors.push("public example must declare synthetic data_origin");
    if (value.boundary.performance_claim_allowed !== false) errors.push("public example must prohibit performance claims");
    if (value.content_fingerprint !== computeEvidenceFingerprint(value)) errors.push("content_fingerprint does not match the canonical evidence document");
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

async function main(argv) {
  if (argv.length !== 1) throw new Error("usage: node cli/verify-evidence.mjs <evidence.json>");
  const filename = path.resolve(argv[0]);
  const value = JSON.parse(await readFile(filename, "utf8"));
  const result = verifyPublicEvidence(value);
  const verification_scope = value?.object_type === "evidence_version"
    ? "schema, synthetic-only boundary, and document SHA-256"
    : "schema only";
  process.stdout.write(`${JSON.stringify({ file: filename, ...result, verification_scope }, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
