#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateComplianceRulePack, verifyComplianceRulePackUpgrade } from "../packages/compliance/rule-pack.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return "Usage: node scripts/validate-compliance-rule-pack.mjs <pack.json> [--previous <previous-pack.json>]";
}

async function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Rule pack input must be a regular non-symlink file");
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export async function validateRulePackFile(filePath, previousPath = null) {
  const pack = validateComplianceRulePack(await readJsonFile(filePath));
  const upgrade = previousPath ? verifyComplianceRulePackUpgrade(await readJsonFile(previousPath), pack) : null;
  return Object.freeze({
    valid: true,
    pack_id: pack.pack_id,
    pack_version: pack.pack_version,
    pack_fingerprint: pack.pack_fingerprint,
    mapping_count: pack.mappings.length,
    domains: [...new Set(pack.mappings.map(({ domain }) => domain))].sort(),
    mapping_only: true,
    legal_conclusion: false,
    certification_issued: false,
    external_assessment_performed: false,
    upgrade
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && !(args.length === 3 && args[1] === "--previous")) throw new Error(usage());
  console.log(JSON.stringify(await validateRulePackFile(args[0], args[2] ?? null), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, code: error.code ?? "rule_pack_validation_failed", error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
