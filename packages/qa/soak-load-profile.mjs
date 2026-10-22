const STAGES = new Set(["preflight", "seven_day", "thirty_day"]);
const TOPOLOGIES = Object.freeze(["single-endpoint", "all-endpoints"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail("soak_profile_integer_invalid", `${field} must be a positive integer`);
  return value;
}

export function validateSoakLoadProfile(input, expectedStage = undefined) {
  if (input?.schema_version !== "1.0.0") fail("soak_profile_schema_invalid", "load profile schema_version must be 1.0.0");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(input.id ?? "")) fail("soak_profile_id_invalid", "load profile id must be stable and lowercase");
  if (!STAGES.has(input.stage)) fail("soak_profile_stage_invalid", `unsupported load profile stage: ${input.stage}`);
  if (expectedStage !== undefined && input.stage !== expectedStage) fail("soak_profile_stage_mismatch", "load profile stage does not match the requested soak stage");
  positiveInteger(input.cadence_seconds, "load profile cadence_seconds");
  positiveInteger(input.samples_per_stratum, "load profile samples_per_stratum");
  positiveInteger(input.repetitions, "load profile repetitions");
  if (input.repetitions > 20) fail("soak_profile_repetitions_invalid", "load profile repetitions cannot exceed 20");
  if (!Array.isArray(input.concurrency) || !input.concurrency.length || input.concurrency.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 256)) {
    fail("soak_profile_concurrency_invalid", "load profile concurrency must contain integers between 1 and 256");
  }
  if (new Set(input.concurrency).size !== input.concurrency.length) fail("soak_profile_concurrency_duplicate", "load profile concurrency contains duplicate levels");
  if (input.samples_per_stratum < Math.max(...input.concurrency)) fail("soak_profile_samples_invalid", "load profile samples must cover the highest concurrency level");
  if (!Array.isArray(input.topologies) || input.topologies.length !== TOPOLOGIES.length || input.topologies.some((value, index) => value !== TOPOLOGIES[index])) {
    fail("soak_profile_topologies_invalid", `load profile topologies must be ${TOPOLOGIES.join(",")}`);
  }
  return true;
}

export function workloadFromSoakLoadProfile(input, expectedStage = undefined) {
  validateSoakLoadProfile(input, expectedStage);
  return Object.freeze({
    cadence_seconds: input.cadence_seconds,
    concurrency_levels: Object.freeze([...input.concurrency]),
    samples_per_stratum: input.samples_per_stratum,
    repetitions: input.repetitions,
  });
}
