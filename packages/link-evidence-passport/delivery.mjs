import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import {
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "./index.mjs";
import {
  PASSPORT_OBSERVATION_UNIT_RULES,
  verifyPassportNormalizedObservation
} from "./observation.mjs";
import { verifyPassportEvidenceVersion } from "./versioning.mjs";

export const PASSPORT_DELIVERY_VERSION = "1.0.0";
export const PASSPORT_DELIVERY_STATISTICS_PROFILE = "ct-passport-statistics-v1";
export const PASSPORT_DELIVERY_CSV_HEADER = "observation_id,sample_id,sequence,disposition,value,unit,reason_code,reason_stage";

export const PASSPORT_DELIVERY_ERROR_CODES = Object.freeze({
  inputInvalid: "passport_delivery_input_invalid",
  fieldUnknown: "passport_delivery_field_unknown",
  fieldMissing: "passport_delivery_field_missing",
  contextMismatch: "passport_delivery_context_mismatch",
  sampleAccountingMismatch: "passport_delivery_sample_accounting_mismatch",
  statisticMismatch: "passport_delivery_statistic_mismatch",
  csvInvalid: "passport_delivery_csv_invalid",
  fileSetMismatch: "passport_delivery_file_set_mismatch",
  checksumMismatch: "passport_delivery_checksum_mismatch",
  manifestMismatch: "passport_delivery_manifest_mismatch",
  contentMismatch: "passport_delivery_content_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REASON = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const DISPOSITIONS = new Set(["included", "excluded", "failed"]);
const REQUIRED_CONTENT_FILES = Object.freeze([
  "VERIFY.md",
  "SUMMARY.md",
  "freeze.json",
  "observations.json",
  "passport-version.json",
  "run.json",
  "samples.csv"
]);
const OPTIONAL_CONTENT_FILES = Object.freeze(["previous-version.json"]);
const CONTROL_FILES = Object.freeze(["manifest.json", "SHA256SUMS"]);
const ARTIFACT_METADATA = Object.freeze({
  "VERIFY.md": Object.freeze({ media_type: "text/markdown", role: "offline-verification-instructions" }),
  "SUMMARY.md": Object.freeze({ media_type: "text/markdown", role: "human-readable-summary" }),
  "freeze.json": Object.freeze({ media_type: "application/json", role: "scenario-method-freeze" }),
  "observations.json": Object.freeze({ media_type: "application/json", role: "normalized-observations" }),
  "passport-version.json": Object.freeze({ media_type: "application/json", role: "sealed-passport-version" }),
  "previous-version.json": Object.freeze({ media_type: "application/json", role: "previous-passport-version" }),
  "run.json": Object.freeze({ media_type: "application/json", role: "started-run-binding" }),
  "samples.csv": Object.freeze({ media_type: "text/csv", role: "source-samples" })
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(PASSPORT_DELIVERY_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(PASSPORT_DELIVERY_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 32768, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireSemver(value, label) {
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function canonicalInstant(value, label) {
  requireString(value, label, { max: 32 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must be a canonical UTC instant`);
  }
  return value;
}

function stableNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must be a finite non-negative number`);
  }
  const normalized = Number(value.toPrecision(15));
  if (!Number.isFinite(normalized)) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} is outside the supported range`);
  return Object.is(normalized, -0) ? 0 : normalized;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function decodeText(value, label) {
  if (typeof value === "string") return value;
  if (!(value instanceof Uint8Array)) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must be a string or Uint8Array`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} must be valid UTF-8`);
  }
}

function digestText(value) {
  return digestEvidenceBytes(textBytes(value));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(PASSPORT_DELIVERY_ERROR_CODES.contentMismatch, `${label} must contain valid JSON`);
  }
  if (!isObject(value)) fail(PASSPORT_DELIVERY_ERROR_CODES.contentMismatch, `${label} must contain one JSON object`);
  return value;
}

function reference(objectType, objectId, value) {
  return {
    object_type: objectType,
    object_id: objectId,
    version: value.version,
    tenant_id: value.tenant_id,
    content_fingerprint: value.content_fingerprint
  };
}

function passportReference(value) {
  return reference("passport_evidence_version", value.passport_id, value);
}

function runReference(value) {
  return reference("run", value.run_id, value);
}

function freezeReference(value) {
  return reference("passport_scenario_method_freeze", value.freeze_id, value);
}

function observationReference(value) {
  return reference("passport_normalized_observation", value.observation_id, value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSamples(left, right) {
  return compareText(left.observation_id, right.observation_id)
    || left.sequence - right.sequence
    || compareText(left.sample_id, right.sample_id);
}

function normalizeSample(value, index) {
  const label = `samples[${index}]`;
  exactObject(value, [
    "observation_id", "sample_id", "sequence", "disposition", "value", "unit", "reason_code", "reason_stage"
  ], [], label);
  const disposition = requireString(value.disposition, `${label}.disposition`, { max: 16 });
  if (!DISPOSITIONS.has(disposition)) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label}.disposition is invalid`);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label}.sequence must be a positive safe integer`);
  }
  const result = {
    observation_id: requireId(value.observation_id, `${label}.observation_id`),
    sample_id: requireId(value.sample_id, `${label}.sample_id`),
    sequence: value.sequence,
    disposition,
    value: value.value,
    unit: value.unit,
    reason_code: value.reason_code,
    reason_stage: value.reason_stage
  };
  if (disposition === "included") {
    result.value = stableNumber(value.value, `${label}.value`);
    result.unit = requireString(value.unit, `${label}.unit`, { max: 32 });
    if (!Object.hasOwn(PASSPORT_OBSERVATION_UNIT_RULES, result.unit)) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label}.unit is outside the CT-611 unit catalog`);
    }
    if (value.reason_code !== null || value.reason_stage !== null) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} included samples cannot carry a reason`);
    }
    result.reason_code = null;
    result.reason_stage = null;
  } else {
    if (value.value !== null || value.unit !== null) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} ${disposition} samples cannot carry a numeric value`);
    }
    result.value = null;
    result.unit = null;
    result.reason_code = requireString(value.reason_code, `${label}.reason_code`, { max: 128, pattern: REASON });
    if (disposition === "failed") {
      result.reason_stage = requireString(value.reason_stage, `${label}.reason_stage`, { max: 96 });
    } else if (value.reason_stage !== null) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${label} excluded samples cannot carry a reason stage`);
    } else {
      result.reason_stage = null;
    }
  }
  return result;
}

function normalizeSamples(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 100000) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, "samples must contain 1 through 100000 rows");
  }
  const samples = values.map(normalizeSample).sort(compareSamples);
  const identities = samples.map(({ observation_id: observationId, sample_id: sampleId }) => `${observationId}\u0000${sampleId}`);
  const sequences = samples.map(({ observation_id: observationId, sequence }) => `${observationId}\u0000${sequence}`);
  if (new Set(identities).size !== samples.length || new Set(sequences).size !== samples.length) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, "sample ids and sequences must be unique within each observation");
  }
  return samples;
}

function tally(values, key) {
  const counts = new Map();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return counts;
}

function expectedFailureCounts(observation) {
  return new Map(observation.failures.map(({ code, stage, count }) => [`${code}\u0000${stage}`, count]));
}

function expectedExclusionCounts(observation) {
  return new Map(observation.exclusions.map(({ rule_id: ruleId, count }) => [ruleId, count]));
}

function assertCountsMatch(actual, expected, label) {
  if (actual.size !== expected.size) fail(PASSPORT_DELIVERY_ERROR_CODES.sampleAccountingMismatch, `${label} reason set does not match the observation`);
  for (const [key, count] of expected) {
    if (actual.get(key) !== count) fail(PASSPORT_DELIVERY_ERROR_CODES.sampleAccountingMismatch, `${label} count does not match the observation`);
  }
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function aggregate(values, aggregation, label) {
  if (values.length === 0) return null;
  if (aggregation === "raw") {
    if (values.length !== 1) fail(PASSPORT_DELIVERY_ERROR_CODES.statisticMismatch, `${label} raw aggregation requires exactly one included sample`);
    return values[0];
  }
  if (aggregation === "count") return values.length;
  if (aggregation === "mean") return stableNumber(values.reduce((sum, value) => sum + value, 0) / values.length, label);
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  if (aggregation === "p50") return percentile(values, 50);
  if (aggregation === "p95") return percentile(values, 95);
  if (aggregation === "p99") return percentile(values, 99);
  fail(PASSPORT_DELIVERY_ERROR_CODES.statisticMismatch, `${label} uses an unsupported aggregation`);
}

function recomputeStatistic(observation, rows) {
  const included = rows.filter(({ disposition }) => disposition === "included");
  const excluded = rows.filter(({ disposition }) => disposition === "excluded");
  const failed = rows.filter(({ disposition }) => disposition === "failed");
  const sampleCounts = {
    attempted: rows.length,
    successful: included.length + excluded.length,
    failed: failed.length,
    excluded: excluded.length,
    included: included.length
  };
  if (!same(sampleCounts, observation.samples)) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.sampleAccountingMismatch, `${observation.observation_id} CSV counts do not match the normalized observation`);
  }
  assertCountsMatch(
    tally(failed, ({ reason_code: code, reason_stage: stage }) => `${code}\u0000${stage}`),
    expectedFailureCounts(observation),
    `${observation.observation_id} failure`
  );
  assertCountsMatch(
    tally(excluded, ({ reason_code: code }) => code),
    expectedExclusionCounts(observation),
    `${observation.observation_id} exclusion`
  );
  if (included.some(({ unit }) => unit !== observation.measurement.source_unit)) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.statisticMismatch, `${observation.observation_id} included samples must use the observation source unit`);
  }
  const sourceValues = included.map(({ value }) => value);
  const recomputedSource = aggregate(sourceValues, observation.aggregation, `${observation.observation_id}.recomputed_source_value`);
  const rule = PASSPORT_OBSERVATION_UNIT_RULES[observation.measurement.source_unit];
  const recomputedNormalized = recomputedSource === null
    ? null
    : stableNumber(recomputedSource * rule.conversion_factor, `${observation.observation_id}.recomputed_normalized_value`);
  if (recomputedSource !== observation.measurement.source_value
      || recomputedNormalized !== observation.measurement.normalized_value
      || rule.canonical_unit !== observation.measurement.normalized_unit) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.statisticMismatch, `${observation.observation_id} reported statistic cannot be reproduced from samples.csv`);
  }
  return {
    observation_ref: observationReference(observation),
    data_origin: observation.source.origin,
    observation_point: observation.observation_point,
    metric: observation.metric,
    aggregation: observation.aggregation,
    source_unit: observation.measurement.source_unit,
    normalized_unit: observation.measurement.normalized_unit,
    attempted_samples: rows.length,
    included_samples: included.length,
    failed_samples: failed.length,
    excluded_samples: excluded.length,
    reported_value: observation.measurement.normalized_value,
    recomputed_value: recomputedNormalized,
    exact_match: true
  };
}

function csvCell(value) {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderPassportDeliverySamplesCsv(samplesInput) {
  const samples = normalizeSamples(samplesInput);
  const rows = samples.map((sample) => [
    sample.observation_id,
    sample.sample_id,
    sample.sequence,
    sample.disposition,
    sample.value,
    sample.unit,
    sample.reason_code,
    sample.reason_stage
  ].map(csvCell).join(","));
  return `${PASSPORT_DELIVERY_CSV_HEADER}\n${rows.join("\n")}\n`;
}

function parseCsvLine(line, lineNumber) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === '"') {
      fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, `samples.csv line ${lineNumber} contains an unexpected quote`);
    } else {
      cell += character;
    }
  }
  if (quoted) fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, `samples.csv line ${lineNumber} has an unterminated quote`);
  cells.push(cell);
  return cells;
}

export function parsePassportDeliverySamplesCsv(textInput) {
  const text = decodeText(textInput, "samples.csv");
  if (!text.endsWith("\n") || text.includes("\r")) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, "samples.csv must use LF line endings and one trailing LF");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.shift() !== PASSPORT_DELIVERY_CSV_HEADER || lines.length === 0) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, "samples.csv header or row set is invalid");
  }
  const samples = lines.map((line, index) => {
    const cells = parseCsvLine(line, index + 2);
    if (cells.length !== 8) fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, `samples.csv line ${index + 2} must contain 8 columns`);
    const sequence = Number(cells[2]);
    const numericValue = cells[4] === "" ? null : Number(cells[4]);
    return {
      observation_id: cells[0],
      sample_id: cells[1],
      sequence,
      disposition: cells[3],
      value: numericValue,
      unit: cells[5] === "" ? null : cells[5],
      reason_code: cells[6] === "" ? null : cells[6],
      reason_stage: cells[7] === "" ? null : cells[7]
    };
  });
  const normalized = normalizeSamples(samples);
  if (renderPassportDeliverySamplesCsv(normalized) !== text) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.csvInvalid, "samples.csv is not in canonical row order or encoding");
  }
  return deepFreeze(normalized);
}

function markdown(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

export function renderPassportDeliverySummary(manifest) {
  const origins = manifest.data_origins.join(", ");
  const lines = [
    "# Link Evidence Passport delivery summary",
    "",
    `- Delivery: \`${markdown(manifest.delivery_id)}@${markdown(manifest.version)}\``,
    `- Passport: \`${markdown(manifest.passport_ref.object_id)}@${markdown(manifest.passport_ref.version)}\``,
    `- Data origin: \`${markdown(origins)}\``,
    `- Observations: ${manifest.summary.observation_count}`,
    `- Source sample rows: ${manifest.summary.sample_count}`,
    `- Statistics profile: \`${PASSPORT_DELIVERY_STATISTICS_PROFILE}\``,
    "",
    "## Recomputed statistics",
    "",
    "| Observation | Metric | Aggregation | Included | Reported | Recomputed | Unit | Match |",
    "|---|---|---:|---:|---:|---:|---|---|"
  ];
  for (const statistic of manifest.summary.statistics) {
    lines.push(`| ${markdown(statistic.observation_ref.object_id)} | ${markdown(statistic.metric)} | ${markdown(statistic.aggregation)} | ${statistic.included_samples} | ${statistic.reported_value ?? "n/a"} | ${statistic.recomputed_value ?? "n/a"} | ${markdown(statistic.normalized_unit)} | yes |`);
  }
  lines.push(
    "",
    "## Boundary",
    "",
    "This summary is reproduced from the checksum-bound JSON and CSV files. It verifies package integrity and the declared statistics algorithm only. It does not verify principal identity, export authorization, independent review, measured production performance, or certification.",
    ""
  );
  return lines.join("\n");
}

