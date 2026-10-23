import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  advisorBasicReportExportFingerprints,
  renderAdvisorBasicReportCsv,
  validateAdvisorBasicReport,
  verifyAdvisorBasicReportPdf,
} from "../packages/advisor/basic-report.mjs";
import { resolveExistingPathWithinRoot } from "./path-boundary.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

async function inputPath(value, label) {
  if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a repository-relative path`);
  return resolveExistingPathWithinRoot(ROOT, value, { label });
}

async function main() {
  const [reportArgument, csvArgument, pdfArgument] = process.argv.slice(2);
  if (!reportArgument) throw new Error("Usage: node scripts/verify-advisor-basic-report.mjs <report.json> [report.csv] [report.pdf]");
  const report = JSON.parse(await readFile(await inputPath(reportArgument, "Report path"), "utf8"));
  const verified = validateAdvisorBasicReport(report);
  const exports = advisorBasicReportExportFingerprints(report);
  let csvVerified = null;
  let pdfVerified = null;
  if (csvArgument) {
    const csv = await readFile(await inputPath(csvArgument, "CSV path"), "utf8");
    if (csv !== renderAdvisorBasicReportCsv(report)) throw new Error("CSV does not match the verified report");
    csvVerified = true;
  }
  if (pdfArgument) {
    verifyAdvisorBasicReportPdf(await readFile(await inputPath(pdfArgument, "PDF path")), report);
    pdfVerified = true;
  }
  process.stdout.write(`${JSON.stringify({
    valid: true,
    report_id: report.report_id,
    status: verified.status,
    content_sha256: verified.content_sha256,
    json_sha256: exports.json_sha256,
    csv_sha256: exports.csv_sha256,
    csv_row_count: exports.csv_row_count,
    csv_verified: csvVerified,
    pdf_verified: pdfVerified,
    formal_procurement_evidence: false,
    execution_authorized: false,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
