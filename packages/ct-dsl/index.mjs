const OBJECTIVE_VALUES = new Set(["latency", "cost", "balanced"]);
const FAILURE_MODE_VALUES = new Set(["fail_static", "fail_closed"]);

export const CT_DSL_VERSION = "1.0.0";

function issue(path, code, message) {
  return Object.freeze({ path, code, message });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(value, allowed, path, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue(`${path}.${key}`, "unknown_property", "Property is not defined by CT-DSL v1."));
  }
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validatePolicy(document) {
  const issues = [];
  if (!isRecord(document)) return Object.freeze({ valid: false, version: CT_DSL_VERSION, issues: [issue("$", "type", "Policy must be an object.")] });

  checkKeys(document, new Set(["version", "policy", "routes"]), "$", issues);
  if (document.version !== 1) issues.push(issue("$.version", "version", "CT-DSL v1 requires version: 1."));

  if (!isRecord(document.policy)) {
    issues.push(issue("$.policy", "type", "policy must be an object."));
  } else {
    checkKeys(document.policy, new Set(["name", "objective", "constraints"]), "$.policy", issues);
    if (typeof document.policy.name !== "string" || document.policy.name.length === 0) issues.push(issue("$.policy.name", "required", "name must be a non-empty string."));
    if (!OBJECTIVE_VALUES.has(document.policy.objective)) issues.push(issue("$.policy.objective", "enum", "objective must be latency, cost, or balanced."));
    const constraints = document.policy.constraints;
    if (!isRecord(constraints)) {
      issues.push(issue("$.policy.constraints", "type", "constraints must be an object."));
    } else {
      checkKeys(constraints, new Set(["max_latency_ms", "max_cost_per_gb", "data_regions", "require_encryption", "failure_mode"]), "$.policy.constraints", issues);
      if (!positiveNumber(constraints.max_latency_ms)) issues.push(issue("$.policy.constraints.max_latency_ms", "range", "max_latency_ms must be positive."));
      if (!positiveNumber(constraints.max_cost_per_gb)) issues.push(issue("$.policy.constraints.max_cost_per_gb", "range", "max_cost_per_gb must be positive."));
      if (!Array.isArray(constraints.data_regions) || constraints.data_regions.length === 0 || constraints.data_regions.some((item) => typeof item !== "string" || item.length === 0)) issues.push(issue("$.policy.constraints.data_regions", "items", "data_regions must contain non-empty strings."));
      if (typeof constraints.require_encryption !== "boolean") issues.push(issue("$.policy.constraints.require_encryption", "type", "require_encryption must be boolean."));
      if (!FAILURE_MODE_VALUES.has(constraints.failure_mode)) issues.push(issue("$.policy.constraints.failure_mode", "enum", "failure_mode must be fail_static or fail_closed."));
    }
  }

  if (!Array.isArray(document.routes) || document.routes.length < 2 || document.routes.length > 12) {
    issues.push(issue("$.routes", "items", "routes must contain between 2 and 12 entries."));
  } else {
    const ids = new Set();
    document.routes.forEach((route, index) => {
      const path = `$.routes[${index}]`;
      if (!isRecord(route)) return issues.push(issue(path, "type", "route must be an object."));
      checkKeys(route, new Set(["id", "protocol", "region", "latency_ms", "cost_per_gb", "encrypted"]), path, issues);
      for (const key of ["id", "protocol", "region"]) if (typeof route[key] !== "string" || route[key].length === 0) issues.push(issue(`${path}.${key}`, "required", `${key} must be a non-empty string.`));
      if (ids.has(route.id)) issues.push(issue(`${path}.id`, "duplicate", "route id must be unique."));
      ids.add(route.id);
      if (!positiveNumber(route.latency_ms)) issues.push(issue(`${path}.latency_ms`, "range", "latency_ms must be positive."));
      if (!positiveNumber(route.cost_per_gb)) issues.push(issue(`${path}.cost_per_gb`, "range", "cost_per_gb must be positive."));
      if (typeof route.encrypted !== "boolean") issues.push(issue(`${path}.encrypted`, "type", "encrypted must be boolean."));
    });
  }
  return Object.freeze({ valid: issues.length === 0, version: CT_DSL_VERSION, issues: Object.freeze(issues) });
}

export function assertValidPolicy(document) {
  const result = validatePolicy(document);
  if (!result.valid) {
    const error = new Error(`Invalid CT-DSL policy: ${result.issues.map(({ path, message }) => `${path} ${message}`).join("; ")}`);
    error.code = "CT_DSL_INVALID";
    error.issues = result.issues;
    throw error;
  }
  return document;
}
