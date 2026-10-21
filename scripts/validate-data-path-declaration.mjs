#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDataPathDeclaration, verifyDataPathDeclaration } from "../packages/compliance/data-path-declaration.mjs";

function usage() {
  return "Usage: node scripts/validate-data-path-declaration.mjs <declaration.json|declaration.yaml> [--tenant ID --workload ID --revision N]";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && args.length !== 7) throw new Error(usage());
  const declarationPath = path.resolve(args[0]);
  const extension = path.extname(declarationPath).toLowerCase();
  if (![".json", ".yaml", ".yml"].includes(extension)) throw new Error("Declaration must use .json, .yaml, or .yml");
  const declaration = JSON.parse(await readFile(declarationPath, "utf8"));
  let result;
  if (args.length === 1) {
    result = validateDataPathDeclaration(declaration);
  } else {
    const options = new Map();
    for (let index = 1; index < args.length; index += 2) options.set(args[index], args[index + 1]);
    if (!["--tenant", "--workload", "--revision"].every((flag) => options.has(flag)) || options.size !== 3) throw new Error(usage());
    result = verifyDataPathDeclaration(declaration, {
      tenant_id: options.get("--tenant"),
      workload_id: options.get("--workload"),
      revision: Number(options.get("--revision"))
    });
  }
  console.log(JSON.stringify({
    ...result,
    source_format: extension === ".json" ? "json" : "yaml-json-compatible",
    structural_and_semantic_validation: true,
    legal_or_certification_conclusion: false
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, code: error.code ?? "validation_failed", error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
