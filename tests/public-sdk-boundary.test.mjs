import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import * as sdk from "../sdk/index.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);

test("public SDK exports exactly the versioned manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../sdk/package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, manifest.sdk_version);
  assert.equal(pkg.private, true);
  assert.deepEqual(Object.keys(sdk).sort(), [...manifest.exports].sort());
});

test("public API manifest includes the versioned CT-DSL package", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/ct-dsl/ct-dsl-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/ct-dsl/index.mjs"));
  assert.ok(manifest.public_tools.includes("packages/ct-dsl/compatibility.mjs"));
  assert.ok(manifest.public_tools.includes("scripts/validate-ct-dsl.mjs"));
});

test("public API manifest includes Connector SDK 1.0", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/connectors/connector-sdk-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/connector-sdk/index.mjs"));
  assert.ok(manifest.exports.includes("createConnectorAdapter"));
  assert.ok(manifest.exports.includes("runConnectorContract"));
  assert.ok(manifest.exports.includes("createVllmConnectorAdapter"));
});

test("public API exposes the CT-556 execution evidence binding without tenant lookup authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/compliance/execution-evidence-binding-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/compliance/evidence-binding.mjs"));
  assert.ok(manifest.public_tools.includes("packages/compliance/evidence-binding.d.ts"));
  for (const symbol of ["EXECUTION_EVIDENCE_BINDING_VERSION", "createExecutionEvidenceBinding", "verifyExecutionEvidenceBinding"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["lookupTenantContext", "issueTenantCredential", "readProductionEvidence"]) assert.equal(Object.hasOwn(sdk, forbidden), false);
});

test("public API exposes the CT-557 data path declaration without legal authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/compliance/data-path-declaration-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/compliance/data-path-declaration.mjs"));
  assert.ok(manifest.public_tools.includes("packages/compliance/data-path-declaration.d.ts"));
  assert.ok(manifest.public_tools.includes("scripts/validate-data-path-declaration.mjs"));
  for (const symbol of ["DATA_PATH_DECLARATION_VERSION", "createDataPathDeclaration", "validateDataPathDeclaration", "verifyDataPathDeclaration"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["approveTransferBasis", "certifyDataPath", "lookupProcessorAgreement"]) assert.equal(Object.hasOwn(sdk, forbidden), false);
});

test("public API exposes the CT-558 audit package without signing or approval authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/compliance/audit-package-manifest-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/compliance/audit-package.mjs"));
  assert.ok(manifest.public_tools.includes("packages/compliance/audit-package.d.ts"));
  assert.ok(manifest.public_tools.includes("scripts/build-audit-package.mjs"));
  assert.ok(manifest.public_tools.includes("scripts/verify-audit-package.mjs"));
  for (const symbol of ["AUDIT_PACKAGE_KINDS", "AUDIT_PACKAGE_VERSION", "createAuditPackage", "renderAuditPackageChecksums", "serializeAuditPackageManifest", "verifyAuditPackage"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["signAuditPackage", "approveAuditPackage", "issueAuditorCredential"]) assert.equal(Object.hasOwn(sdk, forbidden), false);
});

test("public API exposes CT-559 evidence gap detection without verifier or certification authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/compliance/evidence-gap-assessment-v1.schema.json"));
  assert.ok(manifest.public_contracts.includes("specs/compliance/evidence-gap-report-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/compliance/evidence-gap.mjs"));
  assert.ok(manifest.public_tools.includes("packages/compliance/evidence-gap.d.ts"));
  assert.ok(manifest.public_tools.includes("scripts/inspect-evidence-gaps.mjs"));
  for (const symbol of ["EVIDENCE_GAP_REPORT_VERSION", "EVIDENCE_GAP_TYPES", "inspectEvidenceGaps"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["authenticateEvidenceVerifier", "issueComplianceConclusion", "approveEvidencePolicy"]) {
    assert.equal(manifest.exports.includes(forbidden), false);
    assert.equal(Object.hasOwn(sdk, forbidden), false);
  }
});

