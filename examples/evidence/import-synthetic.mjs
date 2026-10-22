#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import {
  createEvidenceImportLedger,
  importEvidenceBundle,
  verifyEvidenceImportLedger
} from "../../packages/evidence-import/index.mjs";

const root = new URL("./v1/", import.meta.url);
const manifestBytes = await readFile(new URL("manifest.json", root));
const manifest = JSON.parse(manifestBytes);
const checksumsBytes = await readFile(new URL("SHA256SUMS", root));
const names = (await readdir(root)).filter((name) => name.endsWith(".json") && name !== "manifest.json").sort();
const files = await Promise.all(names.map(async (path) => ({ path, bytes: await readFile(new URL(path, root)) })));

const base = {
  attemptId: "attempt-synthetic-import-001",
  idempotencyKey: "import-synthetic-evidence-001",
  tenantId: manifest.evidence_ref.tenant_id,
  sourceId: "source-offline-synthetic-fixture",
  receivedAt: "2026-10-23T00:01:00.000Z",
  expectedManifestFingerprint: manifest.manifest_fingerprint,
  manifestBytes,
  checksumsBytes,
  files
};

const committed = importEvidenceBundle(createEvidenceImportLedger({ tenantId: base.tenantId }), base);
const exactRetry = importEvidenceBundle(committed.ledger, base);
const replayed = importEvidenceBundle(committed.ledger, {
  ...base,
  attemptId: "attempt-synthetic-import-002",
  idempotencyKey: "import-synthetic-evidence-002"
});
const rejected = importEvidenceBundle(replayed.ledger, {
  ...base,
  attemptId: "attempt-synthetic-import-003",
  expectedManifestFingerprint: `sha256:${"0".repeat(64)}`
});
const verified = verifyEvidenceImportLedger(rejected.ledger);

console.log(JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  committed_outcome: committed.record.outcome,
  exact_retry_idempotent: exactRetry.idempotent_replay,
  same_content_outcome: replayed.record.outcome,
  stored_object_count: verified.stored_object_count,
  attempt_count: verified.attempt_count,
  different_request_same_key_outcome: rejected.record.outcome,
  failed_attempt_recorded: rejected.record.errors.some(({ code }) => code === "evidence_import_idempotency_conflict"),
  append_only_chain_verified: verified.append_only_chain_verified,
  authenticity_verified: false,
  authorization_verified: false,
  certification_issued: false
}, null, 2));
