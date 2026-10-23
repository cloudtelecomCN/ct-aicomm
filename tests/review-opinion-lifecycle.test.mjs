import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/independent-run-review/opinion.mjs";
import {
  INDEPENDENT_REVIEW_OPINION_ERROR_CODES,
  INDEPENDENT_REVIEW_OPINION_EVENT_TYPES,
  INDEPENDENT_REVIEW_OPINION_OUTCOMES,
  createIndependentReviewOpinion,
  createIndependentReviewOpinionEvent,
  createIndependentReviewOpinionLifecycle,
  projectIndependentReviewOpinion,
  verifyIndependentReviewOpinionLifecycle
} from "../packages/independent-run-review/opinion.mjs";
import { buildSyntheticReviewOpinionLifecycleScenario } from "../examples/review/opinion-lifecycle-synthetic.mjs";

const execute = promisify(execFile);

function context(scenario, recalculation = scenario.consistent) {
  return {
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    recalculation
  };
}

function eventInput(scenario, overrides = {}) {
  return {
    event_id: "opinion-event-ct620-test",
    version: "1.0.0",
    event_type: "appeal-filed",
    occurred_at: "2026-10-23T12:14:00.000Z",
    actor: {
      subject_id: "commissioner-ct616",
      organization_id: "buyer-org-alpha",
      role: "evidence-submitter"
    },
    reason: "The submitter requests a bounded review of the current finding.",
    opinion: scenario.consistentOpinion,
    events: [],
    appeal_id: "appeal-ct620-test",
    requested_remedy: "correct",
    ...context(scenario),
    ...overrides
  };
}

test("exports one closed CT-620 opinion and lifecycle API", () => {
  assert.deepEqual(INDEPENDENT_REVIEW_OPINION_OUTCOMES, ["consistent", "deviation", "uncertain"]);
  assert.deepEqual(INDEPENDENT_REVIEW_OPINION_EVENT_TYPES, [
    "appeal-filed",
    "appeal-resolved",
    "correction-issued",
    "withdrawal-issued"
  ]);
  assert.equal(Object.isFrozen(INDEPENDENT_REVIEW_OPINION_OUTCOMES), true);
  assert.equal(typeof sdk.createIndependentReviewOpinion, "function");
  assert.equal(typeof sdk.createIndependentReviewOpinionEvent, "function");
  assert.equal(typeof sdk.createIndependentReviewOpinionLifecycle, "function");
  assert.equal(typeof sdk.verifyIndependentReviewOpinionLifecycle, "function");
});

test("derives consistent, deviation, and uncertain without caller-supplied findings", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.equal(scenario.consistentOpinion.finding.outcome, "consistent");
  assert.equal(scenario.deviationOpinion.finding.outcome, "deviation");
  assert.equal(scenario.uncertainOpinion.finding.outcome, "uncertain");
  assert.deepEqual(scenario.uncertainOpinion.finding.reason_codes, ["later-execution-environment-unknown"]);
  assert.equal(scenario.uncertainOpinion.finding.historical_state_reproduced, false);
  assert.throws(() => createIndependentReviewOpinion({
    opinion_id: "opinion-caller-outcome",
    version: "1.0.0",
    created_by: "opinion-signer-ct617",
    issued_at: "2026-10-23T12:13:00.000Z",
    outcome: "consistent",
    ...context(scenario)
  }), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fieldUnknown);
});

test("requires the exact eligible CT-617 opinion signer", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.throws(() => createIndependentReviewOpinion({
    opinion_id: "opinion-submitter-signed",
    version: "1.0.0",
    created_by: "commissioner-ct616",
    issued_at: "2026-10-23T12:13:00.000Z",
    ...context(scenario)
  }), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized);
  assert.equal(scenario.consistentOpinion.signer.subject_id, "opinion-signer-ct617");
  assert.equal(scenario.consistentOpinion.boundary.reviewer_independence_certified, false);
});

test("records appeals without modifying the current finding", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  const appeal = scenario.events[0];
  const projection = projectIndependentReviewOpinion({
    opinion: scenario.consistentOpinion,
    events: [appeal]
  });
  assert.equal(appeal.event_type, "appeal-filed");
  assert.equal(appeal.boundary.finding_modified, false);
  assert.equal(projection.status, "under-appeal");
  assert.equal(projection.current_finding.finding_fingerprint, scenario.consistentOpinion.finding.finding_fingerprint);
});

test("keeps the original opinion and complete correction and withdrawal history", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.equal(scenario.lifecycle.opinion.finding.outcome, "consistent");
  assert.equal(scenario.lifecycle.events.length, 6);
  assert.equal(scenario.lifecycle.projection.current_finding.outcome, "deviation");
  assert.equal(scenario.lifecycle.projection.status, "withdrawn");
  assert.equal(scenario.lifecycle.projection.correction_count, 1);
  assert.equal(scenario.lifecycle.projection.appeal_count, 2);
  assert.equal(scenario.lifecycle.projection.history_complete, true);
  assert.equal(scenario.lifecycle.boundary.original_opinion_retained, true);
  assert.deepEqual(scenario.verifiedLifecycle, scenario.lifecycle);
  for (let index = 0; index < scenario.events.length; index += 1) {
    assert.equal(scenario.events[index].sequence, index + 1);
    assert.equal(
      scenario.events[index].previous_event_fingerprint,
      index === 0 ? null : scenario.events[index - 1].content_fingerprint
    );
  }
});

