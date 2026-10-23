import { pathToFileURL } from "node:url";

import {
  buildAdvisorFormalEvidencePackageContract,
  validateAdvisorFormalEvidencePackageContract,
} from "../../packages/advisor/formal-evidence-package-contract.mjs";

export const syntheticFormalPackageSourceBindings = Object.freeze({
  basic_report: {
    report_id: "advisor_basic_report_55555555-5555-4555-8555-555555555555",
    content_sha256: `sha256:${"1".repeat(64)}`,
  },
  requirement_passport: {
    passport_id: "advisor_passport_44444444-4444-4444-8444-444444444444",
    revision: 2,
    content_sha256: `sha256:${"2".repeat(64)}`,
  },
  constraint_evaluation: {
    evaluation_id: "advisor_constraint_evaluation_11111111-1111-4111-8111-111111111111",
    content_sha256: `sha256:${"3".repeat(64)}`,
  },
  analysis: {
    analysis_id: "advisor_analysis_33333333-3333-4333-8333-333333333333",
    content_sha256: `sha256:${"4".repeat(64)}`,
    method_sha256: `sha256:${"5".repeat(64)}`,
    observation_set_sha256: `sha256:${"6".repeat(64)}`,
  },
});

export function createSyntheticFormalPackageContract(locale = "en") {
  return buildAdvisorFormalEvidencePackageContract({
    contractId: "advisor_package_contract_66666666-6666-4666-8666-666666666666",
    projectId: "advisor_project_44444444-4444-4444-8444-444444444444",
    locale,
    sourceBindings: syntheticFormalPackageSourceBindings,
    frozenAt: "2026-10-23T13:00:00.000Z",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contract = createSyntheticFormalPackageContract();
  const verification = validateAdvisorFormalEvidencePackageContract(contract);
  console.log(JSON.stringify({
    schema_version: contract.schema_version,
    contract_type: contract.contract_type,
    state: contract.state,
    data_origin: "synthetic",
    artifact_count: verification.artifact_count,
    capability_key: contract.capability_key,
    profile_sha256: verification.profile_sha256,
    content_sha256: verification.content_sha256,
    contract_only: contract.boundaries.contract_only,
    formal_package_generated: contract.boundaries.formal_package_generated,
    entitlement_granted: contract.boundaries.entitlement_granted,
    execution_authorized: contract.boundaries.execution_authorized,
    performance_claim_allowed: contract.boundaries.performance_claim_allowed,
  }, null, 2));
}
