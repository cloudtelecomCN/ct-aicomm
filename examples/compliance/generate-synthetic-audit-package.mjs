#!/usr/bin/env node

import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint } from "../../packages/agent-control/protocol.mjs";
import { createDataPathDeclaration } from "../../packages/compliance/data-path-declaration.mjs";
import { buildAuditPackageDirectory } from "../../scripts/build-audit-package.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const EXAMPLE_DIRECTORY = path.dirname(SCRIPT_PATH);
const tenantId = "tenant-synthetic-alpha";
const workloadId = "workload-inference-synthetic";
const executionId = "execution-synthetic-001";

function usage() {
  return "Usage: node examples/compliance/generate-synthetic-audit-package.mjs <empty-source-directory> <empty-package-directory>";
}

async function prepareEmpty(directory) {
  const resolved = path.resolve(directory);
  try {
    const metadata = await lstat(resolved);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error(`${resolved} must be a regular directory`);
    if ((await readdir(resolved)).length !== 0) throw new Error(`${resolved} must be empty`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(resolved, { recursive: true });
  }
  return resolved;
}

function signedRecord(body, field) {
  return { ...body, [field]: fingerprint(body) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error(usage());
  const sourceDirectory = await prepareEmpty(args[0]);
  const originalDeclaration = JSON.parse(await readFile(path.join(EXAMPLE_DIRECTORY, "synthetic-data-path-declaration.json"), "utf8"));
  const execution = JSON.parse(await readFile(path.join(EXAMPLE_DIRECTORY, "synthetic-execution-evidence-binding.json"), "utf8"));
  const declaration = createDataPathDeclaration({
    declarationId: "data-path-audit-synthetic-001",
    tenantId,
    workloadId,
    revision: originalDeclaration.revision,
    dataOrigin: "synthetic",
    dataCategories: originalDeclaration.data_categories,
    orderedRegionIds: originalDeclaration.ordered_region_ids,
    regions: originalDeclaration.regions,
    boundaries: originalDeclaration.boundaries,
    encryption: originalDeclaration.encryption,
    processors: originalDeclaration.processors,
    declaredAt: new Date("2026-10-22T10:00:00.000Z")
  });
  const approval = signedRecord({
    schema_version: "1.0.0",
    approval_id: "approval-synthetic-001",
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId,
    evidence_origin: "synthetic",
    decided_at: "2026-10-22T11:00:00.000Z",
    decision: "approved-for-synthetic-demonstration",
    reviewer_role: "synthetic-reviewer",
    subject_fingerprint: execution.binding_fingerprint,
    note: "Synthetic fixture only; this is not a production authorization."
  }, "approval_fingerprint");
  const rollback = signedRecord({
    schema_version: "1.0.0",
    rollback_id: "rollback-synthetic-001",
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId,
    evidence_origin: "synthetic",
    occurred: true,
    triggered_at: "2026-10-22T11:30:00.000Z",
    trigger: "synthetic-circuit-breaker-exercise",
    from_policy_revision: "8",
    restored_policy_revision: "7",
    verification_status: "synthetic-restored",
    note: "Synthetic fixture only; no production traffic was changed."
  }, "rollback_fingerprint");
  const records = { declaration, approval, execution, rollback };
  await Promise.all(Object.entries(records).map(([name, record]) => writeFile(
    path.join(sourceDirectory, `${name}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  )));
  const descriptor = {
    schema_version: "1.0.0",
    package_id: "audit-package-synthetic-001",
    tenant_id: tenantId,
    workload_id: workloadId,
    execution_id: executionId,
    created_at: "2026-10-22T12:00:00.000Z",
    artifacts: [
      { kind: "declaration", artifact_id: declaration.declaration_id, source: "declaration.json", path: "artifacts/declaration.json", media_type: "application/json", schema_version: declaration.schema_version, fingerprint_field: "declaration_fingerprint", evidence_origin: "synthetic" },
      { kind: "approval", artifact_id: approval.approval_id, source: "approval.json", path: "artifacts/approval.json", media_type: "application/json", schema_version: approval.schema_version, fingerprint_field: "approval_fingerprint", evidence_origin: "synthetic" },
      { kind: "execution", artifact_id: execution.binding_id, source: "execution.json", path: "artifacts/execution.json", media_type: "application/json", schema_version: execution.schema_version, fingerprint_field: "binding_fingerprint", evidence_origin: "synthetic" },
      { kind: "rollback", artifact_id: rollback.rollback_id, source: "rollback.json", path: "artifacts/rollback.json", media_type: "application/json", schema_version: rollback.schema_version, fingerprint_field: "rollback_fingerprint", evidence_origin: "synthetic" }
    ]
  };
  const descriptorPath = path.join(sourceDirectory, "descriptor.json");
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({
    source_directory: sourceDirectory,
    ...await buildAuditPackageDirectory(descriptorPath, args[1]),
    data_origin: "synthetic",
    performance_claim_allowed: false
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ valid: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