export function renderPassportDeliveryVerificationGuide() {
  return [
    "# Offline verification",
    "",
    "Use Node.js 22 or newer and a checkout of the public `cloudtelecomCN/ct-aicomm` repository.",
    "No credential, private endpoint, or external network connection is required.",
    "",
    "```bash",
    "node scripts/verify-passport-delivery.mjs <delivery-directory>",
    "```",
    "",
    "The verifier checks every SHA-256 entry, exact file membership, the sealed passport context, closed sample accounting, CT-611 unit conversion, nearest-rank percentiles, recomputed statistics, and the byte-for-byte human summary.",
    "A successful result is content-integrity and reproducibility evidence only; it is not authentication, export authorization, independent review, a production performance claim, or certification.",
    ""
  ].join("\n");
}

function verifyContext(input) {
  const run = verifyPassportRunBinding(input.run);
  const freeze = verifyPassportScenarioMethodFreeze(input.freeze);
  if (!Array.isArray(input.observations) || input.observations.length === 0) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, "observations must not be empty");
  }
  const observations = input.observations
    .map((record) => verifyPassportNormalizedObservation({ record, run, freeze }))
    .sort((left, right) => compareText(left.observation_id, right.observation_id));
  const versionInput = { record: input.record, run, freeze, observations };
  if (input.previous_version !== undefined) versionInput.previous_version = input.previous_version;
  const record = verifyPassportEvidenceVersion(versionInput);
  if (record.tenant_id !== run.tenant_id || record.tenant_id !== freeze.tenant_id) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.contextMismatch, "passport, run, and freeze must use one tenant");
  }
  return { record, run, freeze, observations, previousVersion: input.previous_version };
}

