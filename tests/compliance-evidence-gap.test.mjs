import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  EVIDENCE_GAP_REPORT_VERSION,
  EVIDENCE_GAP_TYPES,
  inspectEvidenceGaps
} from "../packages/compliance/evidence-gap.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const fixtureUrl = new URL("../examples/compliance/synthetic-evidence-gap-assessment.json", import.meta.url);
const reportUrl = new URL("../examples/compliance/synthetic-evidence-gap-report.json", import.meta.url);
const evaluatedAt = new Date("2026-10-22T12:00:00.000Z");
const trustedVerifierIds = ["synthetic-verifier-v1"];

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

function options(input, overrides = {}) {
  return {
    expectedContext: input.subject,
    evaluatedAt,
    trustedVerifierIds,
    ...overrides
  };
}

function verification(evidenceId, signerRole, suffix) {
  return {
    verification_id: `verify-${suffix}`,
    evidence_id: evidenceId,
    status: "verified",
    signer_id: `synthetic-${suffix}`,
    signer_role: signerRole,
    key_id: `synthetic-key-${suffix}`,
    verifier_id: "synthetic-verifier-v1",
    verified_at: "2026-10-22T11:55:00.000Z",
    signature_fingerprint: `sha256:${suffix === "execution" ? "9".repeat(64) : "a".repeat(64)}`
  };
}

async function satisfiedFixture() {
  const input = await fixture();
  input.evidence = input.evidence.filter(({ evidence_id: id }) => id !== "approval-synthetic-b");
  input.signature_verifications = input.signature_verifications.filter(({ evidence_id: id }) => id !== "approval-synthetic-b");
  input.evidence.find(({ requirement_id: id }) => id === "data-path-declaration").observed_at = "2026-10-22T11:30:00.000Z";
  input.signature_verifications.find(({ evidence_id: id }) => id === "declaration-synthetic-stale").verified_at = "2026-10-22T11:31:00.000Z";
  input.evidence.push({
    evidence_id: "rollback-synthetic-complete",
    requirement_id: "rollback-record",
    evidence_kind: "rollback",
    subject: structuredClone(input.subject),
    observed_at: "2026-10-22T11:45:00.000Z",
    claim_fingerprint: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    content_fingerprint: "sha256:6444444444444444444444444444444444444444444444444444444444444444",
    evidence_origin: "synthetic"
  });
  input.signature_verifications.push(
    verification("execution-synthetic-unsigned", "runtime-attestor", "execution"),
    verification("rollback-synthetic-complete", "operations-reviewer", "rollback")
  );
  return input;
}

