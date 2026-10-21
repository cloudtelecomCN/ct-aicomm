#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectEvidenceGaps } from "../packages/compliance/evidence-gap.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return "Usage: node scripts/inspect-evidence-gaps.mjs <assessment.json> --tenant ID --workload ID --execution ID --at ISO [--trusted-verifier ID ...]";
}

function parseArguments(args) {
  if (args.length < 9) throw new Error(usage());
  const assessmentPath = args[0];
  const single = new Map();
  const trustedVerifierIds = [];
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(usage());
    if (flag === "--trusted-verifier") {
      trustedVerifierIds.push(value);
      continue;
    }
    if (!["--tenant", "--workload", "--execution", "--at"].includes(flag) || single.has(flag)) throw new Error(usage());
    single.set(flag, value);
  }
  if (!["--tenant", "--workload", "--execution", "--at"].every((flag) => single.has(flag))) throw new Error(usage());
  return {
    assessmentPath,
    expectedContext: {
      tenant_id: single.get("--tenant"),
      workload_id: single.get("--workload"),
      execution_id: single.get("--execution")
    },
    evaluatedAt: new Date(single.get("--at")),
    trustedVerifierIds
  };
}

async function readAssessment(filePath) {
  const absolutePath = path.resolve(filePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Assessment input must be a regular non-symlink file");
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export async function inspectEvidenceGapFile(filePath, options) {
  return inspectEvidenceGaps(await readAssessment(filePath), options);
}

async function main() {
  const { assessmentPath, ...options } = parseArguments(process.argv.slice(2));
  const report = await inspectEvidenceGapFile(assessmentPath, options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.requirements_satisfied) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: "not_satisfied",
      default_deny: true,
      code: error.code ?? "inspection_failed",
      error: error.message
    }, null, 2));
    process.exitCode = 1;
  });
}