function artifact(path, content) {
  const metadata = ARTIFACT_METADATA[path];
  return {
    path,
    media_type: metadata.media_type,
    role: metadata.role,
    sha256: digestText(content),
    bytes: textBytes(content).byteLength
  };
}

function manifestBody(input) {
  return {
    schema_version: PASSPORT_DELIVERY_VERSION,
    record_type: "passport_delivery_manifest",
    delivery_id: input.delivery_id,
    version: input.version,
    tenant_id: input.tenant_id,
    created_at: input.created_at,
    passport_ref: input.passport_ref,
    run_ref: input.run_ref,
    freeze_ref: input.freeze_ref,
    data_origins: input.data_origins,
    statistics_profile: {
      profile_id: PASSPORT_DELIVERY_STATISTICS_PROFILE,
      profile_version: PASSPORT_DELIVERY_VERSION,
      numeric_model: "IEEE-754-binary64-15-significant-digits",
      percentile_method: "nearest-rank",
      sample_order: "observation-id-sequence-sample-id",
      unit_catalog: "ct-passport-observation-unit-rules-v1"
    },
    summary: input.summary,
    artifacts: input.artifacts,
    verification: {
      command: "node scripts/verify-passport-delivery.mjs <delivery-directory>",
      minimum_node_version: "22",
      external_network_required: false,
      credentials_required: false
    },
    boundary: {
      content_integrity_only: true,
      statistics_recomputed: true,
      human_summary_recomputed: true,
      principal_authentication_verified: false,
      export_authorization_verified: false,
      independent_review_verified: false,
      performance_claim_allowed: false,
      certification_issued: false
    }
  };
}

