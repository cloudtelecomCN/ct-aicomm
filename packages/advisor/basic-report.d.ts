export type AdvisorBasicReportLocale = "en" | "zh-CN";
export type Sha256 = `sha256:${string}`;

export interface AdvisorBasicReport {
  schema_version: "1.0.0";
  format_version: "1.0.0";
  report_type: "ct_advisor_basic_report";
  report_id: string;
  project_id: string;
  locale: AdvisorBasicReportLocale;
  title: string;
  status: "complete" | "partial";
  generated_at: string;
  source_bindings: Record<string, unknown>;
  executive_summary: Record<string, unknown>;
  methodology: Record<string, unknown>;
  analysis: Record<string, unknown>;
  source_ledger: Array<Record<string, unknown>>;
  limitations: string[];
  boundaries: Record<string, boolean | string>;
  content_sha256: Sha256;
}

export const ADVISOR_BASIC_REPORT_SCHEMA_VERSION: "1.0.0";
export const ADVISOR_BASIC_REPORT_FORMAT_VERSION: "1.0.0";
export const ADVISOR_BASIC_REPORT_LOCALES: readonly AdvisorBasicReportLocale[];
export function computeAdvisorBasicReportSha256(value: unknown): Sha256;
export function buildAdvisorBasicReport(input: { reportId: string; analysis: Record<string, unknown>; dataGateResult: Record<string, unknown>; observations: Array<Record<string, unknown>>; locale: AdvisorBasicReportLocale; generatedAt: string }): AdvisorBasicReport;
export function validateAdvisorBasicReport(report: AdvisorBasicReport): { valid: true; digest_verified: true; status: "complete" | "partial"; content_sha256: Sha256 };
export function renderAdvisorBasicReportJson(report: AdvisorBasicReport): string;
export function advisorBasicReportCsvRows(report: AdvisorBasicReport): Array<Record<string, unknown>>;
export function renderAdvisorBasicReportCsv(report: AdvisorBasicReport): string;
export function advisorBasicReportExportFingerprints(report: AdvisorBasicReport): { json_sha256: Sha256; csv_sha256: Sha256; csv_row_count: number };
export function verifyAdvisorBasicReportPdf(pdfBytes: Uint8Array | ArrayBuffer, report: AdvisorBasicReport): { valid: true; content_sha256: Sha256 };
