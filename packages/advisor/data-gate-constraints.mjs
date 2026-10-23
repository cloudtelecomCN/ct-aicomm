import { createHash } from "node:crypto";
import { validateInfrastructureCombinationDocument } from "./combination-builder.mjs";
import { validateRequirementPassport } from "./requirement-passport.mjs";

export const DATA_GATE_SCHEMA_VERSION = "1.0.0";
export const DATA_GATE_RULESET_VERSION = "1.0.0";

const RULESET_KEYS = new Set(["schema_version", "ruleset_id", "ruleset_version", "minimum_combination_count", "policy", "mappings", "boundaries"]);
const POLICY_KEYS = new Set(["unknown_hard_value", "unknown_hard_source", "unmapped_hard_field", "unknown_candidate_dimension", "case_matching", "numeric_comparison"]);
const MAPPING_KEYS = new Set(["rule_id", "field_id", "dimension_ids", "operator", "requirement_units", "dimension_unit"]);
const BOUNDARY_KEYS = new Set(["hard_constraints_precede_scoring", "scoring_performed", "ranking_performed", "recommendation_issued", "execution_authorized", "unknowns_imputed"]);
const OPERATORS = new Set(["equals_ci", "one_of_ci", "none_of_ci", "contains_ci", "less_than_or_equal", "greater_than_or_equal"]);

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_invalid`, `${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${label}_field_unknown`, `${label} contains unknown field ${unknown}`);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function validTimestamp(value) {
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function issue(code, severity, scope, message, details = {}) {
  return { code, severity, scope, ...details, message };
}

function issueOrder(left, right) {
  const severity = { blocking: 0, warning: 1 };
  return severity[left.severity] - severity[right.severity]
    || compareText(left.code, right.code)
    || compareText(left.field_id ?? "", right.field_id ?? "")
    || compareText(left.combination_id ?? "", right.combination_id ?? "");
}

function normalizedText(value) {
  return String(value).trim().toLowerCase();
}

function flatValues(observations) {
  return observations.flatMap(({ value }) => Array.isArray(value) ? value : [value]).filter((value) => value !== null && value !== undefined);
}

function mappingOutcome(field, mapping, combination) {
  const observations = mapping.dimension_ids.map((dimensionId) => {
    const dimension = combination.comparison_dimensions?.[dimensionId] ?? { status: "unknown", value: null, unit: mapping.dimension_unit };
    return { dimension_id: dimensionId, status: dimension.status, value: dimension.value, unit: dimension.unit };
  });
  const provided = observations.filter(({ status }) => status === "provided");
  const observed = { dimensions: observations };
  if (!provided.length) return { outcome: "unknown", code: "hard_constraint_dimension_unknown", observed, message: "No selected candidate dimension can prove this hard constraint." };
  if (provided.some(({ unit }) => unit !== mapping.dimension_unit)) return { outcome: "unknown", code: "hard_constraint_dimension_unit_mismatch", observed, message: "Candidate dimension unit does not match the frozen rule mapping." };
  const values = flatValues(provided);
  const expectedValues = Array.isArray(field.value) ? field.value : [field.value];
  const expectedText = new Set(expectedValues.map(normalizedText));
  const observedText = values.map(normalizedText);
  let passed = false;
  if (mapping.operator === "equals_ci") passed = observedText.some((value) => value === normalizedText(field.value));
  else if (mapping.operator === "one_of_ci") passed = observedText.some((value) => expectedText.has(value));
  else if (mapping.operator === "none_of_ci") passed = observedText.every((value) => !expectedText.has(value));
  else if (mapping.operator === "contains_ci") passed = observedText.includes(normalizedText(field.value));
  else {
    const numericValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (numericValues.length !== values.length || typeof field.value !== "number" || !Number.isFinite(field.value)) {
      return { outcome: "unknown", code: "hard_constraint_numeric_value_invalid", observed, message: "Numeric hard constraint or candidate dimension is not a finite number." };
    }
    passed = mapping.operator === "less_than_or_equal"
      ? numericValues.every((value) => value <= field.value)
      : numericValues.every((value) => value >= field.value);
  }
  return {
    outcome: passed ? "pass" : "fail",
    code: passed ? "hard_constraint_satisfied" : "hard_constraint_violated",
    observed,
    message: passed ? "Candidate satisfies the hard constraint." : "Candidate violates the hard constraint.",
  };
}

export function computeDataGateSha256(value) {
  return sha256(value);
}

export function validateDataReadinessRuleset(ruleset) {
  exactKeys(ruleset, RULESET_KEYS, "data_gate_ruleset");
  exactKeys(ruleset.policy, POLICY_KEYS, "data_gate_policy");
  exactKeys(ruleset.boundaries, BOUNDARY_KEYS, "data_gate_boundaries");
  if (ruleset.schema_version !== DATA_GATE_SCHEMA_VERSION || ruleset.ruleset_version !== DATA_GATE_RULESET_VERSION || ruleset.ruleset_id !== "ct-advisor-data-readiness-hard-constraints") fail("data_gate_ruleset_unsupported", "unsupported data gate ruleset");
  if (!Number.isSafeInteger(ruleset.minimum_combination_count) || ruleset.minimum_combination_count < 2 || ruleset.minimum_combination_count > 500) fail("data_gate_minimum_invalid", "minimum combination count must be 2-500");
  if (ruleset.policy.unknown_hard_value !== "block" || ruleset.policy.unknown_hard_source !== "block" || ruleset.policy.unmapped_hard_field !== "block" || ruleset.policy.unknown_candidate_dimension !== "exclude_candidate" || ruleset.policy.case_matching !== "ascii_case_insensitive" || ruleset.policy.numeric_comparison !== "conservative") fail("data_gate_policy_invalid", "data gate fail-closed policy is invalid");
  if (ruleset.boundaries.hard_constraints_precede_scoring !== true || ruleset.boundaries.scoring_performed !== false || ruleset.boundaries.ranking_performed !== false || ruleset.boundaries.recommendation_issued !== false || ruleset.boundaries.execution_authorized !== false || ruleset.boundaries.unknowns_imputed !== false) fail("data_gate_boundary_invalid", "data gate boundaries are invalid");
  if (!Array.isArray(ruleset.mappings) || !ruleset.mappings.length) fail("data_gate_mappings_empty", "data gate ruleset needs mappings");
  const ruleIds = new Set();
  const fieldIds = new Set();
  for (const mapping of ruleset.mappings) {
    exactKeys(mapping, MAPPING_KEYS, "data_gate_mapping");
    if (!/^hard\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(mapping.rule_id || "") || ruleIds.has(mapping.rule_id)) fail("data_gate_rule_id_invalid", "mapping rule identifiers must be unique");
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(mapping.field_id || "") || fieldIds.has(mapping.field_id)) fail("data_gate_field_mapping_invalid", "hard fields may be mapped only once");
    if (!Array.isArray(mapping.dimension_ids) || !mapping.dimension_ids.length || mapping.dimension_ids.some((value) => !/^[a-z][a-z0-9_]*$/.test(value))) fail("data_gate_dimension_mapping_invalid", "mapping dimensions are invalid");
    if (!OPERATORS.has(mapping.operator) || !Array.isArray(mapping.requirement_units) || !mapping.requirement_units.length || typeof mapping.dimension_unit !== "string") fail("data_gate_operator_invalid", "mapping operator or units are invalid");
    ruleIds.add(mapping.rule_id);
    fieldIds.add(mapping.field_id);
  }
  return { valid: true, mapping_count: ruleset.mappings.length, ruleset_sha256: sha256(ruleset) };
}

export function evaluateAdvisorDataGate({ evaluationId, passport, combinations, requirementRegistry, ruleset, generatedAt }) {
  if (!/^advisor_constraint_evaluation_[0-9a-f-]{36}$/.test(evaluationId || "")) fail("data_gate_evaluation_id_invalid", "evaluationId must be a server-owned Advisor constraint evaluation identifier");
  if (!validTimestamp(generatedAt)) fail("data_gate_timestamp_invalid", "generatedAt must be a UTC timestamp");
  const rulesValidation = validateDataReadinessRuleset(ruleset);
  const passportValidation = validateRequirementPassport(passport, requirementRegistry);
  if (!Array.isArray(combinations) || combinations.length < 1 || combinations.length > 500) fail("data_gate_combinations_invalid", "combinations must contain 1-500 immutable documents");
  const combinationIds = new Set();
  for (const combination of combinations) {
    validateInfrastructureCombinationDocument(combination);
    if (combinationIds.has(combination.combination_id)) fail("data_gate_combination_duplicate", `combination ${combination.combination_id} is duplicated`);
    combinationIds.add(combination.combination_id);
  }
  const orderedCombinations = [...combinations].sort((left, right) => compareText(left.combination_key, right.combination_key));
  const issues = [];
  if (passport.state !== "frozen" || passportValidation.digest_verified !== true) issues.push(issue("passport_not_frozen", "blocking", "passport", "A frozen, digest-verified Requirement Passport is required."));
  if (orderedCombinations.length < ruleset.minimum_combination_count) issues.push(issue("minimum_combinations_not_met", "blocking", "combination_set", `At least ${ruleset.minimum_combination_count} combinations are required.`));

  const profile = requirementRegistry.template_profiles.find(({ template_id: id, template_version: version }) => id === passport.task_template.id && version === passport.task_template.version);
  const fields = new Map(passport.fields.map((field) => [field.field_id, field]));
  for (const fieldId of profile.required_fields) if (fields.get(fieldId)?.status !== "provided") issues.push(issue("required_requirement_missing", "blocking", "passport", "A required Requirement Passport field is not provided.", { field_id: fieldId }));
  const mappings = new Map(ruleset.mappings.map((mapping) => [mapping.field_id, mapping]));
  const hardFields = passport.fields.filter(({ constraint }) => constraint === "hard").sort((left, right) => compareText(left.field_id, right.field_id));
  if (!hardFields.length) issues.push(issue("no_hard_constraints_declared", "warning", "constraint_set", "No hard constraint is declared; later analysis must preserve this limitation."));
  const constraints = hardFields.map((field) => {
    const mapping = mappings.get(field.field_id) ?? null;
    let mappingStatus = "mapped";
    if (field.status !== "provided") {
      mappingStatus = "blocked";
      issues.push(issue("hard_constraint_value_missing", "blocking", "constraint", "A hard constraint has no provided value.", { field_id: field.field_id }));
    }
    if (field.source.kind === "unknown") {
      mappingStatus = "blocked";
      issues.push(issue("hard_constraint_source_unknown", "blocking", "constraint", "A hard constraint has an unknown source kind.", { field_id: field.field_id }));
    }
    if (field.source.confidence === "unknown") {
      mappingStatus = "blocked";
      issues.push(issue("hard_constraint_confidence_unknown", "blocking", "constraint", "A hard constraint has unknown source confidence.", { field_id: field.field_id }));
    }
    if (!mapping) {
      mappingStatus = "unmapped";
      issues.push(issue("hard_constraint_mapping_missing", "blocking", "constraint", "The frozen ruleset cannot evaluate this hard constraint from Combination Builder dimensions.", { field_id: field.field_id }));
    } else if (!mapping.requirement_units.includes(field.unit)) {
      mappingStatus = "blocked";
      issues.push(issue("hard_constraint_unit_unsupported", "blocking", "constraint", "The hard constraint unit is unsupported by the frozen rule mapping.", { field_id: field.field_id }));
    }
    if (field.source.kind === "synthetic") issues.push(issue("synthetic_hard_constraint", "warning", "constraint", "This hard constraint uses synthetic input and cannot support a real procurement claim.", { field_id: field.field_id }));
    return {
      constraint_id: `hard:${field.field_id}`,
      field_id: field.field_id,
      status: field.status,
      value: field.value,
      unit: field.unit,
      source: { kind: field.source.kind, confidence: field.source.confidence, observed_at: field.source.observed_at, reference: field.source.reference ?? null },
      mapping: mapping ? { status: mappingStatus, rule_id: mapping.rule_id, dimension_ids: [...mapping.dimension_ids], operator: mapping.operator, dimension_unit: mapping.dimension_unit } : { status: mappingStatus, rule_id: null, dimension_ids: [], operator: null, dimension_unit: null },
    };
  });

  const sourceKinds = new Set();
  const candidateResults = orderedCombinations.map((combination) => {
    if (combination.status === "blocked") issues.push(issue("combination_blocked", "blocking", "combination", "Combination Builder marked the candidate as blocked.", { combination_id: combination.combination_id }));
    if (combination.status === "needs_review") issues.push(issue("combination_needs_review", "warning", "combination", "Combination Builder marked the candidate as needing review.", { combination_id: combination.combination_id }));
    for (const resource of combination.resolved_resources) sourceKinds.add(resource.source_kind);
    const evaluations = constraints.map((constraint) => {
      const mapping = mappings.get(constraint.field_id);
      const expected = { value: constraint.value, unit: constraint.unit, source_kind: constraint.source.kind, confidence: constraint.source.confidence };
      if (constraint.mapping.status !== "mapped" || !mapping) return { rule_id: mapping?.rule_id ?? null, field_id: constraint.field_id, outcome: "unknown", code: `hard_constraint_${constraint.mapping.status}`, expected, observed: { dimensions: [] }, message: "Hard constraint cannot be evaluated until its blocking issue is resolved." };
      const outcome = mappingOutcome(fields.get(constraint.field_id), mapping, combination);
      return { rule_id: mapping.rule_id, field_id: constraint.field_id, ...outcome, expected };
    });
    const failed = evaluations.filter(({ outcome }) => outcome === "fail");
    const unknown = evaluations.filter(({ outcome }) => outcome === "unknown");
    const status = combination.status === "blocked" || unknown.length ? "indeterminate" : failed.length ? "excluded" : "eligible";
    if (unknown.length) issues.push(issue("candidate_hard_constraint_unknown", "warning", "combination", "Candidate has one or more hard constraints that cannot be proven.", { combination_id: combination.combination_id }));
    return {
      combination_id: combination.combination_id,
      combination_key: combination.combination_key,
      display_name: combination.display_name,
      status,
      evaluations,
      exclusion_codes: [...new Set(evaluations.filter(({ outcome }) => outcome !== "pass").map(({ code }) => code))].sort(compareText),
      combination_content_sha256: combination.content_sha256,
    };
  });
  if (sourceKinds.has("synthetic")) issues.push(issue("synthetic_resource_data_present", "warning", "combination_set", "At least one candidate uses explicitly synthetic catalog data."));
  if (sourceKinds.size > 1) issues.push(issue("mixed_resource_source_kinds", "warning", "combination_set", "Candidate resources use multiple source kinds; later calculations must retain provenance."));
  const eligibleCount = candidateResults.filter(({ status }) => status === "eligible").length;
  const excludedCount = candidateResults.filter(({ status }) => status === "excluded").length;
  const indeterminateCount = candidateResults.filter(({ status }) => status === "indeterminate").length;
  if (eligibleCount < ruleset.minimum_combination_count) issues.push(issue("insufficient_eligible_combinations", "blocking", "combination_set", `At least ${ruleset.minimum_combination_count} combinations must remain eligible after hard constraints.`));
  issues.sort(issueOrder);
  const blockingCount = issues.filter(({ severity }) => severity === "blocking").length;
  const warningCount = issues.length - blockingCount;
  const status = blockingCount ? "blocked" : warningCount ? "ready_with_gaps" : "ready";
  const inputProjection = {
    passport_sha256: passport.content_sha256,
    passport_revision: passport.revision,
    combination_sha256: orderedCombinations.map(({ content_sha256 }) => content_sha256),
    ruleset_sha256: rulesValidation.ruleset_sha256,
  };
  const result = {
    schema_version: DATA_GATE_SCHEMA_VERSION,
    ruleset_version: ruleset.ruleset_version,
    ruleset_sha256: rulesValidation.ruleset_sha256,
    evaluation_id: evaluationId,
    project_id: passport.project_id,
    passport: { passport_id: passport.passport_id, revision: passport.revision, content_sha256: passport.content_sha256 },
    generated_at: generatedAt,
    input_sha256: sha256(inputProjection),
    readiness: { status, analysis_allowed: status !== "blocked", blocking_issue_count: blockingCount, warning_issue_count: warningCount, issues },
    constraint_set: { hard_constraint_count: constraints.length, constraints },
    candidates: candidateResults,
    summary: { combination_count: candidateResults.length, eligible_count: eligibleCount, excluded_count: excludedCount, indeterminate_count: indeterminateCount },
    boundaries: { hard_constraints_precede_scoring: true, scoring_performed: false, ranking_performed: false, recommendation_issued: false, execution_authorized: false, unknowns_imputed: false },
    content_sha256: null,
  };
  result.content_sha256 = sha256({ ...result, content_sha256: null });
  return result;
}

export function validateAdvisorDataGateResult(result) {
  if (!result || result.schema_version !== DATA_GATE_SCHEMA_VERSION || result.ruleset_version !== DATA_GATE_RULESET_VERSION || !/^advisor_constraint_evaluation_[0-9a-f-]{36}$/.test(result.evaluation_id || "")) fail("data_gate_result_identity_invalid", "data gate result identity is invalid");
  if (result.boundaries?.hard_constraints_precede_scoring !== true || result.boundaries?.scoring_performed !== false || result.boundaries?.ranking_performed !== false || result.boundaries?.recommendation_issued !== false || result.boundaries?.execution_authorized !== false || result.boundaries?.unknowns_imputed !== false) fail("data_gate_result_boundary_invalid", "data gate result boundaries are invalid");
  if (!/^sha256:[0-9a-f]{64}$/.test(result.content_sha256 || "") || result.content_sha256 !== sha256({ ...result, content_sha256: null })) fail("data_gate_result_digest_mismatch", "data gate result digest does not match its content");
  return { valid: true, digest_verified: true, status: result.readiness.status };
}
