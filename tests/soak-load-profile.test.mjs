import assert from "node:assert/strict";
import test from "node:test";
import { validateSoakLoadProfile, workloadFromSoakLoadProfile } from "../packages/qa/soak-load-profile.mjs";

const profile = Object.freeze({
  schema_version: "1.0.0",
  id: "ct-581-seven-day-v1",
  stage: "seven_day",
  cadence_seconds: 900,
  concurrency: Object.freeze([1, 8, 32, 64]),
  samples_per_stratum: 64,
  repetitions: 1,
  topologies: Object.freeze(["single-endpoint", "all-endpoints"]),
});

test("normalizes a stage-bound CT-581 load profile", () => {
  assert.equal(validateSoakLoadProfile(profile, "seven_day"), true);
  assert.deepEqual(workloadFromSoakLoadProfile(profile, "seven_day"), {
    cadence_seconds: 900,
    concurrency_levels: [1, 8, 32, 64],
    samples_per_stratum: 64,
    repetitions: 1,
  });
});

test("rejects mismatched stages, duplicate concurrency, and incomplete topology coverage", () => {
  assert.throws(() => validateSoakLoadProfile(profile, "preflight"), { code: "soak_profile_stage_mismatch" });
  assert.throws(() => validateSoakLoadProfile({ ...profile, concurrency: [1, 8, 8] }), { code: "soak_profile_concurrency_duplicate" });
  assert.throws(() => validateSoakLoadProfile({ ...profile, topologies: ["single-endpoint"] }), { code: "soak_profile_topologies_invalid" });
});

test("requires enough samples for the highest declared concurrency", () => {
  assert.throws(() => validateSoakLoadProfile({ ...profile, samples_per_stratum: 32 }), { code: "soak_profile_samples_invalid" });
});
