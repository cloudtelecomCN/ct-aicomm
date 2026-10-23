import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import * as sdk from "../sdk/index.mjs";
import { buildSyntheticPassportVersioningScenario } from "../examples/passport/sealing-versioning-synthetic.mjs";
import {
  PASSPORT_VERSIONING_ERROR_CODES,
  PASSPORT_VERSIONING_VERSION,
  PASSPORT_VERSION_STATES,
  createPassportEvidenceVersion,
  createPassportReplacementVersion,
  createPassportVersionTerminalEvent,
  projectPassportEvidenceVersion,
  verifyPassportEvidenceVersion,
  verifyPassportVersionTerminalEvent
} from "../packages/link-evidence-passport/versioning.mjs";

const execute = promisify(execFile);
const hash = (value) => `sha256:${value.repeat(64)}`;
const assertCode = (code) => (error) => error?.code === code;

test("seals exact observations into an immutable origin-separated passport version", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  const version = scenario.initial;
  assert.equal(version.schema_version, PASSPORT_VERSIONING_VERSION);
  assert.deepEqual(PASSPORT_VERSION_STATES, ["sealed", "expired", "superseded", "revoked"]);
  assert.equal(version.observation_sets.length, 1);
  assert.equal(version.observation_sets[0].origin, "synthetic");
  assert.equal(version.observation_sets[0].observation_refs.length, 1);
  assert.equal(version.status_seed.measurement_validity, "partial");
  assert.equal(version.status_seed.content_integrity, "passed");
  assert.equal(version.status_seed.independent_review, "not-reviewed");
  assert.equal(version.status_seed.freshness, "valid");
  assert.equal(version.status_seed.policy_decision, "manual-review");
  assert.equal(version.valid_until, "2026-10-23T11:20:10.000Z");
  assert.ok(Object.isFrozen(version));
  assert.equal(
    verifyPassportEvidenceVersion({
      record: version,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.partialObservation]
    }).content_fingerprint,
    version.content_fingerprint
  );
});

test("rejects premature, empty, duplicate, and authorization-overrun seals", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  const base = {
    passport_id: "passport-ct612-negative",
    version: "1.0.0",
    tenant_id: scenario.started.tenant_id,
    created_by: "principal-synthetic-publisher",
    sealed_at: "2026-10-23T10:20:10.000Z",
    freshness_ttl_seconds: 3600,
    run: scenario.started,
    freeze: scenario.freeze,
    observations: [scenario.partialObservation]
  };
  assert.throws(
    () => createPassportEvidenceVersion({ ...base, sealed_at: "2026-10-23T10:19:59.000Z" }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid)
  );
  assert.throws(
    () => createPassportEvidenceVersion({ ...base, observations: [] }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.observationRequired)
  );
  assert.throws(
    () => createPassportEvidenceVersion({ ...base, observations: [scenario.partialObservation, scenario.partialObservation] }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.duplicateObservation)
  );
  assert.throws(
    () => createPassportEvidenceVersion({
      ...base,
      sealed_at: "2026-10-23T10:31:00.000Z",
      freshness_ttl_seconds: 31536000
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.timeInvalid)
  );
});

test("detects content, status, and observation-set tampering", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  const fingerprintTamper = structuredClone(scenario.initial);
  fingerprintTamper.content_fingerprint = hash("9");
  assert.throws(
    () => verifyPassportEvidenceVersion({
      record: fingerprintTamper,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.partialObservation]
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.fingerprintMismatch)
  );
  const inheritedStatus = structuredClone(scenario.initial);
  inheritedStatus.status_seed.independent_review = "consistent";
  assert.throws(
    () => verifyPassportEvidenceVersion({
      record: inheritedStatus,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.partialObservation]
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.statusInvalid)
  );
  assert.throws(
    () => verifyPassportEvidenceVersion({
      record: scenario.initial,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.validObservation]
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.contextMismatch)
  );
});

test("requires exact increasing replacement lineage and resets review and freshness", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  assert.equal(scenario.replacement.supersedes_ref.content_fingerprint, scenario.initial.content_fingerprint);
  assert.equal(scenario.replacement.status_seed.independent_review, "not-reviewed");
  assert.equal(scenario.replacement.status_seed.freshness, "valid");
  assert.equal(scenario.replacement.status_seed.policy_decision, "manual-review");
  assert.equal(scenario.replacement.boundary.review_inherited, false);
  assert.equal(scenario.replacement.boundary.freshness_inherited, false);
  assert.equal(scenario.replacement.valid_until, "2026-10-23T12:21:00.000Z");
  assert.throws(
    () => createPassportReplacementVersion({
      previous_version: scenario.initial,
      version: "1.0.0",
      created_by: "principal-synthetic-publisher",
      sealed_at: "2026-10-23T10:22:00.000Z",
      freshness_ttl_seconds: 7200,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.partialObservation]
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.lineageInvalid)
  );
  assert.throws(
    () => createPassportEvidenceVersion({
      passport_id: "passport-ct612-forged-status",
      version: "1.0.0",
      tenant_id: scenario.started.tenant_id,
      created_by: "principal-synthetic-publisher",
      sealed_at: "2026-10-23T10:22:00.000Z",
      freshness_ttl_seconds: 7200,
      run: scenario.started,
      freeze: scenario.freeze,
      observations: [scenario.partialObservation],
      independent_review: "consistent"
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.fieldUnknown)
  );
});

