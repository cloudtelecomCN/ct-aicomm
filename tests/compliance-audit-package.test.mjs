import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  AUDIT_PACKAGE_KINDS,
  AUDIT_PACKAGE_VERSION,
  createAuditPackage,
  verifyAuditPackage
} from "../packages/compliance/audit-package.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const packageUrl = new URL("../examples/compliance/synthetic-audit-package/", import.meta.url);
const sourceUrl = new URL("../examples/compliance/synthetic-audit-package-source/", import.meta.url);
const context = {
  tenant_id: "tenant-synthetic-alpha",
  workload_id: "workload-inference-synthetic",
  execution_id: "execution-synthetic-001"
};

async function packageInput() {
  const manifestBytes = await readFile(new URL("manifest.json", packageUrl));
  const manifest = JSON.parse(manifestBytes);
  return {
    manifestBytes,
    checksumsBytes: await readFile(new URL("SHA256SUMS", packageUrl)),
    files: await Promise.all(manifest.artifacts.map(async ({ path: relativePath }) => ({
      path: relativePath,
      bytes: await readFile(new URL(relativePath, packageUrl))
    })))
  };
}

async function artifactInputs() {
  const descriptor = JSON.parse(await readFile(new URL("descriptor.json", sourceUrl), "utf8"));
  return Promise.all(descriptor.artifacts.map(async (artifact) => ({
    kind: artifact.kind,
    artifactId: artifact.artifact_id,
    path: artifact.path,
    mediaType: artifact.media_type,
    schemaVersion: artifact.schema_version,
    fingerprintField: artifact.fingerprint_field,
    evidenceOrigin: artifact.evidence_origin,
    content: await readFile(new URL(artifact.source, sourceUrl))
  })));
}

test("builds and verifies the closed declaration, approval, execution, and rollback set", async () => {
  assert.deepEqual(AUDIT_PACKAGE_KINDS, ["declaration", "approval", "execution", "rollback"]);
  const input = await packageInput();
  const result = verifyAuditPackage({ ...input, expectedContext: context });
  assert.deepEqual(result, {
    valid: true,
    integrity_verified: true,
    context_verified: true,
    package_id: "audit-package-synthetic-001",
    ...context,
    evidence_origin: "synthetic",
    artifact_count: 4,
    package_fingerprint: "sha256:b31cf03d1383a717b89a62d0eaf96c65629f4e5b90ca806fe2009bf0b4828564",
    authenticity_verified: false,
    authorization_verified: false,
    legal_or_certification_conclusion: false
  });
});

test("rebuilds the checked-in package deterministically with the public CLI", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ct-audit-build-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, "package");
  const { stdout } = await exec(process.execPath, [
    "scripts/build-audit-package.mjs",
    "examples/compliance/synthetic-audit-package-source/descriptor.json",
    output
  ], { cwd: root });
  const result = JSON.parse(stdout);
  assert.equal(result.valid, true);
  assert.equal(result.authenticity_verified, false);
  for (const relativePath of ["manifest.json", "SHA256SUMS", "artifacts/declaration.json", "artifacts/approval.json", "artifacts/execution.json", "artifacts/rollback.json"]) {
    assert.deepEqual(await readFile(path.join(output, ...relativePath.split("/"))), await readFile(new URL(relativePath, packageUrl)));
  }
});

test("rejects changed artifact bytes, changed manifests, missing files, and untracked files", async () => {
  const changedArtifact = await packageInput();
  const execution = changedArtifact.files.find(({ path: relativePath }) => relativePath === "artifacts/execution.json");
  execution.bytes = Buffer.from(execution.bytes.toString("utf8").replace("synthetic", "synthetix"));
  assert.throws(() => verifyAuditPackage(changedArtifact), (error) => error.code === "audit_artifact_checksum_mismatch");

  const changedManifest = await packageInput();
  const manifest = JSON.parse(changedManifest.manifestBytes);
  manifest.package_id = "audit-package-synthetic-002";
  changedManifest.manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => verifyAuditPackage(changedManifest), (error) => error.code === "audit_manifest_tampered");

  const missing = await packageInput();
  missing.files.pop();
  assert.throws(() => verifyAuditPackage(missing), (error) => error.code === "audit_file_set_mismatch");

  const extra = await packageInput();
  extra.files.push({ path: "artifacts/untracked.json", bytes: Buffer.from("{}\n") });
  assert.throws(() => verifyAuditPackage(extra), (error) => error.code === "audit_file_set_mismatch");
});

