import { createHash } from "node:crypto";

export const ORIGIN_PRESENTATION = Object.freeze({
  synthetic: Object.freeze({ label: "Synthetic demonstration", label_zh: "合成演示", claimable: false }),
  hybrid: Object.freeze({ label: "Partially measured", label_zh: "半真实测量", claimable: false }),
  measured: Object.freeze({ label: "Measured evidence", label_zh: "真实测量", claimable: true })
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validateEvidenceSample(sample) {
  if (!sample || typeof sample !== "object") fail("invalid_sample", "sample must be an object");
  const presentation = ORIGIN_PRESENTATION[sample.data_origin];
  if (!presentation) fail("origin_missing_or_invalid", "data_origin must be synthetic, hybrid, or measured");
  if (!sample.evidence || typeof sample.evidence !== "object") fail("evidence_missing", "evidence is required");
  if (!sample.evidence.measurement_scope?.trim()) fail("measurement_scope_missing", "measurement_scope is required");
  if (!Array.isArray(sample.evidence.limitations)) fail("limitations_missing", "limitations must be an array");
  if (!/^sha256:[a-f0-9]{64}$/.test(sample.evidence.environment_fingerprint ?? "")) fail("environment_fingerprint_invalid", "a prefixed SHA-256 environment fingerprint is required");
  if (!/^[a-f0-9]{64}$/.test(sample.evidence.raw_record_sha256 ?? "")) fail("raw_record_hash_invalid", "raw_record_sha256 is required");
  if (!sample.evidence.methodology_version || !sample.evidence.collector_version) fail("provenance_incomplete", "methodology and collector versions are required");
  if (sample.data_origin !== "measured" && sample.evidence.limitations.length === 0) fail("limitations_required", "synthetic and hybrid evidence must declare at least one limitation");
  if (sample.data_origin === "measured") {
    const sources = Object.values(sample.segments?.segment_sources ?? {});
    if (!sources.includes("measured")) fail("measured_signal_missing", "measured evidence must contain at least one measured timing");
  }
  return { origin: sample.data_origin, presentation };
}

export function partitionEvidence(samples) {
  const partitions = { synthetic: [], hybrid: [], measured: [] };
  for (const sample of samples) {
    const { origin } = validateEvidenceSample(sample);
    partitions[origin].push(sample);
  }
  return partitions;
}

export function assertSingleOrigin(samples) {
  const origins = new Set(samples.map((sample) => validateEvidenceSample(sample).origin));
  if (origins.size !== 1) fail("mixed_origin_aggregation", "samples from different origins cannot be aggregated");
  return origins.values().next().value;
}

export function createExportManifest(samples) {
  if (!Array.isArray(samples) || samples.length === 0) fail("empty_export", "at least one sample is required");
  const origin = assertSingleOrigin(samples);
  const presentation = ORIGIN_PRESENTATION[origin];
  return {
    schema_version: "1.0.0",
    data_origin: origin,
    display_label: presentation.label,
    display_label_zh: presentation.label_zh,
    performance_claim_allowed: presentation.claimable,
    sample_count: samples.length,
    sample_ids: samples.map(({ sample_id }) => sample_id),
    payload_sha256: sha256(samples)
  };
}