function renderChecksums(files) {
  return `${[...files]
    .sort((left, right) => compareText(left.path, right.path))
    .map(({ path, content }) => `${digestText(content).slice(7)}  ${path}`)
    .join("\n")}\n`;
}

export function createPassportDeliveryPackage(input) {
  exactObject(input, [
    "delivery_id", "version", "created_at", "record", "run", "freeze", "observations", "samples"
  ], ["previous_version"], "input");
  const deliveryId = requireId(input.delivery_id, "input.delivery_id");
  const deliveryVersion = requireSemver(input.version, "input.version");
  const createdAt = canonicalInstant(input.created_at, "input.created_at");
  const context = verifyContext(input);
  const samples = normalizeSamples(input.samples);
  const observationIds = new Set(context.observations.map(({ observation_id: observationId }) => observationId));
  if (samples.some(({ observation_id: observationId }) => !observationIds.has(observationId))) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.contextMismatch, "samples.csv cannot reference an observation outside the sealed passport version");
  }
  const statistics = context.observations.map((observation) => {
    const rows = samples.filter(({ observation_id: observationId }) => observationId === observation.observation_id);
    if (rows.length === 0) fail(PASSPORT_DELIVERY_ERROR_CODES.sampleAccountingMismatch, `${observation.observation_id} has no CSV sample rows`);
    return recomputeStatistic(observation, rows);
  });
  const dataOrigins = [...new Set(context.observations.map(({ source }) => source.origin))].sort();
  const summary = {
    observation_count: context.observations.length,
    sample_count: samples.length,
    statistic_count: statistics.length,
    all_statistics_exact: true,
    statistics
  };
  const observationsDocument = {
    schema_version: PASSPORT_DELIVERY_VERSION,
    record_type: "passport_delivery_observations",
    observations: context.observations
  };
  const contentFiles = [
    { path: "freeze.json", content: jsonText(context.freeze) },
    { path: "observations.json", content: jsonText(observationsDocument) },
    { path: "passport-version.json", content: jsonText(context.record) },
    ...(context.previousVersion === undefined ? [] : [{ path: "previous-version.json", content: jsonText(context.previousVersion) }]),
    { path: "run.json", content: jsonText(context.run) },
    { path: "samples.csv", content: renderPassportDeliverySamplesCsv(samples) }
  ];
  const draftManifest = manifestBody({
    delivery_id: deliveryId,
    version: deliveryVersion,
    tenant_id: context.record.tenant_id,
    created_at: createdAt,
    passport_ref: passportReference(context.record),
    run_ref: runReference(context.run),
    freeze_ref: freezeReference(context.freeze),
    data_origins: dataOrigins,
    summary,
    artifacts: []
  });
  const summaryContent = renderPassportDeliverySummary(draftManifest);
  contentFiles.push(
    { path: "SUMMARY.md", content: summaryContent },
    { path: "VERIFY.md", content: renderPassportDeliveryVerificationGuide() }
  );
  contentFiles.sort((left, right) => compareText(left.path, right.path));
  const body = manifestBody({
    delivery_id: deliveryId,
    version: deliveryVersion,
    tenant_id: context.record.tenant_id,
    created_at: createdAt,
    passport_ref: passportReference(context.record),
    run_ref: runReference(context.run),
    freeze_ref: freezeReference(context.freeze),
    data_origins: dataOrigins,
    summary,
    artifacts: contentFiles.map(({ path, content }) => artifact(path, content))
  });
  const manifest = deepFreeze({ ...body, content_fingerprint: digestText(canonical(body)) });
  const manifestFile = { path: "manifest.json", content: jsonText(manifest) };
  const checksumsFile = { path: "SHA256SUMS", content: renderChecksums([...contentFiles, manifestFile]) };
  const files = [...contentFiles, manifestFile, checksumsFile].sort((left, right) => compareText(left.path, right.path));
  return deepFreeze({ manifest, files });
}

