import {
  advisorBasicReportExportFingerprints,
  buildAdvisorBasicReport,
  validateAdvisorBasicReport,
} from "../../packages/advisor/basic-report.mjs";
import { createFixedAdvisorAnalysisFixture } from "./basic-report-fixture.mjs";

const input = await createFixedAdvisorAnalysisFixture();
const report = buildAdvisorBasicReport({
  reportId: "advisor_basic_report_55555555-5555-4555-8555-555555555555",
  ...input,
  locale: "en",
  generatedAt: "2026-10-23T12:30:00.000Z",
});
const verified = validateAdvisorBasicReport(report);
const exports = advisorBasicReportExportFingerprints(report);

process.stdout.write(`${JSON.stringify({
  schema_version: report.schema_version,
  report_type: report.report_type,
  data_origin: "synthetic",
  status: verified.status,
  candidate_count: report.executive_summary.eligible_candidate_count,
  scenario_count: report.executive_summary.scenario_leaders.length,
  source_observation_count: report.source_ledger.reduce((total, candidate) => total + candidate.metrics.length, 0),
  csv_row_count: exports.csv_row_count,
  base_access: report.boundaries.base_access,
  formal_procurement_evidence: report.boundaries.formal_procurement_evidence,
  recommendation_read_only: report.boundaries.recommendation_read_only,
  execution_authorized: report.boundaries.execution_authorized,
  content_sha256: report.content_sha256,
  json_sha256: exports.json_sha256,
  csv_sha256: exports.csv_sha256,
}, null, 2)}\n`);
