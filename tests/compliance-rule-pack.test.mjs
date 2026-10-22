import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  COMPLIANCE_RULE_DOMAINS,
  COMPLIANCE_RULE_PACK_VERSION,
  createComplianceRulePack,
  mapComplianceRulePack,
  validateComplianceRulePack,
  verifyComplianceRulePackUpgrade
} from "../packages/compliance/rule-pack.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const packPaths = [
  "../examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json",
  "../examples/compliance/rule-packs/synthetic-data-boundary-v1.json",
  "../examples/compliance/rule-packs/synthetic-enterprise-baseline-v1.json"
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("validates deterministic synthetic rule packs for all three mapping domains", async () => {
  const domains = new Set();
  for (const relativePath of packPaths) {
    const pack = validateComplianceRulePack(await readJson(relativePath));
    assert.equal(pack.schema_version, COMPLIANCE_RULE_PACK_VERSION);
    assert.equal(pack.data_origin, "synthetic");
    assert.equal(pack.assurance_boundary.mapping_only, true);
    assert.equal(pack.assurance_boundary.legal_conclusion, false);
    assert.equal(pack.assurance_boundary.certification_issued, false);
    assert.equal(pack.assurance_boundary.external_assessment_performed, false);
    pack.mappings.forEach(({ domain }) => domains.add(domain));
  }
  assert.deepEqual([...domains].sort(), [...COMPLIANCE_RULE_DOMAINS].sort());
});

test("rejects content tampering and unknown fields", async () => {
  const pack = await readJson(packPaths[0]);
  assert.throws(() => validateComplianceRulePack({ ...pack, title: `${pack.title} changed` }), { code: "rule_pack_fingerprint_mismatch" });
  const { pack_fingerprint: ignored, ...payload } = pack;
  assert.throws(() => createComplianceRulePack({ ...payload, certification: "approved" }), { code: "compliance_rule_pack_field_unknown" });
});

test("requires a strict semantic-version upgrade chain bound to the previous fingerprint", async () => {
  const previous = validateComplianceRulePack(await readJson(packPaths[2]));
  const { pack_fingerprint: ignored, ...payload } = previous;
  const next = createComplianceRulePack({
    ...payload,
    pack_version: "1.1.0",
    published_at: "2026-11-01T00:00:00.000Z",
    effective_from: "2026-11-15T00:00:00.000Z",
    supersedes: { pack_id: previous.pack_id, pack_version: previous.pack_version, pack_fingerprint: previous.pack_fingerprint }
  });
  const result = verifyComplianceRulePackUpgrade(previous, next);
  assert.deepEqual({ valid: result.valid, previous: result.previous_version, next: result.next_version }, { valid: true, previous: "1.0.0", next: "1.1.0" });
  const broken = createComplianceRulePack({ ...payload, pack_version: "1.1.0", published_at: "2026-11-01T00:00:00.000Z", effective_from: "2026-11-15T00:00:00.000Z", supersedes: null });
  assert.throws(() => verifyComplianceRulePackUpgrade(previous, broken), { code: "rule_pack_upgrade_chain_mismatch" });
});

test("maps observed evidence without producing legal or certification conclusions", async () => {
  const pack = await readJson(packPaths[2]);
  const observations = await readJson("../examples/compliance/synthetic-control-observations.json");
  const evaluatedAt = new Date("2026-10-22T12:00:00.000Z");
  const options = { expectedSubject: observations.subject, evaluatedAt };
  const report = mapComplianceRulePack(pack, observations, options);
  const repeated = mapComplianceRulePack(pack, observations, options);
  assert.equal(report.status, "mapped_with_gaps");
  assert.deepEqual(report.counts, { total: 3, evidence_present: 1, evidence_missing: 1, not_evaluated: 1 });
  assert.equal(report.mapping_only, true);
  assert.equal(report.legal_conclusion, false);
  assert.equal(report.certification_issued, false);
  assert.equal(report.external_assessment_performed, false);
  assert.equal(report.report_fingerprint, repeated.report_fingerprint);
  assert.match(report.report_fingerprint, /^sha256:[a-f0-9]{64}$/u);
});

test("does not allow a mapping input to self-assert another tenant context", async () => {
  const pack = await readJson(packPaths[1]);
  const observations = await readJson("../examples/compliance/synthetic-control-observations.json");
  assert.throws(() => mapComplianceRulePack(pack, observations, {
    expectedSubject: { ...observations.subject, tenant_id: "another-tenant" },
    evaluatedAt: new Date("2026-10-22T12:00:00.000Z")
  }), { code: "rule_mapping_tenant_id_mismatch" });
});

test("offline CLI reports mapping metadata and preserves the non-certification boundary", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/validate-compliance-rule-pack.mjs", "examples/compliance/rule-packs/synthetic-mlps-preparation-v1.json"], { cwd: root });
  const output = JSON.parse(stdout);
  assert.equal(output.valid, true);
  assert.deepEqual(output.domains, ["mlps"]);
  assert.equal(output.mapping_only, true);
  assert.equal(output.certification_issued, false);
});

test("publishes closed rule-pack, observation, and mapping-report schemas", async () => {
  for (const relativePath of [
    "../specs/compliance/compliance-rule-pack-v1.schema.json",
    "../specs/compliance/compliance-control-observation-v1.schema.json",
    "../specs/compliance/compliance-rule-mapping-report-v1.schema.json"
  ]) {
    const schema = await readJson(relativePath);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
  }
});