test("rejects unsafe paths, duplicate paths, incomplete kinds, and changed source fingerprints", async () => {
  const artifacts = await artifactInputs();
  assert.throws(() => createAuditPackage({
    packageId: "package-invalid-path",
    tenantId: context.tenant_id,
    workloadId: context.workload_id,
    executionId: context.execution_id,
    createdAt: new Date("2026-10-22T12:00:00.000Z"),
    artifacts: artifacts.map((artifact, index) => index === 0 ? { ...artifact, path: "../declaration.json" } : artifact)
  }), (error) => error.code === "artifact_0_path_invalid");

  assert.throws(() => createAuditPackage({
    packageId: "package-duplicate-path",
    tenantId: context.tenant_id,
    workloadId: context.workload_id,
    executionId: context.execution_id,
    createdAt: new Date("2026-10-22T12:00:00.000Z"),
    artifacts: artifacts.map((artifact, index) => index === 1 ? { ...artifact, path: artifacts[0].path } : artifact)
  }), (error) => error.code === "audit_artifact_path_duplicate");

  assert.throws(() => createAuditPackage({
    packageId: "package-incomplete",
    tenantId: context.tenant_id,
    workloadId: context.workload_id,
    executionId: context.execution_id,
    artifacts: artifacts.slice(0, 3)
  }), (error) => error.code === "audit_artifact_set_incomplete");

  const changedApproval = structuredClone(artifacts[1]);
  const approval = JSON.parse(Buffer.from(changedApproval.content).toString("utf8"));
  approval.decision = "changed-without-new-fingerprint";
  changedApproval.content = `${JSON.stringify(approval, null, 2)}\n`;
  assert.throws(() => createAuditPackage({
    packageId: "package-source-mismatch",
    tenantId: context.tenant_id,
    workloadId: context.workload_id,
    executionId: context.execution_id,
    artifacts: [artifacts[0], changedApproval, artifacts[2], artifacts[3]]
  }), (error) => error.code === "audit_approval_source_fingerprint_mismatch");
});

test("requires caller-supplied context to match all three package dimensions", async () => {
  const input = await packageInput();
  assert.equal(verifyAuditPackage(input).context_verified, false);
  assert.throws(() => verifyAuditPackage({ ...input, expectedContext: { ...context, tenant_id: "tenant-other" } }), (error) => error.code === "audit_tenant_mismatch");
  assert.throws(() => verifyAuditPackage({ ...input, expectedContext: { ...context, workload_id: "workload-other" } }), (error) => error.code === "audit_workload_mismatch");
  assert.throws(() => verifyAuditPackage({ ...input, expectedContext: { ...context, execution_id: "execution-other" } }), (error) => error.code === "audit_execution_mismatch");
});

test("verifier CLI rejects unexpected package-root content and preserves evidence boundaries", async (t) => {
  const { stdout } = await exec(process.execPath, [
    "scripts/verify-audit-package.mjs",
    "examples/compliance/synthetic-audit-package",
    "--tenant", context.tenant_id,
    "--workload", context.workload_id,
    "--execution", context.execution_id
  ], { cwd: root });
  const result = JSON.parse(stdout);
  assert.equal(result.integrity_verified, true);
  assert.equal(result.context_verified, true);
  assert.equal(result.evidence_origin, "synthetic");
  assert.equal(result.authenticity_verified, false);
  assert.equal(result.authorization_verified, false);
  assert.equal(result.legal_or_certification_conclusion, false);

  const temporary = await mkdtemp(path.join(os.tmpdir(), "ct-audit-verify-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await cp(new URL(".", packageUrl), temporary, { recursive: true });
  await writeFile(path.join(temporary, "unexpected.txt"), "untracked\n");
  await assert.rejects(exec(process.execPath, ["scripts/verify-audit-package.mjs", temporary], { cwd: root }), /exactly manifest\.json, SHA256SUMS, and artifacts/);
});

test("publishes a closed schema with fixed artifact order and fingerprint vocabularies", async () => {
  const schema = JSON.parse(await readFile(new URL("../specs/compliance/audit-package-manifest-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, AUDIT_PACKAGE_VERSION);
  assert.equal(schema.properties.artifacts.minItems, 4);
  assert.equal(schema.properties.artifacts.maxItems, 4);
  assert.deepEqual(schema.properties.artifacts.prefixItems.map((entry) => entry.$ref), [
    "#/$defs/declaration",
    "#/$defs/approval",
    "#/$defs/execution",
    "#/$defs/rollback"
  ]);
  assert.equal(schema.$defs.descriptor.additionalProperties, false);
  assert.deepEqual(schema.$defs.rollback.allOf[1].properties.fingerprint_field, { const: "rollback_fingerprint" });
});

test("checked-in package contains no hidden or extra artifacts", async () => {
  assert.deepEqual((await readdir(packageUrl)).sort(), ["SHA256SUMS", "artifacts", "manifest.json"]);
  assert.deepEqual((await readdir(new URL("artifacts/", packageUrl))).sort(), ["approval.json", "declaration.json", "execution.json", "rollback.json"]);
});