test("prevents evidence submitters and sales from modifying findings", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  const prior = scenario.events.slice(0, 2);
  for (const actor of [
    { subject_id: "commissioner-ct616", organization_id: "buyer-org-alpha", role: "evidence-submitter" },
    { subject_id: "sales-observer-ct620", organization_id: "buyer-org-alpha", role: "sales" }
  ]) {
    assert.throws(() => createIndependentReviewOpinionEvent(eventInput(scenario, {
      event_id: `forbidden-${actor.role}`,
      event_type: "correction-issued",
      occurred_at: "2026-10-23T12:16:00.000Z",
      actor,
      reason: "This interested role attempts to change the current finding.",
      events: prior,
      appeal_id: "appeal-ct620-correction",
      requested_remedy: undefined,
      replacement_source: { recalculation: scenario.deviation }
    })), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized);
  }
});

test("rejects a correction without a resolved correction-required appeal", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.throws(() => createIndependentReviewOpinionEvent(eventInput(scenario, {
    event_id: "correction-without-appeal",
    event_type: "correction-issued",
    occurred_at: "2026-10-23T12:14:00.000Z",
    actor: scenario.consistentOpinion.signer,
    reason: "The signer attempts a correction without the required appeal history.",
    events: [],
    appeal_id: "missing-appeal",
    requested_remedy: undefined,
    replacement_source: { recalculation: scenario.deviation }
  })), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid);
});

test("rejects no-op corrections and all events after withdrawal", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.throws(() => createIndependentReviewOpinionEvent(eventInput(scenario, {
    event_id: "no-op-correction",
    event_type: "correction-issued",
    occurred_at: "2026-10-23T12:16:00.000Z",
    actor: scenario.consistentOpinion.signer,
    reason: "The signer attempts to reuse the current source as a correction.",
    events: scenario.events.slice(0, 2),
    appeal_id: "appeal-ct620-correction",
    requested_remedy: undefined,
    replacement_source: { recalculation: scenario.consistent }
  })), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid);
  assert.throws(() => createIndependentReviewOpinionEvent(eventInput(scenario, {
    event_id: "appeal-after-withdrawal",
    occurred_at: "2026-10-23T12:20:00.000Z",
    events: scenario.events,
    appeal_id: "appeal-after-withdrawal"
  })), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid);
});

test("detects event reordering, lifecycle tampering, and wrong correction evidence", () => {
  const scenario = buildSyntheticReviewOpinionLifecycleScenario();
  assert.throws(() => createIndependentReviewOpinionLifecycle({
    opinion: scenario.consistentOpinion,
    events: [scenario.events[1], scenario.events[0]]
  }), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid);

  const tampered = structuredClone(scenario.lifecycle);
  tampered.projection.status = "issued";
  assert.throws(() => verifyIndependentReviewOpinionLifecycle({
    lifecycle: tampered,
    correction_sources: [{ event_id: scenario.correctionEvent.event_id, recalculation: scenario.deviation }],
    ...context(scenario)
  }), (error) => error.code === INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fingerprintMismatch);

  assert.throws(() => verifyIndependentReviewOpinionLifecycle({
    lifecycle: scenario.lifecycle,
    correction_sources: [{ event_id: scenario.correctionEvent.event_id, recalculation: scenario.consistent }],
    ...context(scenario)
  }), (error) => new Set([
    INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid,
    INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch
  ]).has(error.code));
});

test("publishes a closed schema, bilingual guidance, types, SDK surface, and offline fixture", async () => {
  const [schema, publicApi, environment, guideEnglish, guideChinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-opinion-lifecycle-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/opinion-appeal-correction-withdrawal-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/opinion-appeal-correction-withdrawal-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/opinion.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.lifecycle.additionalProperties, false);
  assert.equal(schema.$defs.opinion.properties.record_type.const, "independent_review_opinion");
  assert.equal(schema.$defs.event.properties.record_type.const, "independent_review_opinion_event");
  assert.equal(publicApi.sdk_version, "0.28.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-opinion-lifecycle-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/opinion.mjs"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/opinion.d.ts"));
  assert.match(guideEnglish, /sales.*submitter.*cannot.*finding/is);
  assert.match(guideChinese, /销售.*提交人.*不能.*发现/s);
  assert.match(guideEnglish, /append-only.*history/is);
  assert.match(guideChinese, /追加.*完整历史/s);
  assert.match(packageEnglish, /CT-620.*opinion.*appeal.*correction.*withdrawal/is);
  assert.match(packageChinese, /CT-620.*意见.*申诉.*更正.*撤销/s);
  assert.match(types, /IndependentReviewOpinionLifecycle/);
  assert.ok(environment.contract_tests.includes("tests/review-opinion-lifecycle.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-opinion-lifecycle"));
});

test("runs the CT-620 scenario offline without a performance or certification claim", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/opinion-lifecycle-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  const result = JSON.parse(stdout);
  assert.equal(result.data_origin, "synthetic");
  assert.equal(result.consistent_outcome, "consistent");
  assert.equal(result.deviation_outcome, "deviation");
  assert.equal(result.uncertain_outcome, "uncertain");
  assert.equal(result.lifecycle_status, "withdrawn");
  assert.equal(result.complete_history, true);
  assert.equal(result.submitter_modified_finding, false);
  assert.equal(result.sales_modified_finding, false);
  assert.equal(result.performance_claim_allowed, false);
  assert.equal(result.certification_issued, false);
  assert.equal(result.external_network_used, false);
});