test("records supersession, revocation, and expiry as immutable terminal events", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  assert.equal(scenario.supersededEvent.to_state, "superseded");
  assert.equal(scenario.supersededEvent.reason_code, "replacement_published");
  assert.equal(scenario.supersededEvent.replacement_ref.content_fingerprint, scenario.replacement.content_fingerprint);
  assert.equal(scenario.supersededEvent.boundary.source_mutated, false);
  assert.equal(
    verifyPassportVersionTerminalEvent({
      event: scenario.supersededEvent,
      version: scenario.initial,
      replacement_version: scenario.replacement
    }).content_fingerprint,
    scenario.supersededEvent.content_fingerprint
  );

  const revoked = createPassportVersionTerminalEvent({
    event_id: "passport-event-ct612-revoked",
    version: scenario.replacement,
    to_state: "revoked",
    reason_detail: "Synthetic operator revocation for contract coverage.",
    occurred_at: "2026-10-23T10:30:00.000Z",
    actor: { actor_id: "principal-synthetic-operator", actor_role: "operator" },
    replacement_version: null
  });
  assert.equal(revoked.reason_code, "revocation_authorized");
  assert.equal(revoked.replacement_ref, null);

  const expired = createPassportVersionTerminalEvent({
    event_id: "passport-event-ct612-expired",
    version: scenario.replacement,
    to_state: "expired",
    reason_detail: "Synthetic version validity elapsed.",
    occurred_at: scenario.replacement.valid_until,
    actor: { actor_id: "passport-expiry-service", actor_role: "system" },
    replacement_version: null
  });
  assert.equal(expired.reason_code, "validity_elapsed");
  assert.throws(
    () => createPassportVersionTerminalEvent({
      event_id: "passport-event-ct612-late-revoke",
      version: scenario.replacement,
      to_state: "revoked",
      reason_detail: "A late revocation cannot replace expiry.",
      occurred_at: scenario.replacement.valid_until,
      actor: { actor_id: "principal-synthetic-operator", actor_role: "operator" },
      replacement_version: null
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.terminalEventInvalid)
  );
});

test("projects terminal events and fails closed on expiry without delivery", () => {
  const scenario = buildSyntheticPassportVersioningScenario();
  assert.equal(scenario.initialProjection.lifecycle_state, "superseded");
  assert.equal(scenario.initialProjection.active, false);
  assert.equal(scenario.replacementProjection.lifecycle_state, "sealed");
  assert.equal(scenario.replacementProjection.active, true);
  assert.equal(scenario.expiredProjection.lifecycle_state, "expired");
  assert.equal(scenario.expiredProjection.status_axes.freshness, "expired");
  assert.equal(scenario.expiredProjection.invalidation_reason, "validity_elapsed");
  assert.equal(scenario.expiredProjection.terminal_event_ref, null);
  assert.throws(
    () => projectPassportEvidenceVersion({
      version: scenario.initial,
      events: [
        { event: scenario.supersededEvent, replacement_version: scenario.replacement },
        { event: scenario.supersededEvent, replacement_version: scenario.replacement }
      ],
      evaluated_at: "2026-10-23T10:21:02.000Z"
    }),
    assertCode(PASSPORT_VERSIONING_ERROR_CODES.eventHistoryInvalid)
  );
});

test("publishes strict schemas, SDK exports, bilingual guidance, and the offline scenario", async () => {
  const [versionSchema, eventSchema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/evidence-version-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/passport/version-terminal-event-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/sealing-versioning-and-terminal-status-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/sealing-versioning-and-terminal-status-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/versioning.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(versionSchema.additionalProperties, false);
  assert.equal(versionSchema.properties.record_type.const, "passport_evidence_version");
  assert.equal(eventSchema.additionalProperties, false);
  assert.equal(eventSchema.properties.record_type.const, "passport_version_terminal_event");
  assert.equal(publicApi.sdk_version, "0.25.0");
  for (const contract of [
    "specs/passport/evidence-version-v1.schema.json",
    "specs/passport/version-terminal-event-v1.schema.json"
  ]) assert.ok(publicApi.public_contracts.includes(contract), contract);
  for (const exported of [
    "PASSPORT_VERSIONING_VERSION",
    "PASSPORT_VERSION_STATES",
    "PASSPORT_VERSIONING_ERROR_CODES",
    "createPassportEvidenceVersion",
    "createPassportReplacementVersion",
    "verifyPassportEvidenceVersion",
    "createPassportVersionTerminalEvent",
    "verifyPassportVersionTerminalEvent",
    "projectPassportEvidenceVersion"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /never inherits.*review conclusion.*freshness/is);
  assert.match(chinese, /不会继承.*复核结论、新鲜度/s);
  assert.ok(environment.contract_tests.includes("tests/passport-sealing-versioning.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-sealing-versioning"));
});

test("runs the CT-612 example offline with explicit synthetic and non-claim boundaries", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/sealing-versioning-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    initial_state: "superseded",
    replacement_state: "sealed",
    expiry_fail_closed: true,
    immutable_versions: true,
    exact_supersession_link: true,
    review_inherited: false,
    freshness_inherited: false,
    replacement_review_status: "not-reviewed",
    replacement_freshness_status: "valid",
    terminal_event_append_only: true,
    source_version_mutated: false,
    external_network_used: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
});
