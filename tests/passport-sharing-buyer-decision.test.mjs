import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/link-evidence-passport/sharing.mjs";
import {
  PASSPORT_BUYER_DECISIONS,
  PASSPORT_SHARE_STATES,
  PASSPORT_SHARING_ERROR_CODES,
  PASSPORT_SHARING_VERSION,
  createPassportBuyerDecision,
  createPassportSupplementRequest,
  createPassportSupplementResponse,
  projectPassportBuyerDecision,
  projectPassportShare,
  verifyPassportBuyerDecision,
  verifyPassportShareGrant,
  verifyPassportSupplementResponse
} from "../packages/link-evidence-passport/sharing.mjs";
import { buildSyntheticPassportSharingScenario } from "../examples/passport/sharing-buyer-acceptance-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function context(scenario, grant = scenario.acceptedGrant, revocations = []) {
  return {
    grant,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    revocations
  };
}

test("records governed sharing, supplements, acceptance, rejection, and later revocation", () => {
  const scenario = buildSyntheticPassportSharingScenario();

  assert.equal(PASSPORT_SHARING_VERSION, "1.0.0");
  assert.deepEqual(PASSPORT_SHARE_STATES, ["active", "expired", "revoked"]);
  assert.deepEqual(PASSPORT_BUYER_DECISIONS, ["accepted", "rejected"]);
  assert.equal(scenario.activeBeforeRevocation.active, true);
  assert.equal(scenario.supplementRequest.items.length, 2);
  assert.equal(scenario.supplementResponse.items.length, 2);
  assert.ok(scenario.supplementResponse.items.every(({ artifact_ref: reference }) => reference?.object_type === "artifact"));
  assert.equal(scenario.acceptedDecision.decision, "accepted");
  assert.equal(scenario.rejectedDecision.decision, "rejected");
  assert.equal(scenario.acceptedAfterRevocation.buyer_decision, "accepted");
  assert.equal(scenario.acceptedAfterRevocation.current_share_state, "revoked");
  assert.equal(scenario.acceptedAfterRevocation.current_access_active, false);
  assert.equal(scenario.acceptedAfterRevocation.current_passport_lifecycle_state, "sealed");
  assert.equal(scenario.acceptedAfterRevocation.buyer_decision_changes_platform_status, false);
  assert.equal(scenario.acceptedDecision.platform_evidence_snapshot.status_axes.independent_review, "not-reviewed");
  assert.equal(scenario.acceptedDecision.platform_evidence_snapshot.status_axes.policy_decision, "manual-review");
  assert.equal(scenario.acceptedDecision.boundary.performance_claim_allowed, false);
  assert.equal(scenario.acceptedDecision.boundary.certification_issued, false);
  assert.ok(Object.isFrozen(scenario.acceptedDecision));
});

test("expires access fail closed and rejects a decision at or after expiry", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  const projection = projectPassportShare({
    ...context(scenario),
    evaluated_at: scenario.acceptedGrant.expires_at
  });
  assert.equal(projection.share_state, "expired");
  assert.equal(projection.active, false);
  assert.equal(projection.invalidation_reason, "share-expired");

  assert.throws(() => createPassportBuyerDecision({
    ...context(scenario),
    decision_id: "passport-buyer-decision-after-expiry",
    version: "1.0.0",
    supplement_requests: [],
    supplement_responses: [],
    buyer_id: scenario.acceptedGrant.recipient.subject_id,
    decided_at: scenario.acceptedGrant.expires_at,
    decision: "rejected",
    reason_codes: ["scope-mismatch"],
    decision_note: "This decision is intentionally attempted after expiry."
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.shareInactive));
});

test("rejects supplement activity from another recipient", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  assert.throws(() => createPassportSupplementRequest({
    ...context(scenario),
    request_id: "passport-supplement-request-wrong-recipient",
    version: "1.0.0",
    requested_by: "buyer-not-authorized",
    requested_at: "2026-10-23T11:16:00.000Z",
    items: [{
      item_id: "method-detail",
      category: "method-detail",
      description: "Attempted request from a subject other than the exact share recipient."
    }]
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.supplementInvalid));
});