test("public API exposes CT-561 versioned rule mapping without certification authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  for (const contract of [
    "specs/compliance/compliance-rule-pack-v1.schema.json",
    "specs/compliance/compliance-control-observation-v1.schema.json",
    "specs/compliance/compliance-rule-mapping-report-v1.schema.json"
  ]) assert.ok(manifest.public_contracts.includes(contract));
  for (const tool of ["packages/compliance/rule-pack.mjs", "packages/compliance/rule-pack.d.ts", "scripts/validate-compliance-rule-pack.mjs"]) assert.ok(manifest.public_tools.includes(tool));
  for (const symbol of ["COMPLIANCE_RULE_DOMAINS", "COMPLIANCE_RULE_PACK_VERSION", "createComplianceRulePack", "validateComplianceRulePack", "verifyComplianceRulePackUpgrade", "mapComplianceRulePack"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["certifyRuleMapping", "approveLegalConclusion", "authenticateAssessor"]) {
    assert.equal(manifest.exports.includes(forbidden), false);
    assert.equal(Object.hasOwn(sdk, forbidden), false);
  }
});

test("public API manifest includes Agent protocol SDK 1.0 without credential APIs", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/agent/control-protocol-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/agent-protocol-sdk/index.mjs"));
  assert.ok(manifest.public_tools.includes("packages/agent-protocol-sdk/index.d.ts"));
  for (const symbol of ["createRegistrationMessage", "createPreparePolicyMessage", "createApplyPolicyMessage", "createRevokePolicyMessage", "createAgentReceipt", "verifyAgentReceipt"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["AgentCredentialAuthority", "issueAgentCredential", "connectAgentControlPlane"]) assert.equal(manifest.exports.includes(forbidden), false);
});

test("public API manifest exposes Registry verification without signing authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8"));
  assert.ok(manifest.public_contracts.includes("specs/registry/registry-entry-record-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/registry-entry-integrity/index.mjs"));
  assert.ok(manifest.public_tools.includes("packages/registry-entry-integrity/index.d.ts"));
  assert.ok(manifest.public_tools.includes("scripts/validate-registry-contribution.mjs"));
  assert.ok(manifest.public_tools.includes("scripts/verify-registry-history.mjs"));
  for (const symbol of ["REGISTRY_ENTRY_INTEGRITY_VERSION", "canonicalizeRegistryValue", "digestRegistryArtifact", "verifyRegistryEntryRecord", "verifyRegistryEntryHistory"]) assert.ok(manifest.exports.includes(symbol));
  for (const forbidden of ["createRegistryEntryRecord", "signRegistryEntry", "issueRegistrySigningKey"]) {
    assert.equal(manifest.exports.includes(forbidden), false);
    assert.equal(Object.hasOwn(sdk, forbidden), false);
  }
});

test("public telemetry example is accepted and receives a stable route identity", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/agent/network-telemetry.json", import.meta.url), "utf8"));
  const event = sdk.normalizeNetworkTelemetry(example);
  assert.match(event.route_id, /^route-[a-f0-9]{24}$/);
  assert.equal(event.source, "kernel");
});

test("public SDK example runs without dependencies and keeps synthetic origin explicit", async () => {
  const { stdout } = await exec(process.execPath, ["examples/sdk/validate-public-evidence.mjs"], { cwd: root });
  const output = JSON.parse(stdout);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.performance_claim_allowed, false);
  assert.equal(output.metrics.health, "ready");
});

test("public metric schemas retain evidence boundaries", async () => {
  const telemetry = JSON.parse(await readFile(new URL("../specs/agent/network-telemetry-v1.schema.json", import.meta.url), "utf8"));
  const metrics = JSON.parse(await readFile(new URL("../specs/connectors/vllm-metrics-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(telemetry.additionalProperties, false);
  assert.equal(metrics.additionalProperties, false);
  assert.equal(metrics.properties.evidence.properties.aggregate_only.const, true);
  assert.equal(metrics.properties.evidence.properties.per_request_correlation_allowed.const, false);
});
