import { pathToFileURL } from "node:url";

import {
  createPassportDeliveryPackage,
  verifyPassportDeliveryPackage
} from "../../packages/link-evidence-passport/delivery.mjs";
import { buildSyntheticPassportVersioningScenario } from "./sealing-versioning-synthetic.mjs";

function includedRows(observationId, values) {
  return values.map((value, index) => ({
    observation_id: observationId,
    sample_id: `${observationId}-sample-${String(index + 1).padStart(2, "0")}`,
    sequence: index + 1,
    disposition: "included",
    value,
    unit: "ms",
    reason_code: null,
    reason_stage: null
  }));
}

export function buildSyntheticPassportDeliveryScenario() {
  const scenario = buildSyntheticPassportVersioningScenario();
  const partialId = scenario.partialObservation.observation_id;
  const validId = scenario.validObservation.observation_id;
  const samples = [
    ...includedRows(partialId, [20, 24, 28, 32, 36, 40, 44, 46]),
    {
      observation_id: partialId,
      sample_id: `${partialId}-sample-09`,
      sequence: 9,
      disposition: "excluded",
      value: null,
      unit: null,
      reason_code: "exclude-warmup",
      reason_stage: null
    },
    {
      observation_id: partialId,
      sample_id: `${partialId}-sample-10`,
      sequence: 10,
      disposition: "failed",
      value: null,
      unit: null,
      reason_code: "synthetic_timeout",
      reason_stage: "synthetic-request"
    },
    ...includedRows(validId, [23, 25, 27, 29, 31, 33, 35, 37, 39, 41])
  ];
  const delivery = createPassportDeliveryPackage({
    delivery_id: "passport-delivery-ct614-synthetic",
    version: "1.0.0",
    created_at: "2026-10-23T11:05:00.000Z",
    record: scenario.replacement,
    previous_version: scenario.initial,
    run: scenario.started,
    freeze: scenario.freeze,
    observations: [scenario.partialObservation, scenario.validObservation],
    samples
  });
  const verification = verifyPassportDeliveryPackage({ files: delivery.files });
  return { ...scenario, samples, delivery, verification };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = buildSyntheticPassportDeliveryScenario();
  const paths = scenario.delivery.files.map(({ path }) => path);
  console.log(JSON.stringify({
    schema_version: scenario.delivery.manifest.schema_version,
    data_origin: scenario.delivery.manifest.data_origins[0],
    json_delivered: paths.includes("passport-version.json") && paths.includes("observations.json"),
    csv_delivered: paths.includes("samples.csv"),
    human_summary_delivered: paths.includes("SUMMARY.md"),
    offline_steps_delivered: paths.includes("VERIFY.md"),
    checksums_verified: scenario.verification.checksums_verified,
    statistics_recomputed: scenario.verification.statistics_recomputed,
    summary_recomputed: scenario.verification.summary_recomputed,
    observation_count: scenario.verification.observation_count,
    sample_count: scenario.verification.sample_count,
    p95_recomputed: scenario.delivery.manifest.summary.statistics.some(({ aggregation, recomputed_value: value }) => aggregation === "p95" && value === 46),
    mean_recomputed: scenario.delivery.manifest.summary.statistics.some(({ aggregation, recomputed_value: value }) => aggregation === "mean" && value === 32),
    external_network_used: scenario.verification.external_network_used,
    principal_authentication_verified: scenario.verification.principal_authentication_verified,
    export_authorization_verified: scenario.verification.export_authorization_verified,
    independent_review_verified: scenario.verification.independent_review_verified,
    performance_claim_allowed: scenario.verification.performance_claim_allowed,
    certification_issued: scenario.verification.certification_issued
  }));
}
