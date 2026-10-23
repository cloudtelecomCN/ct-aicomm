import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  advisorBasicReportCsvRows,
  advisorBasicReportExportFingerprints,
  buildAdvisorBasicReport,
  renderAdvisorBasicReportCsv,
  renderAdvisorBasicReportJson,
  validateAdvisorBasicReport,
  verifyAdvisorBasicReportPdf,
} from "../packages/advisor/basic-report.mjs";
import { createFixedAdvisorAnalysisFixture } from "../examples/advisor/basic-report-fixture.mjs";

const expected = async () => JSON.parse(await readFile(new URL("../examples/advisor/basic-report-fixed-expected-v1.json", import.meta.url), "utf8"));

async function fixedReport(locale = "en") {
  return buildAdvisorBasicReport({
    reportId: "advisor_basic_report_55555555-5555-4555-8555-555555555555",
    ...(await createFixedAdvisorAnalysisFixture()),
    locale,
    generatedAt: "2026-10-23T12:30:00.000Z",
  });
}

test("builds a complete free report with deterministic JSON and long-form CSV", async () => {
  const report = await fixedReport();
  const fixture = await expected();
  const exports = advisorBasicReportExportFingerprints(report);
  assert.equal(report.content_sha256, fixture.content_sha256);
  assert.equal(report.source_bindings.analysis.content_sha256, fixture.analysis_sha256);
  assert.equal(report.source_bindings.analysis.observation_set_sha256, fixture.observation_set_sha256);
  assert.equal(report.executive_summary.eligible_candidate_count, fixture.candidate_count);
  assert.equal(report.executive_summary.scenario_leaders.length, fixture.scenario_count);
  assert.equal(report.source_ledger.reduce((total, candidate) => total + candidate.metrics.length, 0), fixture.source_observation_count);
  assert.equal(report.executive_summary.primary_candidate_id, fixture.primary_candidate_id);
  assert.deepEqual(exports, { json_sha256: fixture.json_sha256, csv_sha256: fixture.csv_sha256, csv_row_count: fixture.csv_row_count });
  assert.match(renderAdvisorBasicReportJson(report), /"formal_procurement_evidence": false/);
  assert.match(renderAdvisorBasicReportCsv(report), /source_observation/);
  assert.equal(advisorBasicReportCsvRows(report).some((row) => row.record_type === "metric_contribution"), true);
  assert.deepEqual(validateAdvisorBasicReport(report), { valid: true, digest_verified: true, status: "complete", content_sha256: fixture.content_sha256 });
});

test("normalizes caller ordering before binding source observations", async () => {
  const input = await createFixedAdvisorAnalysisFixture();
  input.observations.reverse();
  input.observations.forEach((candidate) => candidate.metrics.reverse());
  const report = buildAdvisorBasicReport({ reportId: "advisor_basic_report_55555555-5555-4555-8555-555555555555", ...input, locale: "en", generatedAt: "2026-10-23T12:30:00.000Z" });
  assert.equal(report.content_sha256, (await expected()).content_sha256);
});

test("keeps Chinese and English reports localized while preserving analytical facts", async () => {
  const english = await fixedReport("en");
  const chinese = await fixedReport("zh-CN");
  assert.notEqual(chinese.content_sha256, english.content_sha256);
  assert.match(chinese.title, /基础报告/);
  assert.deepEqual(chinese.analysis, english.analysis);
  assert.deepEqual(chinese.source_ledger, english.source_ledger);
  assert.equal(chinese.boundaries.paid_capability_required, false);
});

test("rejects source, boundary, and report-content tampering", async () => {
  const report = await fixedReport();
  const sourceTamper = structuredClone(report);
  sourceTamper.source_ledger[0].metrics[0].value += 1;
  assert.throws(() => validateAdvisorBasicReport(sourceTamper), (error) => error.code === "basic_report_observations_digest_mismatch");
  const boundaryTamper = structuredClone(report);
  boundaryTamper.boundaries.formal_procurement_evidence = true;
  assert.throws(() => validateAdvisorBasicReport(boundaryTamper), (error) => error.code === "basic_report_boundary_invalid");
  const contentTamper = structuredClone(report);
  contentTamper.title = "Altered";
  assert.throws(() => validateAdvisorBasicReport(contentTamper), (error) => error.code === "basic_report_digest_mismatch");
});

test("verifies the report digest marker in a generated PDF", async () => {
  const report = await fixedReport();
  const marker = `CT-Advisor Basic Report ${report.content_sha256}`;
  const pdf = new TextEncoder().encode(`%PDF-1.7\n1 0 obj\n<< /Subject (${marker}) >>\nendobj\n%%EOF`);
  assert.deepEqual(verifyAdvisorBasicReportPdf(pdf, report), { valid: true, content_sha256: report.content_sha256 });
  const altered = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  assert.throws(() => verifyAdvisorBasicReportPdf(altered, report), (error) => error.code === "basic_report_pdf_invalid");
});

test("publishes a strict schema and bilingual boundary documentation", async () => {
  const [schema, english, chinese] = await Promise.all([
    readFile(new URL("../specs/advisor/basic-report-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/advisor/basic-report-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/basic-report-v1.zh-CN.md", import.meta.url), "utf8"),
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.boundaries.properties.base_access.const, "free");
  assert.equal(schema.$defs.boundaries.properties.formal_procurement_evidence.const, false);
  assert.equal(schema.$defs.boundaries.properties.execution_authorized.const, false);
  for (const document of [english, chinese]) {
    assert.match(document, /JSON/);
    assert.match(document, /CSV/);
    assert.match(document, /PDF/);
    assert.match(document, /free|免费/i);
    assert.match(document, /formal procurement|正式采购/i);
    assert.match(document, /verify|验证|校验/i);
  }
});