function normalizeFiles(input) {
  exactObject(input, ["files"], [], "input");
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > 16) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, "input.files must contain 1 through 16 files");
  }
  const files = input.files.map((file, index) => {
    exactObject(file, ["path", "content"], [], `input.files[${index}]`);
    const path = requireString(file.path, `input.files[${index}].path`, { max: 128, pattern: SAFE_FILE });
    if (path.includes("..")) fail(PASSPORT_DELIVERY_ERROR_CODES.inputInvalid, `${path} is not a safe flat filename`);
    return { path, content: decodeText(file.content, path) };
  }).sort((left, right) => compareText(left.path, right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.fileSetMismatch, "delivery file paths must be unique");
  }
  return files;
}

function verifyChecksums(filesByPath) {
  const checksumText = filesByPath.get("SHA256SUMS");
  if (checksumText === undefined || !checksumText.endsWith("\n") || checksumText.includes("\r")) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.checksumMismatch, "SHA256SUMS is missing or noncanonical");
  }
  const entries = checksumText.slice(0, -1).split("\n");
  const expectedPaths = [...filesByPath.keys()].filter((path) => path !== "SHA256SUMS").sort();
  const seen = [];
  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(line);
    if (!match || match[2] === "SHA256SUMS" || !filesByPath.has(match[2])) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.checksumMismatch, "SHA256SUMS contains an invalid entry");
    }
    if (digestText(filesByPath.get(match[2])).slice(7) !== match[1]) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.checksumMismatch, `${match[2]} does not match SHA256SUMS`);
    }
    seen.push(match[2]);
  }
  if (!same(seen, expectedPaths)) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.checksumMismatch, "SHA256SUMS does not cover the exact delivery file set in path order");
  }
}

