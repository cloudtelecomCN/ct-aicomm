import { createHash } from "node:crypto";
import { validateAdvisorDataGateResult } from "./data-gate-constraints.mjs";
import {
  computeMultiObjectiveSha256,
  validateMultiObjectiveAnalysisResult,
} from "./multi-objective-analysis.mjs";

export const ADVISOR_BASIC_REPORT_SCHEMA_VERSION = "1.0.0";
export const ADVISOR_BASIC_REPORT_FORMAT_VERSION = "1.0.0";
export const ADVISOR_BASIC_REPORT_LOCALES = Object.freeze(["en", "zh-CN"]);

const REPORT_ID = /^advisor_basic_report_[0-9a-f-]{36}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const REPORT_BOUNDARIES = Object.freeze({
  base_access: "free",
  formal_procurement_evidence: false,
  official_report_number_issued: false,
  human_decision_recorded: false,
  independent_review_performed: false,
  certification_issued: false,
  recommendation_read_only: true,
  execution_authorized: false,
  performance_claim_allowed: false,
  global_optimum_claimed: false,
  paid_capability_required: false,
});

const COPY = Object.freeze({
  en: Object.freeze({
    title: "CT-Advisor Basic Infrastructure Analysis Report",
    limitations: Object.freeze([
      "This free report is decision support, not formal procurement evidence.",
      "Recommendations are read-only and do not record a human decision or authorize execution.",
      "Estimated performance values remain estimates unless separately supported by measured evidence.",
      "Unknown values are retained as unknown and are never imputed.",
      "This report is not an independent review, certification, legal opinion, or capacity commitment.",
    ]),
  }),
  "zh-CN": Object.freeze({
    title: "CT-Advisor 基础设施分析基础报告",
    limitations: Object.freeze([
      "本免费报告仅用于决策支持，不属于正式采购证据。",
      "建议为只读结果，不记录人工决定，也不授权任何执行。",
      "除非另有实测证据支持，预估性能仍属于估算值。",
      "未知值保持未知，系统不会插补。",
      "本报告不构成独立复核、认证、法律意见或容量承诺。",
    ]),
  }),
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const input = typeof value === "string" || value instanceof Uint8Array ? value : canonicalJson(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function clone(value) {
  return structuredClone(value);
}

function reportProjection(report) {
  return { ...report, content_sha256: null };
}

function candidateNameMap(analysis) {
  return new Map(analysis.metric_coverage.candidates.map((candidate) => [candidate.combination_id, {
    combination_key: candidate.combination_key,
    display_name: candidate.display_name,
  }]));
}

function scenarioLeaders(analysis, names) {
  return analysis.scenarios.map((scenario) => {
    const candidateId = scenario.recommendation.primary_candidate_id;
    const candidate = candidateId ? names.get(candidateId) : null;
    return {
      scenario_id: scenario.scenario_id,
      status: scenario.recommendation.status,
      primary_candidate_id: candidateId,
      primary_candidate_key: candidate?.combination_key ?? null,
      primary_candidate_name: candidate?.display_name ?? null,
      sensitivity_status: scenario.sensitivity.status,
    };
  });
}

function orderedObservations(observations) {
  return clone(observations)
    .map((candidate) => ({ ...candidate, metrics: [...candidate.metrics].sort((left, right) => left.metric_id.localeCompare(right.metric_id, "en")) }))
    .sort((left, right) => left.combination_id.localeCompare(right.combination_id, "en"));
}

function validateObservationBinding(observations, analysis) {
  if (!Array.isArray(observations) || observations.length !== analysis.metric_coverage.eligible_candidate_count) {
    fail("basic_report_observations_invalid", "source observations must cover every eligible candidate");
  }
  const ordered = orderedObservations(observations);
  if (computeMultiObjectiveSha256(ordered) !== analysis.observation_set_sha256) {
    fail("basic_report_observations_digest_mismatch", "source observations do not match the selected analysis");
  }
  return ordered;
}

export function computeAdvisorBasicReportSha256(value) {
  return sha256(value);
}

export function buildAdvisorBasicReport({ reportId, analysis, dataGateResult, observations, locale, generatedAt }) {
  if (!REPORT_ID.test(reportId || "")) fail("basic_report_id_invalid", "reportId must be a server-owned Advisor basic report identifier");
  if (!ADVISOR_BASIC_REPORT_LOCALES.includes(locale)) fail("basic_report_locale_invalid", "locale must be en or zh-CN");
  if (!TIMESTAMP.test(generatedAt || "")) fail("basic_report_timestamp_invalid", "generatedAt must be a UTC timestamp");
  validateMultiObjectiveAnalysisResult(analysis);
  validateAdvisorDataGateResult(dataGateResult);
  if (analysis.project_id !== dataGateResult.project_id
    || analysis.constraint_evaluation.evaluation_id !== dataGateResult.evaluation_id
    || analysis.constraint_evaluation.content_sha256 !== dataGateResult.content_sha256
    || analysis.constraint_evaluation.input_sha256 !== dataGateResult.input_sha256) {
    fail("basic_report_gate_binding_mismatch", "analysis and data-gate bindings do not match");
  }
  const sourceLedger = validateObservationBinding(observations, analysis);
  const names = candidateNameMap(analysis);
  const primaryId = analysis.decision_support.primary_candidate_id;
  const primary = primaryId ? names.get(primaryId) : null;
  const copy = COPY[locale];
  const report = {
    schema_version: ADVISOR_BASIC_REPORT_SCHEMA_VERSION,
    format_version: ADVISOR_BASIC_REPORT_FORMAT_VERSION,
    report_type: "ct_advisor_basic_report",
    report_id: reportId,
    project_id: analysis.project_id,
    locale,
    title: copy.title,
    status: analysis.summary.status,
    generated_at: generatedAt,
    source_bindings: {
      requirement_passport: {
        passport_id: dataGateResult.passport.passport_id,
        revision: dataGateResult.passport.revision,
        content_sha256: dataGateResult.passport.content_sha256,
      },
      constraint_evaluation: {
        evaluation_id: dataGateResult.evaluation_id,
        content_sha256: dataGateResult.content_sha256,
        input_sha256: dataGateResult.input_sha256,
        ruleset_sha256: dataGateResult.ruleset_sha256,
      },
      analysis: {
        analysis_id: analysis.analysis_id,
        content_sha256: analysis.content_sha256,
        input_sha256: analysis.input_sha256,
        observation_set_sha256: analysis.observation_set_sha256,
      },
      method: clone(analysis.method),
    },
    executive_summary: {
      eligible_candidate_count: analysis.summary.eligible_candidate_count,
      complete_candidate_count: analysis.summary.complete_candidate_count,
      incomplete_candidate_count: analysis.summary.incomplete_candidate_count,
      excluded_candidate_count: analysis.decision_support.exclusions.length,
      pareto_frontier_count: analysis.summary.pareto_frontier_count,
      primary_scenario_id: analysis.decision_support.primary_scenario_id,
      recommendation_status: analysis.decision_support.status,
      primary_candidate_id: primaryId,
      primary_candidate_key: primary?.combination_key ?? null,
      primary_candidate_name: primary?.display_name ?? null,
      scenario_leaders: scenarioLeaders(analysis, names),
    },
    methodology: {
      hard_constraints: "evaluated_before_scoring",
      normalization: "direction_aware_min_max_over_complete_eligible_candidates",
      score_formula: "sum(normalized_value * weight_basis_points / 10000)",
      tie_policy: "equal_scores_remain_tied",
      unknown_policy: "retain_unknown_without_imputation",
      pareto_policy: "no_worse_on_all_metrics_and_strictly_better_on_at_least_one",
      sensitivity: "one_at_a_time_weight_delta_with_deterministic_redistribution",
      sensitivity_delta_basis_points: analysis.scenarios[0]?.sensitivity.delta_basis_points ?? 1000,
    },
    analysis: clone(analysis),
    source_ledger: sourceLedger,
    limitations: [...copy.limitations],
    boundaries: { ...REPORT_BOUNDARIES },
    content_sha256: null,
  };
  report.content_sha256 = sha256(reportProjection(report));
  return report;
}

export function validateAdvisorBasicReport(report) {
  if (!report || typeof report !== "object" || report.schema_version !== ADVISOR_BASIC_REPORT_SCHEMA_VERSION
    || report.format_version !== ADVISOR_BASIC_REPORT_FORMAT_VERSION || report.report_type !== "ct_advisor_basic_report"
    || !REPORT_ID.test(report.report_id || "") || !ADVISOR_BASIC_REPORT_LOCALES.includes(report.locale)
    || !TIMESTAMP.test(report.generated_at || "")) fail("basic_report_identity_invalid", "basic report identity or version is invalid");
  validateMultiObjectiveAnalysisResult(report.analysis);
  validateObservationBinding(report.source_ledger, report.analysis);
  if (report.project_id !== report.analysis.project_id
    || report.source_bindings?.analysis?.analysis_id !== report.analysis.analysis_id
    || report.source_bindings?.analysis?.content_sha256 !== report.analysis.content_sha256
    || report.source_bindings?.analysis?.observation_set_sha256 !== report.analysis.observation_set_sha256
    || report.source_bindings?.constraint_evaluation?.evaluation_id !== report.analysis.constraint_evaluation.evaluation_id
    || report.source_bindings?.constraint_evaluation?.content_sha256 !== report.analysis.constraint_evaluation.content_sha256
    || report.source_bindings?.method?.method_sha256 !== report.analysis.method.method_sha256) {
    fail("basic_report_source_binding_invalid", "basic report source bindings are inconsistent");
  }
  const boundaries = report.boundaries || {};
  for (const [key, expected] of Object.entries(REPORT_BOUNDARIES)) {
    if (boundaries[key] !== expected) fail("basic_report_boundary_invalid", `basic report boundary ${key} is invalid`);
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 5) fail("basic_report_limitations_invalid", "basic report limitations are incomplete");
  if (!SHA256.test(report.content_sha256 || "") || report.content_sha256 !== sha256(reportProjection(report))) {
    fail("basic_report_digest_mismatch", "basic report digest does not match its content");
  }
  return { valid: true, digest_verified: true, status: report.status, content_sha256: report.content_sha256 };
}

export function renderAdvisorBasicReportJson(report) {
  validateAdvisorBasicReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("|") : typeof value === "object" ? canonicalJson(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function advisorBasicReportCsvRows(report) {
  validateAdvisorBasicReport(report);
  const rows = [];
  const push = (record_type, values = {}) => rows.push({ record_type, report_id: report.report_id, project_id: report.project_id, ...values });
  push("report_summary", { status: report.status, value: report.executive_summary.recommendation_status, candidate_id: report.executive_summary.primary_candidate_id, note: report.title });
  for (const [binding, value] of Object.entries(report.source_bindings)) push("source_binding", { status: binding, value: value.content_sha256 || value.method_sha256, note: canonicalJson(value) });
  for (const candidate of report.analysis.metric_coverage.candidates) push("candidate_coverage", { candidate_id: candidate.combination_id, status: candidate.status, value: candidate.combination_key, note: candidate.display_name });
  for (const metric of report.analysis.normalization) push("normalization", { metric_id: metric.metric_id, status: metric.direction, value: metric.observed_minimum, unit: metric.unit, note: metric.observed_maximum });
  for (const candidateId of report.analysis.pareto.frontier_candidate_ids) push("pareto_frontier", { candidate_id: candidateId, status: "frontier" });
  for (const candidate of report.analysis.pareto.dominated_candidates) push("pareto_dominated", { candidate_id: candidate.combination_id, status: "dominated", note: candidate.dominated_by });
  for (const scenario of report.analysis.scenarios) {
    for (const weight of scenario.weights) push("scenario_weight", { scenario_id: scenario.scenario_id, metric_id: weight.metric_id, weight_basis_points: weight.weight_basis_points });
    for (const ranking of scenario.rankings) {
      push("scenario_ranking", { scenario_id: scenario.scenario_id, candidate_id: ranking.combination_id, rank: ranking.rank, score: ranking.score, status: ranking.pareto_frontier ? "pareto_frontier" : "ranked", value: ranking.combination_key });
      for (const contribution of ranking.contributions) push("metric_contribution", { scenario_id: scenario.scenario_id, candidate_id: ranking.combination_id, metric_id: contribution.metric_id, normalized_value: contribution.normalized_value, weight_basis_points: contribution.weight_basis_points, weighted_contribution: contribution.weighted_contribution });
    }
    for (const range of scenario.sensitivity.stability_ranges) push("sensitivity", { scenario_id: scenario.scenario_id, metric_id: range.metric_id, status: scenario.sensitivity.status, value: range.tested_weight_basis_points, note: `${range.retained_leader_min_basis_points ?? ""}:${range.retained_leader_max_basis_points ?? ""}` });
  }
  for (const candidate of report.source_ledger) {
    for (const metric of candidate.metrics) push("source_observation", { candidate_id: candidate.combination_id, metric_id: metric.metric_id, status: metric.status, value: metric.value, unit: metric.unit, source_kind: metric.source.kind, source_confidence: metric.source.confidence, source_observed_at: metric.source.observed_at, source_reference: metric.source.reference, source_sha256: metric.source.content_sha256 });
  }
  report.limitations.forEach((note, index) => push("limitation", { value: index + 1, note }));
  Object.entries(report.boundaries).forEach(([key, value]) => push("boundary", { status: key, value }));
  push("report_digest", { status: "verified", value: report.content_sha256 });
  return rows;
}

export function renderAdvisorBasicReportCsv(report) {
  const columns = ["record_type", "report_id", "project_id", "scenario_id", "candidate_id", "metric_id", "rank", "score", "status", "value", "unit", "weight_basis_points", "normalized_value", "weighted_contribution", "source_kind", "source_confidence", "source_observed_at", "source_reference", "source_sha256", "note"];
  const rows = advisorBasicReportCsvRows(report);
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}

export function advisorBasicReportExportFingerprints(report) {
  const json = renderAdvisorBasicReportJson(report);
  const csv = renderAdvisorBasicReportCsv(report);
  return { json_sha256: sha256(json), csv_sha256: sha256(csv), csv_row_count: csv.trimEnd().split("\n").length - 1 };
}

export function verifyAdvisorBasicReportPdf(pdfBytes, report) {
  validateAdvisorBasicReport(report);
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const suffix = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 8192)));
  const marker = `CT-Advisor Basic Report ${report.content_sha256}`;
  if (!prefix.startsWith("%PDF-1.") || !`${prefix}${suffix}`.includes(marker)) fail("basic_report_pdf_invalid", "PDF is missing its report digest marker");
  return { valid: true, content_sha256: report.content_sha256 };
}

