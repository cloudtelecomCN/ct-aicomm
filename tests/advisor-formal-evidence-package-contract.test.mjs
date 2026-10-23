import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADVISOR_FORMAL_PACKAGE_ITEMS,
  assessAdvisorFormalPackageCompatibility,
  buildAdvisorFormalEvidencePackageContract,
  getAdvisorFormalPackageProfile,
  validateAdvisorFormalEvidencePackageContract,
} from "../packages/advisor/formal-evidence-package-contract.mjs";
import {
  createSyntheticFormalPackageContract,
  syntheticFormalPackageSourceBindings,
} from "../examples/advisor/formal-evidence-package-contract-synthetic.mjs";

const expectedProfileSha256 = "sha256:2ecb705e63ee48dc7f615da2eeab6feb9a244470ca61f182d8da1adb1dd94665";
const expectedContractSha256 = "sha256:21f5d6dff752bb4e58e9bffd38ded31ada8e95ecb442363bf756f3404ec9fc5c";

test("freezes the 13-item GPU decision and evidence package contract", () => {
  const contract = createSyntheticFormalPackageContract();
  assert.equal(contract.capability_key, "gpu_preprocurement_decision_evidence_package");
  assert.equal(contract.package_profile.delivery_items.length, 13);
  assert.deepEqual(contract.package_profile.delivery_items.map(({ item_id }) => item_id), ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13"]);
  assert.equal(contract.package_profile.profile_sha256, expectedProfileSha256);
  assert.equal(contract.content_sha256, expectedContractSha256);
  assert.deepEqual(validateAdvisorFormalEvidencePackageContract(contract), {
    valid: true,
    contract_frozen: true,
    artifact_count: 13,
    profile_sha256: expectedProfileSha256,
    content_sha256: expectedContractSha256,
  });
});

test("preserves paid-workflow boundaries without weakening the free product", () => {
  const contract = createSyntheticFormalPackageContract("zh-CN");
  assert.equal(contract.boundaries.contract_only, true);
  assert.equal(contract.boundaries.formal_package_generated, false);
  assert.equal(contract.boundaries.entitlement_granted, false);
  assert.equal(contract.boundaries.formal_report_issued, false);
  assert.equal(contract.boundaries.human_decision_recorded, false);
  assert.equal(contract.boundaries.offline_package_assembled, false);
  assert.equal(contract.boundaries.execution_authorized, false);
  assert.equal(contract.boundaries.certification_issued, false);
  assert.equal(contract.boundaries.performance_claim_allowed, false);
  assert.notEqual(contract.content_sha256, expectedContractSha256);
});

test("rejects changed sources, artifact profiles, boundaries, and digests", () => {
  const sourceTamper = createSyntheticFormalPackageContract();
  sourceTamper.source_bindings.analysis.content_sha256 = `sha256:${"a".repeat(64)}`;
  assert.throws(() => validateAdvisorFormalEvidencePackageContract(sourceTamper), (error) => error.code === "formal_package_contract_digest_mismatch");

  const itemTamper = createSyntheticFormalPackageContract();
  itemTamper.package_profile.delivery_items[0].allowed_formats = ["txt"];
  assert.throws(() => validateAdvisorFormalEvidencePackageContract(itemTamper), (error) => error.code === "formal_package_items_changed");

  const boundaryTamper = createSyntheticFormalPackageContract();
  boundaryTamper.boundaries.formal_package_generated = true;
  assert.throws(() => validateAdvisorFormalEvidencePackageContract(boundaryTamper), (error) => error.code === "formal_package_boundary_invalid");
});

test("uses strict, explicit SemVer compatibility", () => {
  assert.deepEqual(assessAdvisorFormalPackageCompatibility({ documentSchemaVersion: "1.0.0", documentProfileVersion: "1.0.0" }), {
    compatible: true,
    policy_id: "ct-advisor-evidence-package-strict-semver-v1",
    schema_compatible: true,
    profile_compatible: true,
    reason: "supported",
  });
  assert.equal(assessAdvisorFormalPackageCompatibility({ documentSchemaVersion: "1.1.0", documentProfileVersion: "1.0.0" }).compatible, false);
  assert.equal(assessAdvisorFormalPackageCompatibility({ documentSchemaVersion: "2.0.0", documentProfileVersion: "1.0.0", readerSchemaVersion: "2.0.0" }).profile_compatible, true);
  assert.equal(assessAdvisorFormalPackageCompatibility({ documentSchemaVersion: "2.0.0", documentProfileVersion: "2.0.0" }).compatible, false);
});

test("publishes strict contract and forward manifest Schemas", async () => {
  const [contractSchema, manifestSchema] = await Promise.all([
    readFile(new URL("../specs/advisor/formal-evidence-package-contract-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/advisor/formal-evidence-package-manifest-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(contractSchema.additionalProperties, false);
  assert.equal(contractSchema.properties.capability_key.const, "gpu_preprocurement_decision_evidence_package");
  assert.equal(contractSchema.$defs.packageProfile.properties.delivery_items.minItems, 13);
  assert.equal(contractSchema.$defs.packageProfile.properties.delivery_items.maxItems, 13);
  assert.equal(contractSchema.$defs.boundaries.properties.formal_package_generated.const, false);
  assert.equal(manifestSchema.additionalProperties, false);
  assert.equal(manifestSchema.properties.delivery_items.minItems, 13);
  assert.equal(manifestSchema.properties.delivery_items.maxItems, 13);
  assert.equal(manifestSchema.$defs.containerItem.properties.files.maxItems, 0);
  assert.match(manifestSchema.$defs.containerItem.properties.container_semantics.const, /external_sidecar/);
});

test("keeps the public profile free of customer, price, entitlement, and credential data", () => {
  const serialized = JSON.stringify(getAdvisorFormalPackageProfile());
  assert.equal(ADVISOR_FORMAL_PACKAGE_ITEMS.every(({ required }) => required), true);
  for (const forbidden of ["customer_name", "price", "quote", "credential", "secret", "token"]) assert.equal(serialized.includes(forbidden), false);
  const rebuilt = buildAdvisorFormalEvidencePackageContract({
    contractId: "advisor_package_contract_77777777-7777-4777-8777-777777777777",
    projectId: "advisor_project_44444444-4444-4444-8444-444444444444",
    locale: "en",
    sourceBindings: syntheticFormalPackageSourceBindings,
    frozenAt: "2026-10-23T13:05:00.000Z",
  });
  assert.equal(rebuilt.package_profile.profile_sha256, expectedProfileSha256);
});