test("detects missing, stale, conflicting, and unsigned evidence with fail-closed status", async () => {
  const input = await fixture();
  const report = inspectEvidenceGaps(input, options(input));
  assert.equal(EVIDENCE_GAP_REPORT_VERSION, "1.0.0");
  assert.deepEqual(EVIDENCE_GAP_TYPES, ["missing", "stale", "conflicting", "unsigned"]);
  assert.equal(report.default_deny, true);
  assert.equal(report.status, "not_satisfied");
  assert.equal(report.requirements_satisfied, false);
  assert.equal(report.gap_count, 4);
  assert.deepEqual(report.gaps.map(({ type }) => type), EVIDENCE_GAP_TYPES);
  assert.deepEqual(report.summary, {
    requirement_count: 4,
    submitted_evidence_count: 4,
    fresh_evidence_count: 3,
    stale_evidence_count: 1,
    signature_sufficient_evidence_count: 3,
    signature_deficient_evidence_count: 1,
    conflicting_requirement_count: 1
  });
  assert.equal(report.authorization_verified, false);
  assert.equal(report.legal_or_certification_conclusion, false);
  assert.match(report.report_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("matches the checked-in deterministic synthetic report", async () => {
  const input = await fixture();
  const expected = JSON.parse(await readFile(reportUrl, "utf8"));
  assert.deepEqual(inspectEvidenceGaps(input, options(input)), expected);
});

test("emits requirements_satisfied only when every declared gate passes", async () => {
  const input = await satisfiedFixture();
  const report = inspectEvidenceGaps(input, options(input));
  assert.equal(report.status, "requirements_satisfied");
  assert.equal(report.requirements_satisfied, true);
  assert.equal(report.gap_count, 0);
  assert.deepEqual(report.gaps, []);
  assert.equal(report.summary.fresh_evidence_count, 4);
  assert.equal(report.summary.signature_sufficient_evidence_count, 4);
  assert.equal(report.authorization_verified, false);
  assert.equal(report.legal_or_certification_conclusion, false);
});

test("does not trust verification receipts unless the caller names their verifier", async () => {
  const input = await satisfiedFixture();
  const report = inspectEvidenceGaps(input, options(input, { trustedVerifierIds: [] }));
  assert.equal(report.status, "not_satisfied");
  assert.equal(report.gap_count, 4);
  assert.ok(report.gaps.every(({ type }) => type === "unsigned"));
  assert.ok(report.gaps.every(({ accepted_verified_signatures: count }) => count === 0));
});

test("rejects cross-context evidence, future observations, unknown requirements, and kind mismatches", async () => {
  const crossContext = await fixture();
  crossContext.evidence[0].subject.tenant_id = "tenant-other";
  assert.throws(() => inspectEvidenceGaps(crossContext, options(crossContext, { expectedContext: {
    tenant_id: "tenant-synthetic-alpha",
    workload_id: "workload-inference-synthetic",
    execution_id: "execution-synthetic-001"
  } })), (error) => error.code === "evidence_declaration-synthetic-stale_tenant_mismatch");

  const future = await fixture();
  future.evidence[0].observed_at = "2026-10-22T12:00:00.001Z";
  assert.throws(() => inspectEvidenceGaps(future, options(future)), (error) => error.code === "evidence_observed_in_future");

  const unknown = await fixture();
  unknown.evidence[0].requirement_id = "unknown-requirement";
  assert.throws(() => inspectEvidenceGaps(unknown, options(unknown)), (error) => error.code === "evidence_requirement_unknown");

  const mismatched = await fixture();
  mismatched.evidence[0].evidence_kind = "approval";
  assert.throws(() => inspectEvidenceGaps(mismatched, options(mismatched)), (error) => error.code === "evidence_kind_mismatch");
});

test("rejects duplicate evidence, verification identities, and malformed caller options", async () => {
  const duplicateEvidence = await fixture();
  duplicateEvidence.evidence.push(structuredClone(duplicateEvidence.evidence[0]));
  assert.throws(() => inspectEvidenceGaps(duplicateEvidence, options(duplicateEvidence)), (error) => error.code === "evidence_id_duplicate");

  const duplicateVerification = await fixture();
  duplicateVerification.signature_verifications.push({
    ...structuredClone(duplicateVerification.signature_verifications[0]),
    verification_id: "different-verification-id"
  });
  assert.throws(() => inspectEvidenceGaps(duplicateVerification, options(duplicateVerification)), (error) => error.code === "signature_verification_duplicate");

  const input = await fixture();
  assert.throws(() => inspectEvidenceGaps(input, {
    expectedContext: input.subject,
    evaluatedAt,
    trustedVerifierIds,
    unexpected: true
  }), (error) => error.code === "evidence_inspection_options_field_unknown");
});

test("uses stable ordering and fingerprints regardless of input array order", async () => {
  const input = await fixture();
  const expected = inspectEvidenceGaps(input, options(input));
  input.policy.requirements.reverse();
  input.evidence.reverse();
  input.signature_verifications.reverse();
  const actual = inspectEvidenceGaps(input, options(input, { trustedVerifierIds: [...trustedVerifierIds].reverse() }));
  assert.deepEqual(actual, expected);
});

test("keeps the freshness boundary inclusive and rejects late or wrong-role verification", async () => {
  const input = await satisfiedFixture();
  const declaration = input.evidence.find(({ requirement_id: id }) => id === "data-path-declaration");
  declaration.observed_at = "2026-10-22T11:00:00.000Z";
  const declarationVerification = input.signature_verifications.find(({ evidence_id: id }) => id === declaration.evidence_id);
  declarationVerification.verified_at = "2026-10-22T11:01:00.000Z";
  assert.equal(inspectEvidenceGaps(input, options(input)).requirements_satisfied, true);

  declarationVerification.signer_role = "untrusted-role";
  let report = inspectEvidenceGaps(input, options(input));
  assert.ok(report.gaps.some(({ type, evidence_ids: ids }) => type === "unsigned" && ids.includes(declaration.evidence_id)));

  declarationVerification.signer_role = "data-owner";
  declarationVerification.verified_at = "2026-10-22T12:00:00.001Z";
  report = inspectEvidenceGaps(input, options(input));
  assert.ok(report.gaps.some(({ type, evidence_ids: ids }) => type === "unsigned" && ids.includes(declaration.evidence_id)));
});

test("CLI prints the report and exits nonzero when gaps remain", async () => {
  await assert.rejects(exec(process.execPath, [
    "scripts/inspect-evidence-gaps.mjs",
    "examples/compliance/synthetic-evidence-gap-assessment.json",
    "--tenant", "tenant-synthetic-alpha",
    "--workload", "workload-inference-synthetic",
    "--execution", "execution-synthetic-001",
    "--at", "2026-10-22T12:00:00.000Z",
    "--trusted-verifier", "synthetic-verifier-v1"
  ], { cwd: root }), (error) => {
    assert.equal(error.code, 2);
    const report = JSON.parse(error.stdout);
    assert.equal(report.status, "not_satisfied");
    assert.equal(report.default_deny, true);
    assert.equal(report.gap_count, 4);
    return true;
  });
});

test("publishes closed input and output schemas for the four gap types", async () => {
  const inputSchema = JSON.parse(await readFile(new URL("../specs/compliance/evidence-gap-assessment-v1.schema.json", import.meta.url), "utf8"));
  const reportSchema = JSON.parse(await readFile(new URL("../specs/compliance/evidence-gap-report-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(inputSchema.additionalProperties, false);
  assert.equal(inputSchema.properties.schema_version.const, EVIDENCE_GAP_REPORT_VERSION);
  assert.equal(inputSchema.$defs.requirement.properties.minimum_verified_signatures.minimum, 1);
  assert.equal(reportSchema.additionalProperties, false);
  assert.equal(reportSchema.properties.default_deny.const, true);
  assert.equal(reportSchema.properties.authorization_verified.const, false);
  assert.equal(reportSchema.properties.legal_or_certification_conclusion.const, false);
  assert.deepEqual(reportSchema.properties.status.enum, ["requirements_satisfied", "not_satisfied"]);
  assert.equal(reportSchema.properties.gaps.items.oneOf.length, 4);
});
