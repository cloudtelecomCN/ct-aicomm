import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  computeRequirementPassportDigest,
  validateRequirementPassport,
} from "../packages/advisor/requirement-passport.mjs";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("publishes strict Requirement Passport and field-registry schemas", async () => {
  const [passportSchema, registrySchema] = await Promise.all([
    readJson("../specs/advisor/requirement-passport-v2.schema.json"),
    readJson("../specs/advisor/requirement-field-registry-v2.schema.json"),
  ]);
  assert.equal(passportSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(registrySchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(passportSchema.additionalProperties, false);
  assert.equal(registrySchema.additionalProperties, false);
  assert.equal(passportSchema.properties.boundaries.properties.execution_authorized.const, false);
  assert.equal(passportSchema.properties.boundaries.properties.performance_claim_allowed.const, false);
});

test("binds every task template to known fields and canonical units", async () => {
  const [registry, tasks] = await Promise.all([
    readJson("../examples/advisor/requirement-field-registry-v2.json"),
    readJson("../examples/advisor/task-template-registry-v1.json"),
  ]);
  const unitCodes = new Set(registry.units.map(({ code }) => code));
  const fieldIds = new Set();
  for (const field of registry.fields) {
    assert.equal(fieldIds.has(field.field_id), false);
    fieldIds.add(field.field_id);
    assert.ok(field.allowed_units.every((unit) => unitCodes.has(unit)));
  }
  assert.deepEqual(
    registry.template_profiles.map(({ template_id }) => template_id).sort(),
    tasks.templates.map(({ template_id }) => template_id).sort(),
  );
  for (const profile of registry.template_profiles) {
    assert.equal(new Set([...profile.required_fields, ...profile.optional_fields]).size, profile.required_fields.length + profile.optional_fields.length);
    assert.ok([...profile.required_fields, ...profile.optional_fields].every((fieldId) => fieldIds.has(fieldId)));
  }
});

test("verifies one complete synthetic frozen Passport for every template", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/requirement-field-registry-v2.json"),
    readJson("../examples/advisor/synthetic-requirement-passports-v2.json"),
  ]);
  assert.equal(bundle.data_origin, "synthetic");
  assert.equal(bundle.performance_claim_allowed, false);
  assert.equal(bundle.fixtures.length, registry.template_profiles.length);
  const templates = new Set();
  for (const passport of bundle.fixtures) {
    const result = validateRequirementPassport(passport, registry);
    assert.equal(result.valid, true);
    assert.equal(result.state, "frozen");
    assert.equal(result.required_fields_complete, true);
    assert.equal(result.digest_verified, true);
    assert.equal(result.execution_authorized, false);
    assert.equal(passport.content_sha256, computeRequirementPassportDigest(passport));
    templates.add(passport.task_template.id);
  }
  assert.deepEqual([...templates].sort(), registry.template_profiles.map(({ template_id }) => template_id).sort());
});

test("rejects tampering, invalid units, duplicate fields, and incomplete freezes", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/requirement-field-registry-v2.json"),
    readJson("../examples/advisor/synthetic-requirement-passports-v2.json"),
  ]);
  const base = bundle.fixtures[0];

  const tampered = structuredClone(base);
  tampered.fields[0].value = "modified-model";
  assert.throws(() => validateRequirementPassport(tampered, registry), (error) => error.code === "requirement_digest_mismatch");

  const invalidUnit = structuredClone(base);
  invalidUnit.fields.find(({ field_id }) => field_id === "performance.ttft_target").unit = "seconds";
  assert.throws(() => validateRequirementPassport(invalidUnit, registry), (error) => error.code === "requirement_unit_invalid");

  const duplicate = structuredClone(base);
  duplicate.fields.push(structuredClone(duplicate.fields[0]));
  assert.throws(() => validateRequirementPassport(duplicate, registry), (error) => error.code === "requirement_field_duplicate");

  const incomplete = structuredClone(base);
  incomplete.fields = incomplete.fields.filter(({ field_id }) => field_id !== "budget.monthly_limit");
  incomplete.content_sha256 = computeRequirementPassportDigest(incomplete);
  assert.throws(() => validateRequirementPassport(incomplete, registry), (error) => error.code === "requirement_required_field_missing");
});

test("allows explicit unknowns in drafts without inventing values", async () => {
  const [registry, bundle] = await Promise.all([
    readJson("../examples/advisor/requirement-field-registry-v2.json"),
    readJson("../examples/advisor/synthetic-requirement-passports-v2.json"),
  ]);
  const draft = structuredClone(bundle.fixtures[0]);
  draft.state = "draft";
  draft.revision = 3;
  draft.frozen_at = null;
  draft.content_sha256 = null;
  const budget = draft.fields.find(({ field_id }) => field_id === "budget.monthly_limit");
  budget.status = "unknown";
  budget.value = null;
  budget.source = { kind: "unknown", confidence: "unknown", observed_at: "2026-10-23T00:00:00.000Z" };
  const result = validateRequirementPassport(draft, registry);
  assert.equal(result.valid, true);
  assert.equal(result.required_fields_complete, false);
  assert.equal(result.digest_verified, false);
});

test("keeps bilingual Requirement Passport documentation aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(new URL("../docs/advisor/requirement-passport-v2.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/advisor/requirement-passport-v2.zh-CN.md", import.meta.url), "utf8"),
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /Requirement Passport 2\.0/);
    assert.match(document, /sha256|SHA-256/);
    assert.match(document, /synthetic|合成/);
    assert.match(document, /execution|执行/);
  }
});
