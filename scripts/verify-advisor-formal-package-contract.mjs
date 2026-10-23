import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdvisorFormalEvidencePackageContract } from "../packages/advisor/formal-evidence-package-contract.mjs";
import { resolveExistingPathWithinRoot } from "./path-boundary.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

async function main() {
  const [input] = process.argv.slice(2);
  if (!input || path.isAbsolute(input)) throw new Error("Usage: node scripts/verify-advisor-formal-package-contract.mjs <repository-relative-contract.json>");
  const file = await resolveExistingPathWithinRoot(ROOT, input, { label: "Formal package contract" });
  const contract = JSON.parse(await readFile(file, "utf8"));
  console.log(JSON.stringify({
    schema_version: contract.schema_version,
    contract_id: contract.contract_id,
    project_id: contract.project_id,
    ...validateAdvisorFormalEvidencePackageContract(contract),
    formal_package_generated: contract.boundaries.formal_package_generated,
    entitlement_granted: contract.boundaries.entitlement_granted,
    execution_authorized: contract.boundaries.execution_authorized,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ valid: false, code: error?.code || "formal_package_contract_verification_failed", error: error.message }, null, 2));
  process.exitCode = 1;
});
