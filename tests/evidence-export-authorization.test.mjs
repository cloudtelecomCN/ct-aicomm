import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EVIDENCE_EXPORT_ERROR_CODES,
  createEvidenceExportAuditLedger,
  evaluateEvidenceExportRequest,
  recordEvidenceExportDelivery,
  verifyEvidenceExportAuditLedger
} from "../packages/evidence-export/index.mjs";

const grant = JSON.parse(await readFile(
  new URL("../examples/evidence/v1/export-grant.synthetic.json", import.meta.url),
  "utf8"
));
const schema = JSON.parse(await readFile(
  new URL("../specs/evidence/evidence-export-audit-event-v1.schema.json", import.meta.url),
  "utf8"
));
const authContextFingerprint = `sha256:${"a".repeat(64)}`;
const contentFingerprint = `sha256:${"b".repeat(64)}`;

function resolveReference(reference) {
  return reference.slice(2).split("/").reduce(
    (current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")],
    schema
  );
}

function matchesType(value, expected) {
  if (Array.isArray(expected)) return expected.some((candidate) => matchesType(value, candidate));
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  return typeof value === expected;
}

function validateSchema(value, contract, location = "$") {
  if (contract.$ref) return validateSchema(value, resolveReference(contract.$ref), location);
  const errors = [];
  if (contract.oneOf) {
    const outcomes = contract.oneOf.map((branch) => validateSchema(value, branch, location));
    const validCount = outcomes.filter((outcome) => outcome.length === 0).length;
    if (validCount !== 1) errors.push(`${location} must match exactly one schema branch`);
  }
  if (contract.allOf) {
    for (const branch of contract.allOf) errors.push(...validateSchema(value, branch, location));
  }
  if (contract.if) {
    const conditionMatches = validateSchema(value, contract.if, location).length === 0;
    const branch = conditionMatches ? contract.then : contract.else;
    if (branch) errors.push(...validateSchema(value, branch, location));
  }
  if (contract.const !== undefined && value !== contract.const) errors.push(`${location} must equal ${String(contract.const)}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${location} is outside the enum`);
  if (contract.type && !matchesType(value, contract.type)) return [...errors, `${location} has the wrong type`];
  if (typeof value === "string") {
    if (contract.minLength !== undefined && value.length < contract.minLength) errors.push(`${location} is too short`);
    if (contract.maxLength !== undefined && value.length > contract.maxLength) errors.push(`${location} is too long`);
    if (contract.pattern && !new RegExp(contract.pattern).test(value)) errors.push(`${location} does not match its pattern`);
    if (contract.format === "date-time") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${location} is not canonical UTC`);
    }
  }
  if (typeof value === "number" && contract.minimum !== undefined && value < contract.minimum) errors.push(`${location} is below its minimum`);
  if (Array.isArray(value)) {
    if (contract.minItems !== undefined && value.length < contract.minItems) errors.push(`${location} has too few items`);
    if (contract.maxItems !== undefined && value.length > contract.maxItems) errors.push(`${location} has too many items`);
    if (contract.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${location} has duplicates`);
    if (contract.items) value.forEach((item, index) => errors.push(...validateSchema(item, contract.items, `${location}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const field of contract.required ?? []) if (!Object.hasOwn(value, field)) errors.push(`${location}.${field} is required`);
    if (contract.additionalProperties === false) {
      for (const field of Object.keys(value)) if (!Object.hasOwn(properties, field)) errors.push(`${location}.${field} is not allowed`);
    }
    for (const [field, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, field)) errors.push(...validateSchema(value[field], child, `${location}.${field}`));
    }
  }
  return errors;
}

function command(overrides = {}) {
  return {
    eventId: "export-auth-synthetic-001",
    requestedAt: "2026-10-23T02:00:00.000Z",
    requestTenantId: grant.tenant_id,
    principalId: grant.recipient.principal_id,
    organizationId: grant.recipient.organization_id,
    authContextFingerprint,
    purpose: grant.purpose,
    resourceRef: grant.resource_refs[0],
    requestedFieldScope: ["/boundary/data_origin", "/status/independent_review"],
    grant,
    ...overrides
  };
}

function evaluate(commandOverrides = {}, optionOverrides = {}) {
  const ledger = createEvidenceExportAuditLedger({ tenantId: grant.tenant_id });
  return evaluateEvidenceExportRequest(
    ledger,
    command(commandOverrides),
    { expectedAuthContextFingerprint: authContextFingerprint, ...optionOverrides }
  );
}

test("allows exact tenant, recipient, purpose, resource, and descendant fields", () => {
  const result = evaluate();
  assert.equal(result.event.decision, "allowed");
  assert.equal(result.event.auth_context_anchor_verified, true);
  assert.equal(result.event.download_performed, false);
  assert.equal(result.event.principal_authentication_verified, false);
  assert.equal(result.event.authorization_enforced_by_transport, false);
  assert.deepEqual(result.event.reason_codes, []);
  assert.deepEqual(validateSchema(result.event, schema), []);

  const replay = evaluateEvidenceExportRequest(result.ledger, command(), {
    expectedAuthContextFingerprint: authContextFingerprint
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.event.event_fingerprint, result.event.event_fingerprint);
  assert.equal(replay.ledger.events.length, 1);
});

test("records exactly one delivery without recording export bytes or a URL", () => {
  const allowed = evaluate();
  const delivered = recordEvidenceExportDelivery(allowed.ledger, {
    eventId: "export-delivery-synthetic-001",
    authorizationEventFingerprint: allowed.event.event_fingerprint,
    reportedAt: "2026-10-23T02:00:01.000Z",
    outcome: "delivered",
    bytesSent: 512,
    contentFingerprint,
    errorCode: null
  });
  assert.deepEqual(validateSchema(delivered.event, schema), []);
  assert.equal(delivered.event.previous_event_fingerprint, allowed.event.event_fingerprint);
  const verification = verifyEvidenceExportAuditLedger(delivered.ledger);
  assert.equal(verification.allowed_decision_count, 1);
  assert.equal(verification.delivered_count, 1);
  assert.equal(verification.append_only_chain_verified, true);
  assert.equal(verification.principal_authentication_verified, false);
  assert.equal(verification.transport_attestation_verified, false);

  const serialized = JSON.stringify(delivered.ledger);
  for (const forbidden of ["download_url", "storage_locator", "payload_bytes", "bearer_token", "credential", "cookie"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not be recorded`);
  }
  assert.throws(
    () => recordEvidenceExportDelivery(delivered.ledger, {
      eventId: "export-delivery-synthetic-002",
      authorizationEventFingerprint: allowed.event.event_fingerprint,
      reportedAt: "2026-10-23T02:00:02.000Z",
      outcome: "delivered",
      bytesSent: 512,
      contentFingerprint,
      errorCode: null
    }),
    (error) => error?.code === EVIDENCE_EXPORT_ERROR_CODES.deliveryDuplicate
  );
});

test("denies cross-tenant and JSON Pointer prefix-confusion requests", () => {
  const denied = evaluate({
    requestTenantId: "tenant-synthetic-beta",
    resourceRef: { ...grant.resource_refs[0], tenant_id: "tenant-synthetic-beta" },
    requestedFieldScope: ["/boundaryOther"]
  });
  assert.equal(denied.event.decision, "denied");
  assert.deepEqual(denied.event.denied_field_scope, ["/boundaryOther"]);
  assert.ok(denied.event.reason_codes.includes(EVIDENCE_EXPORT_ERROR_CODES.tenantMismatch));
  assert.ok(denied.event.reason_codes.includes(EVIDENCE_EXPORT_ERROR_CODES.resourceDenied));
  assert.ok(denied.event.reason_codes.includes(EVIDENCE_EXPORT_ERROR_CODES.fieldDenied));
  assert.deepEqual(validateSchema(denied.event, schema), []);
});

test("denies each authorization mismatch and records the reason", () => {
  const cases = [
    [{ principalId: "principal-synthetic-other" }, {}, EVIDENCE_EXPORT_ERROR_CODES.recipientMismatch],
    [{ purpose: "A different export purpose." }, {}, EVIDENCE_EXPORT_ERROR_CODES.purposeMismatch],
    [{ resourceRef: { ...grant.resource_refs[0], version: "2.0.0" } }, {}, EVIDENCE_EXPORT_ERROR_CODES.resourceDenied],
    [{ requestedFieldScope: ["/review"] }, {}, EVIDENCE_EXPORT_ERROR_CODES.fieldDenied],
    [{ requestedAt: "2026-10-22T08:29:59.000Z" }, {}, EVIDENCE_EXPORT_ERROR_CODES.grantNotYetValid],
    [{ requestedAt: "2026-11-22T08:30:00.000Z" }, {}, EVIDENCE_EXPORT_ERROR_CODES.grantExpired],
    [{ grant: { ...grant, status: "revoked" } }, {}, EVIDENCE_EXPORT_ERROR_CODES.grantInactive],
    [{ grant: { ...grant, authorization_scope: { ...grant.authorization_scope, visibility: "private" } } }, {}, EVIDENCE_EXPORT_ERROR_CODES.grantScopeInvalid],
    [{}, { expectedAuthContextFingerprint: `sha256:${"c".repeat(64)}` }, EVIDENCE_EXPORT_ERROR_CODES.authContextUnverified],
    [{}, { expectedAuthContextFingerprint: undefined }, EVIDENCE_EXPORT_ERROR_CODES.authContextUnverified]
  ];
  cases.forEach(([commandOverrides, optionOverrides, expectedCode], index) => {
    const denied = evaluate({ eventId: `export-auth-denied-${index}`, ...commandOverrides }, optionOverrides);
    assert.equal(denied.event.decision, "denied");
    assert.ok(denied.event.reason_codes.includes(expectedCode), `missing ${expectedCode}`);
  });
});

test("cannot deliver a denied or expired authorization", () => {
  const denied = evaluate({ requestedFieldScope: ["/review"] });
  assert.throws(
    () => recordEvidenceExportDelivery(denied.ledger, {
      eventId: "export-delivery-denied",
      authorizationEventFingerprint: denied.event.event_fingerprint,
      reportedAt: "2026-10-23T02:00:01.000Z",
      outcome: "failed",
      bytesSent: 0,
      contentFingerprint: null,
      errorCode: "authorization-denied"
    }),
    (error) => error?.code === EVIDENCE_EXPORT_ERROR_CODES.authorizationMissing
  );

  const allowed = evaluate();
  assert.throws(
    () => recordEvidenceExportDelivery(allowed.ledger, {
      eventId: "export-delivery-expired",
      authorizationEventFingerprint: allowed.event.event_fingerprint,
      reportedAt: grant.expires_at,
      outcome: "delivered",
      bytesSent: 512,
      contentFingerprint,
      errorCode: null
    }),
    (error) => error?.code === EVIDENCE_EXPORT_ERROR_CODES.deliveryTimeInvalid
  );
});

test("detects event mutation and chain tampering", () => {
  const allowed = evaluate();
  const tampered = structuredClone(allowed.ledger);
  tampered.events[0].purpose = "Changed after authorization.";
  assert.throws(
    () => verifyEvidenceExportAuditLedger(tampered),
    (error) => error?.code === EVIDENCE_EXPORT_ERROR_CODES.ledgerFingerprintMismatch
  );
});

test("publishes CT-606 schema, SDK exports, bilingual guidance, and offline scenario", async () => {
  const [english, chinese, publicApi, environment, sdk, types] = await Promise.all([
    readFile(new URL("../docs/evidence/tenant-export-authorization-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/tenant-export-authorization-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs"),
    readFile(new URL("../packages/evidence-export/index.d.ts", import.meta.url), "utf8")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /tenant|租户/iu);
    assert.match(document, /den(?:y|i)|拒绝/iu);
    assert.match(document, /credential|凭据/iu);
    assert.match(document, /certif|认证/iu);
  }
  assert.ok(publicApi.public_contracts.includes("specs/evidence/evidence-export-audit-event-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/evidence-export/index.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-export-authorization.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "evidence-export-authorization"));
  assert.equal(typeof sdk.createEvidenceExportAuditLedger, "function");
  assert.equal(typeof sdk.evaluateEvidenceExportRequest, "function");
  assert.equal(typeof sdk.recordEvidenceExportDelivery, "function");
  assert.equal(typeof sdk.verifyEvidenceExportAuditLedger, "function");
  assert.match(types, /EvidenceExportAuditLedger/);
  assert.equal(Object.values(EVIDENCE_EXPORT_ERROR_CODES).length, new Set(Object.values(EVIDENCE_EXPORT_ERROR_CODES)).size);
});
