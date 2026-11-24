#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FINGERPRINT = /^sha256:[a-f0-9]{64}$/u;
const SUPPORTED_TYPES = new Set([
  "scope", "method", "run", "observation", "artifact",
  "evidence_version", "review", "policy_decision", "export_grant"
]);

export function verifyPublicEvidence(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) errors.push("document must be an object");
  else {
    if (value.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
    if (!SUPPORTED_TYPES.has(value.object_type)) errors.push("object_type is unsupported");
    if (value.object_type === "evidence_version") {
      if (!value.boundary || value.boundary.data_origin !== "synthetic") errors.push("public example must declare synthetic data_origin");
      if (value.boundary?.performance_claim_allowed !== false) errors.push("public example must prohibit performance claims");
      if (!FINGERPRINT.test(value.content_fingerprint || "")) errors.push("content_fingerprint must be sha256:<64 lowercase hex characters>");
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

async function main(argv) {
  if (argv.length !== 1) throw new Error("usage: node cli/verify-evidence.mjs <evidence.json>");
  const filename = path.resolve(argv[0]);
  const value = JSON.parse(await readFile(filename, "utf8"));
  const result = verifyPublicEvidence(value);
  process.stdout.write(`${JSON.stringify({ file: filename, ...result }, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