export function verifyPassportDeliveryPackage(input) {
  const files = normalizeFiles(input);
  const filesByPath = new Map(files.map(({ path, content }) => [path, content]));
  const required = [...REQUIRED_CONTENT_FILES, ...CONTROL_FILES].sort();
  const supplied = [...filesByPath.keys()].sort();
  const withoutOptional = supplied.filter((path) => !OPTIONAL_CONTENT_FILES.includes(path));
  if (!same(withoutOptional, required) || supplied.some((path) => !required.includes(path) && !OPTIONAL_CONTENT_FILES.includes(path))) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.fileSetMismatch, "delivery directory does not contain the exact required file set");
  }
  verifyChecksums(filesByPath);
  const manifest = parseJson(filesByPath.get("manifest.json"), "manifest.json");
  if (manifest.schema_version !== PASSPORT_DELIVERY_VERSION || manifest.record_type !== "passport_delivery_manifest") {
    fail(PASSPORT_DELIVERY_ERROR_CODES.manifestMismatch, "manifest.json has an unsupported contract version or record type");
  }
  const observationsDocument = parseJson(filesByPath.get("observations.json"), "observations.json");
  if (observationsDocument.schema_version !== PASSPORT_DELIVERY_VERSION
      || observationsDocument.record_type !== "passport_delivery_observations"
      || !Array.isArray(observationsDocument.observations)) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.contentMismatch, "observations.json has an invalid wrapper");
  }
  const rebuilt = createPassportDeliveryPackage({
    delivery_id: manifest.delivery_id,
    version: manifest.version,
    created_at: manifest.created_at,
    record: parseJson(filesByPath.get("passport-version.json"), "passport-version.json"),
    run: parseJson(filesByPath.get("run.json"), "run.json"),
    freeze: parseJson(filesByPath.get("freeze.json"), "freeze.json"),
    observations: observationsDocument.observations,
    samples: parsePassportDeliverySamplesCsv(filesByPath.get("samples.csv")),
    ...(filesByPath.has("previous-version.json")
      ? { previous_version: parseJson(filesByPath.get("previous-version.json"), "previous-version.json") }
      : {})
  });
  if (!same(manifest, rebuilt.manifest)) {
    fail(PASSPORT_DELIVERY_ERROR_CODES.manifestMismatch, "manifest.json cannot be reproduced from the delivery content");
  }
  const rebuiltByPath = new Map(rebuilt.files.map(({ path, content }) => [path, content]));
  for (const [path, content] of filesByPath) {
    if (rebuiltByPath.get(path) !== content) {
      fail(PASSPORT_DELIVERY_ERROR_CODES.contentMismatch, `${path} is not the canonical reproducible delivery artifact`);
    }
  }
  return deepFreeze({
    valid: true,
    delivery_id: manifest.delivery_id,
    passport_ref: manifest.passport_ref,
    data_origins: manifest.data_origins,
    observation_count: manifest.summary.observation_count,
    sample_count: manifest.summary.sample_count,
    statistic_count: manifest.summary.statistic_count,
    checksums_verified: true,
    statistics_recomputed: true,
    summary_recomputed: true,
    external_network_used: false,
    principal_authentication_verified: false,
    export_authorization_verified: false,
    independent_review_verified: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
}