test("blocks supplements and decisions after append-only revocation", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  const revokedContext = context(scenario, scenario.acceptedGrant, [scenario.revocation]);
  assert.throws(() => createPassportSupplementRequest({
    ...revokedContext,
    request_id: "passport-supplement-request-after-revocation",
    version: "1.0.0",
    requested_by: scenario.acceptedGrant.recipient.subject_id,
    requested_at: "2026-10-23T11:31:00.000Z",
    items: [{
      item_id: "method-detail",
      category: "method-detail",
      description: "This request is intentionally attempted after revocation."
    }]
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.shareInactive));
  assert.throws(() => createPassportBuyerDecision({
    ...revokedContext,
    decision_id: "passport-buyer-decision-after-revocation",
    version: "1.0.0",
    supplement_requests: [],
    supplement_responses: [],
    buyer_id: scenario.acceptedGrant.recipient.subject_id,
    decided_at: "2026-10-23T11:31:00.000Z",
    decision: "rejected",
    reason_codes: ["scope-mismatch"],
    decision_note: "This decision is intentionally attempted after revocation."
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.shareInactive));
});

test("rejects fingerprint and boundary tampering", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  const tamperedGrant = structuredClone(scenario.acceptedGrant);
  tamperedGrant.purpose = "Tampered purpose without a matching fingerprint.";
  assert.throws(() => verifyPassportShareGrant({
    record: tamperedGrant,
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.fingerprintMismatch));

  const tamperedResponse = structuredClone(scenario.supplementResponse);
  tamperedResponse.items[0].note = "Tampered response note without a new fingerprint.";
  assert.throws(() => verifyPassportSupplementResponse({
    ...context(scenario),
    record: tamperedResponse,
    request: scenario.supplementRequest
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.fingerprintMismatch));

  const falseCertification = structuredClone(scenario.acceptedDecision);
  falseCertification.boundary.platform_evidence_status_mutated = true;
  assert.throws(() => verifyPassportBuyerDecision({
    ...context(scenario),
    record: falseCertification,
    supplement_requests: [scenario.supplementRequest],
    supplement_responses: [scenario.supplementResponse]
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.decisionInvalid));
});

test("permits one final buyer decision and keeps it separate from current evidence state", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  assert.throws(() => projectPassportBuyerDecision({
    ...context(scenario),
    decisions: [scenario.acceptedDecision, scenario.acceptedDecision],
    supplement_requests: [scenario.supplementRequest],
    supplement_responses: [scenario.supplementResponse],
    evaluated_at: "2026-10-23T11:26:00.000Z"
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.historyInvalid));

  assert.deepEqual(
    scenario.acceptedDecision.platform_evidence_snapshot.status_axes,
    scenario.replacement.status_seed
  );
  assert.equal(scenario.acceptedDecision.boundary.buyer_decision_only, true);
  assert.equal(scenario.acceptedDecision.boundary.platform_evidence_status_mutated, false);
  assert.equal(scenario.replacement.status_seed.independent_review, "not-reviewed");
  assert.equal(scenario.replacement.status_seed.policy_decision, "manual-review");
});

test("bounds supplement collections and rejects reused response identities", () => {
  const scenario = buildSyntheticPassportSharingScenario();
  assert.throws(() => createPassportBuyerDecision({
    ...context(scenario),
    decision_id: "passport-buyer-decision-too-many-supplements",
    version: "1.0.0",
    supplement_requests: Array.from({ length: 33 }, () => scenario.supplementRequest),
    supplement_responses: [],
    buyer_id: scenario.acceptedGrant.recipient.subject_id,
    decided_at: "2026-10-23T11:25:00.000Z",
    decision: "rejected",
    reason_codes: ["evidence-insufficient"],
    decision_note: "This decision intentionally exceeds the bounded supplement collection."
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.supplementInvalid));

  const secondRequest = createPassportSupplementRequest({
    ...context(scenario),
    request_id: "passport-supplement-request-second",
    version: "1.0.0",
    requested_by: scenario.acceptedGrant.recipient.subject_id,
    requested_at: "2026-10-23T11:16:00.000Z",
    items: [{
      item_id: "source-lineage",
      category: "source-lineage",
      description: "Provide a second synthetic lineage artifact reference."
    }]
  });
  const duplicateIdentityResponse = createPassportSupplementResponse({
    ...context(scenario),
    response_id: scenario.supplementResponse.response_id,
    version: "1.0.0",
    request: secondRequest,
    responded_by: "publisher-ct615",
    responder_role: "publisher",
    responded_at: "2026-10-23T11:21:00.000Z",
    items: [{
      item_id: "source-lineage",
      disposition: "unavailable",
      artifact_ref: null,
      note: "The second synthetic artifact is intentionally unavailable."
    }]
  });
  assert.throws(() => createPassportBuyerDecision({
    ...context(scenario),
    decision_id: "passport-buyer-decision-duplicate-response-id",
    version: "1.0.0",
    supplement_requests: [scenario.supplementRequest, secondRequest],
    supplement_responses: [scenario.supplementResponse, duplicateIdentityResponse],
    buyer_id: scenario.acceptedGrant.recipient.subject_id,
    decided_at: "2026-10-23T11:25:00.000Z",
    decision: "rejected",
    reason_codes: ["evidence-insufficient"],
    decision_note: "This decision intentionally reuses one response identity."
  }), assertCode(PASSPORT_SHARING_ERROR_CODES.decisionInvalid));
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/passport-sharing-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/sharing-revocation-and-buyer-decision-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/sharing-revocation-and-buyer-decision-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/sharing.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.oneOf.length, 5);
  for (const name of ["shareGrant", "shareRevocation", "supplementRequest", "supplementResponse", "buyerDecision"]) {
    assert.equal(schema.$defs[name].additionalProperties, false, name);
  }
  assert.equal(publicApi.sdk_version, "0.24.0");
  assert.ok(publicApi.public_contracts.includes("specs/passport/passport-sharing-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/link-evidence-passport/sharing.mjs"));
  assert.ok(publicApi.public_tools.includes("packages/link-evidence-passport/sharing.d.ts"));
  for (const exported of [
    "PASSPORT_SHARING_VERSION",
    "PASSPORT_SHARE_STATES",
    "PASSPORT_BUYER_DECISIONS",
    "PASSPORT_SHARING_ERROR_CODES",
    "createPassportShareGrant",
    "verifyPassportShareGrant",
    "createPassportShareRevocation",
    "verifyPassportShareRevocation",
    "projectPassportShare",
    "createPassportSupplementRequest",
    "verifyPassportSupplementRequest",
    "createPassportSupplementResponse",
    "verifyPassportSupplementResponse",
    "createPassportBuyerDecision",
    "verifyPassportBuyerDecision",
    "projectPassportBuyerDecision"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /buyer acceptance.*does not.*platform evidence status/is);
  assert.match(chinese, /买方接受.*不会.*平台证据状态/s);
  assert.ok(environment.contract_tests.includes("tests/passport-sharing-buyer-decision.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-sharing-buyer-decision"));
});

test("runs the CT-615 governed sharing example offline without making trust claims", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/sharing-buyer-acceptance-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    share_active_before_revocation: true,
    supplement_request_count: 1,
    supplement_item_count: 2,
    supplement_response_complete: true,
    accepted_decision_recorded: true,
    rejected_decision_recorded: true,
    share_state_after_revocation: "revoked",
    current_access_after_revocation: false,
    platform_lifecycle_before_acceptance: "sealed",
    platform_lifecycle_after_revocation: "sealed",
    platform_evidence_status_mutated: false,
    buyer_acceptance_separate: true,
    identity_authenticated: false,
    export_authorization_verified: false,
    external_network_used: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
});
