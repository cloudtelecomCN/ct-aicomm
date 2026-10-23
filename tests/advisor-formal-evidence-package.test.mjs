import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdvisorFormalEvidencePackageArchive,
  computeAdvisorFormalPackageDigest,
  verifyAdvisorFormalEvidencePackage,
} from "../packages/advisor/formal-evidence-package.mjs";
import { createDeterministicZip, readDeterministicZip } from "../packages/advisor/deterministic-zip.mjs";
import { ADVISOR_FORMAL_PACKAGE_ITEMS } from "../packages/advisor/formal-evidence-package-contract.mjs";

const PACKAGE_ID = "advisor_evidence_package_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT_ID = "advisor_package_contract_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREATED_AT = "2026-10-24T08:00:00.000Z";
const encoder = new TextEncoder();

function bytes(value) {
  return value instanceof Uint8Array ? value : encoder.encode(value);
}

function sha256(value) {
  return computeAdvisorFormalPackageDigest(bytes(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function checksumText(files) {
  return `${files.slice().sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map((file) => `${sha256(file.bytes).slice(7)}  ${file.path}`).join("\n")}\n`;
}

function exitArchive() {
  const payloads = [
    { path: "README.md", bytes: bytes("# Complete exit package\n\nSynthetic fixture; no performance claim.\n") },
    { path: "raw/basic-report.json", bytes: bytes('{"data_origin":"synthetic"}\n') },
    { path: "transformed/formal-report.json", bytes: bytes('{"state":"issued"}\n') },
  ];
  return createDeterministicZip([...payloads, { path: "SHA256SUMS", bytes: bytes(checksumText(payloads)) }]);
}

const MEDIA = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  txt: "text/plain",
  markdown: "text/markdown",
};

function file(path, format, content) {
  const contentBytes = bytes(content);
  return { path, format, media_type: MEDIA[format], bytes: contentBytes.byteLength, sha256: sha256(contentBytes), contentBytes };
}

function fixture(state = "issued") {
  const payloadFiles = [
    file("D01/scope-and-responsibility-boundary.docx", "docx", "synthetic-docx-D01"),
    file("D02/requirement-passport.json", "json", '{"data_origin":"synthetic"}\n'),
    file("D03/candidate-and-combination-matrix.csv", "csv", "candidate,status\nsynthetic,eligible\n"),
    file("D03/candidate-and-combination-matrix.json", "json", '{"data_origin":"synthetic"}\n'),
    file("D04/source-ledger-and-gap-register.json", "json", '{"data_origin":"synthetic","gaps":[]}\n'),
    file("D05/infrastructure-risk-analysis.json", "json", '{"data_origin":"synthetic"}\n'),
    file("D06/scenario-pareto-sensitivity-results.csv", "csv", "scenario,result\nsynthetic,unknown\n"),
    file("D06/scenario-pareto-sensitivity-results.json", "json", '{"data_origin":"synthetic"}\n'),
    file("D07/gpu-decision-report.docx", "docx", "synthetic-docx-D07"),
    file("D08/explainable-recommendation.json", "json", '{"recommendation":"read-only","data_origin":"synthetic"}\n'),
    file("D09/decision-and-approval-record.json", "json", '{"human_decision":"accepted","data_origin":"synthetic"}\n'),
    file("D12/complete-exit-package.zip", "zip", exitArchive()),
    file("D13/product-manual.md", "markdown", "# Product manual\n\nOffline synthetic fixture.\n"),
  ];
  const covered = payloadFiles.map(({ path, bytes: byteLength, sha256: digestValue }) => ({ path, bytes: byteLength, sha256: digestValue }));
  const preflight = {
    schema_version: "1.0.0",
    verification_type: "ct_advisor_package_preflight",
    package_id: PACKAGE_ID,
    verified_at: CREATED_AT,
    scope: "payload_files_excluding_D10_D11_manifest_checksums_and_outer_archive",
    covered_file_count: covered.length,
    covered_files_sha256: computeAdvisorFormalPackageDigest(canonicalJson(covered)),
    checks_passed: true,
    limitations: ["This preflight does not verify its own bytes.", "The outer ZIP is verified by the public offline verifier."],
  };
  payloadFiles.splice(11, 0,
    file("D11/offline-preflight.json", "json", `${JSON.stringify(canonical(preflight), null, 2)}\n`),
    file("D11/offline-preflight.txt", "txt", "Preflight passed. Final archive verification remains external.\n"));

  const deliveryItems = ADVISOR_FORMAL_PACKAGE_ITEMS.map((item) => {
    if (item.item_id === "D10") return { item_id: "D10", artifact_key: item.artifact_key, delivery_status: "aggregate", files: [], container_semantics: "this_manifest_describes_the_archive_the_archive_digest_is_an_external_sidecar" };
    return {
      item_id: item.item_id,
      artifact_key: item.artifact_key,
      delivery_status: "included",
      files: payloadFiles.filter(({ path }) => path.startsWith(`${item.item_id}/`)).map(({ contentBytes, ...descriptor }) => descriptor),
    };
  });
  const manifest = {
    schema_version: "1.0.0",
    manifest_type: "ct_advisor_gpu_decision_evidence_package_manifest",
    profile_id: "ct-advisor-gpu-decision-evidence-package/v1",
    profile_version: "1.0.0",
    package_id: PACKAGE_ID,
    package_revision: 1,
    contract_id: CONTRACT_ID,
    capability_key: "gpu_preprocurement_decision_evidence_package",
    locale: "en",
    state,
    created_at: CREATED_AT,
    source_bindings: {
      basic_report: { report_id: "advisor_basic_report_cccccccc-cccc-4ccc-8ccc-cccccccccccc", content_sha256: `sha256:${"1".repeat(64)}` },
      requirement_passport: { passport_id: "advisor_passport_dddddddd-dddd-4ddd-8ddd-dddddddddddd", revision: 1, content_sha256: `sha256:${"2".repeat(64)}` },
      constraint_evaluation: { evaluation_id: "advisor_constraint_evaluation_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", content_sha256: `sha256:${"3".repeat(64)}` },
      analysis: { analysis_id: "advisor_analysis_ffffffff-ffff-4fff-8fff-ffffffffffff", content_sha256: `sha256:${"4".repeat(64)}`, method_sha256: `sha256:${"5".repeat(64)}`, observation_set_sha256: `sha256:${"6".repeat(64)}` },
    },
    delivery_items: deliveryItems,
    checksum_manifest: { path: "SHA256SUMS", algorithm: "SHA-256", covers_exact_delivered_bytes: true, archive_digest_sidecar_required: true },
    compatibility: { policy_id: "ct-advisor-evidence-package-strict-semver-v1", minimum_verifier_version: "1.0.0", unknown_field_policy: "reject" },
    boundaries: { execution_authorized: false, certification_issued: false, legal_opinion_issued: false, performance_claim_allowed: false },
    content_sha256: null,
  };
  manifest.content_sha256 = computeAdvisorFormalPackageDigest({ ...manifest, content_sha256: null });
  const archive = createAdvisorFormalEvidencePackageArchive({
    manifest,
    files: payloadFiles.map(({ path, contentBytes }) => ({ path, bytes: contentBytes })),
  });
  return { manifest, payloadFiles, ...archive };
}

function verify(input) {
  return verifyAdvisorFormalEvidencePackage({
    archiveBytes: input.archiveBytes,
    archiveName: input.archiveName,
    archiveDigestSidecar: input.archiveDigestSidecar,
    expectedPackageId: PACKAGE_ID,
    expectedContractId: CONTRACT_ID,
  });
}

test("CT-668 verifies a deterministic D01-D13 Evidence Package and its exit archive", () => {
  const first = fixture();
  const second = fixture();
  assert.deepEqual(first.archiveBytes, second.archiveBytes);
  const result = verify(first);
  assert.equal(result.integrity_verified, true);
  assert.equal(result.artifact_item_count, 13);
  assert.equal(result.declared_package_state, "issued");
  assert.equal(result.revocation_status, "snapshot_only_not_live_checked");
  assert.equal(result.authenticity_verified, false);
  assert.equal(result.entitlement_verified, false);
  assert.equal(result.live_revocation_checked, false);
  assert.equal(result.execution_authorized, false);
  assert.ok(result.payload_file_count >= 15);
});

test("CT-668 reports a packaged revoked state without claiming a live revocation lookup", () => {
  const revoked = fixture("revoked");
  const result = verify(revoked);
  assert.equal(result.declared_package_state, "revoked");
  assert.equal(result.revocation_status, "revoked_as_packaged");
  assert.equal(result.live_revocation_checked, false);
});

test("CT-668 rejects byte tampering, extra files, missing files, and a wrong archive sidecar", () => {
  const original = fixture();
  const tampered = Uint8Array.from(original.archiveBytes);
  tampered[40] ^= 0xff;
  assert.throws(() => verify({ ...original, archiveBytes: tampered, archiveDigestSidecar: `${sha256(tampered).slice(7)}  ${original.archiveName}\n` }), { code: /zip_crc_mismatch|zip_path_utf8_invalid|zip_path_invalid/ });

  const entries = readDeterministicZip(original.archiveBytes);
  const extraBytes = createDeterministicZip([...entries.map(({ path, bytes: entryBytes }) => ({ path, bytes: entryBytes })), { path: "untracked.txt", bytes: "untracked" }]);
  assert.throws(() => verify({ ...original, archiveBytes: extraBytes, archiveDigestSidecar: `${sha256(extraBytes).slice(7)}  ${original.archiveName}\n` }), { code: "advisor_package_file_set_mismatch" });

  const missingEntries = entries.filter(({ path }) => path !== "D13/product-manual.md");
  const missingBytes = createDeterministicZip(missingEntries.map(({ path, bytes: entryBytes }) => ({ path, bytes: entryBytes })));
  assert.throws(() => verify({ ...original, archiveBytes: missingBytes, archiveDigestSidecar: `${sha256(missingBytes).slice(7)}  ${original.archiveName}\n` }), { code: "advisor_package_file_set_mismatch" });
  assert.throws(() => verify({ ...original, archiveDigestSidecar: `${"0".repeat(64)}  ${original.archiveName}\n` }), { code: "advisor_package_archive_sidecar_mismatch" });
});

test("deterministic ZIP rejects duplicate names and path traversal", () => {
  assert.throws(() => createDeterministicZip([{ path: "a.txt", bytes: "a" }, { path: "a.txt", bytes: "b" }]), { code: "zip_path_duplicate" });
  const duplicate = createDeterministicZip([{ path: "a/file.txt", bytes: "a" }, { path: "b/file.txt", bytes: "b" }]);
  const duplicateText = new TextDecoder("latin1").decode(duplicate).replaceAll("b/file.txt", "a/file.txt");
  const duplicateBytes = Uint8Array.from(duplicateText, (character) => character.charCodeAt(0));
  assert.throws(() => readDeterministicZip(duplicateBytes), { code: "zip_path_duplicate" });

  const traversal = createDeterministicZip([{ path: "safe/file", bytes: "x" }]);
  const traversalText = new TextDecoder("latin1").decode(traversal).replaceAll("safe/file", "../x/file");
  const traversalBytes = Uint8Array.from(traversalText, (character) => character.charCodeAt(0));
  assert.throws(() => readDeterministicZip(traversalBytes), { code: "zip_path_invalid" });
});
