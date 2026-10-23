import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EVIDENCE_INVALIDATION_ERROR_CODES,
  EVIDENCE_INVALIDATION_EVENT_TYPES,
  consumeEvidenceInvalidationEvent,
  createEvidenceDownstreamProjection,
  createEvidenceInvalidationEvent,
  createEvidenceTtlContract,
  evaluateEvidenceDownstreamTtl,
  replayEvidenceInvalidationEvents,
  verifyEvidenceInvalidationEvent,
  verifyEvidenceTtlContract
} from "../packages/evidence-invalidation/index.mjs";

const [ttlSchema, eventSchema] = await Promise.all([
  readFile(new URL("../specs/evidence/evidence-status-ttl-contract-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../specs/evidence/evidence-invalidation-event-v1.schema.json", import.meta.url), "utf8").then(JSON.parse)
]);

const evidenceRef = {
  object_type: "evidence_version",
  object_id: "evidence-synthetic-ct607",
  version: "1.0.0",
  tenant_id: "tenant-synthetic-public"
};
const axes = {
  measurement_validity: "partial",
  content_integrity: "passed",
  independent_review: "in-progress",
  freshness: "valid",
  policy_decision: "manual-review"
};

function resolveReference(schema, reference) {
  return reference.slice(2).split("/").reduce(
    (current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")],
    schema
  );
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validate(value, contract, schema, path = "$") {
  if (contract.$ref) return validate(value, resolveReference(schema, contract.$ref), schema, path);
  const errors = [];
  if (contract.oneOf) {
    const passing = contract.oneOf.filter((branch) => validate(value, branch, schema, path).length === 0).length;
    if (passing !== 1) errors.push(`${path} must match exactly one branch`);
  }
  if (contract.const !== undefined && value !== contract.const) errors.push(`${path} must equal ${contract.const}`);
  if (contract.enum && !contract.enum.includes(value)) errors.push(`${path} is outside the enum`);
  if (contract.type) {
    const types = Array.isArray(contract.type) ? contract.type : [contract.type];
    if (!types.some((type) => matchesType(value, type))) return [...errors, `${path} has the wrong type`];
  }
  if (typeof value === "string") {
    if (contract.pattern && !new RegExp(contract.pattern).test(value)) errors.push(`${path} does not match its pattern`);
    if (contract.format === "date-time") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${path} is not canonical UTC`);
    }
  }
  if (typeof value === "number") {
    if (contract.minimum !== undefined && value < contract.minimum) errors.push(`${path} is below minimum`);
    if (contract.maximum !== undefined && value > contract.maximum) errors.push(`${path} is above maximum`);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const field of contract.required ?? []) if (!Object.hasOwn(value, field)) errors.push(`${path}.${field} is required`);
    if (contract.additionalProperties === false) {
      for (const field of Object.keys(value)) if (!Object.hasOwn(properties, field)) errors.push(`${path}.${field} is not allowed`);
    }
    for (const [field, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, field)) errors.push(...validate(value[field], child, schema, `${path}.${field}`));
    }
  }
  return errors;
}

function expectCode(expected, action) {
  assert.throws(action, (error) => error?.code === expected, `expected ${expected}`);
}

function createContract(overrides = {}) {
  return createEvidenceTtlContract({
    leaseId: "lease-synthetic-ct607",
    evidenceRef,
    lifecycleSequence: 3,
    sourceStatusFingerprint: `sha256:${"a".repeat(64)}`,
    statusCheckedAt: "2026-10-23T08:00:00.000Z",
    issuedAt: "2026-10-23T08:00:01.000Z",
    evidenceExpiresAt: "2026-10-23T09:00:00.000Z",
    maxCacheTtlSeconds: 300,
    statusQueryUri: "https://cloudtelecom.cn/api/evidence/evidence-synthetic-ct607/versions/1.0.0/status",
    ...overrides
  });
}

function lifecycleEvent(kind, overrides = {}) {
  const definitions = {
    expired: { state: "expired", reason: "validity_elapsed", replacement: null, role: "system" },
    superseded: { state: "superseded", reason: "replacement_published", replacement: { ...evidenceRef, version: "1.1.0" }, role: "publisher" },
    revoked: { state: "revoked", reason: "revocation_authorized", replacement: null, role: "publisher" }
  };
  const definition = definitions[kind];
  return {
    schema_version: "1.0.0",
    event_id: `lifecycle-synthetic-${kind}`,
    evidence_ref: evidenceRef,
    sequence: 4,
    from: { lifecycle_state: "published", status_axes: axes },
    to: {
      lifecycle_state: definition.state,
      status_axes: kind === "expired" ? { ...axes, freshness: "expired" } : axes
    },
    reason_code: definition.reason,
    occurred_at: "2026-10-23T08:02:00.000Z",
    actor: { actor_id: `principal-synthetic-${definition.role}`, actor_role: definition.role },
    replacement_ref: definition.replacement,
    ...overrides
  };
}

function invalidationEvent(kind, overrides = {}) {
  return createEvidenceInvalidationEvent({
    eventId: `invalidation-synthetic-${kind}`,
    lifecycleEvent: lifecycleEvent(kind),
    emittedAt: "2026-10-23T08:02:01.000Z",
    ...overrides
  });
}

function projection(consumerId = "consumer-synthetic-marketplace", contract = createContract()) {
  return createEvidenceDownstreamProjection({
    consumerId,
    contract,
    cachedAt: "2026-10-23T08:00:05.000Z"
  });
}

test("publishes strict schemas for a bounded lease and fingerprinted invalidation event", () => {
  const contract = createContract();
  const event = invalidationEvent("superseded");
  assert.equal(ttlSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(eventSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(ttlSchema.additionalProperties, false);
  assert.equal(eventSchema.additionalProperties, false);
  assert.deepEqual(validate(contract, ttlSchema, ttlSchema), []);
  assert.deepEqual(validate(event, eventSchema, eventSchema), []);
  assert.equal(verifyEvidenceTtlContract(contract).contract_fingerprint, contract.contract_fingerprint);
  assert.equal(verifyEvidenceInvalidationEvent(event, {
    sourceLifecycleEvent: lifecycleEvent("superseded")
  }).event_fingerprint, event.event_fingerprint);
});

test("bounds TTL by both cache policy and the evidence validity deadline", () => {
  const cacheBound = createContract();
  assert.equal(cacheBound.ttl_expires_at, "2026-10-23T08:05:00.000Z");
  const evidenceBound = createContract({
    leaseId: "lease-synthetic-short-validity",
    evidenceExpiresAt: "2026-10-23T08:03:00.000Z"
  });
  assert.equal(evidenceBound.ttl_expires_at, "2026-10-23T08:03:00.000Z");
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, () => createContract({ maxCacheTtlSeconds: 86_401 }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid, () => createContract({
    statusQueryUri: "https://user:secret@cloudtelecom.cn/status"
  }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.inputInvalid, () => createContract({
    statusQueryUri: "https://cloudtelecom.cn/status?access_token=must-not-be-carried"
  }));
  const tampered = { ...cacheBound, ttl_expires_at: "2026-10-23T08:06:01.000Z" };
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.ttlInvalid, () => verifyEvidenceTtlContract(tampered));
});

test("maps all three CT-602 terminal transitions without auto-activating replacements", () => {
  const expected = ["evidence.expired", "evidence.superseded", "evidence.revoked"];
  const actual = ["expired", "superseded", "revoked"].map((kind) => invalidationEvent(kind).event_type);
  assert.deepEqual(actual, expected);
  assert.deepEqual(EVIDENCE_INVALIDATION_EVENT_TYPES, expected);
  const superseded = invalidationEvent("superseded");
  assert.equal(superseded.replacement_ref.version, "1.1.0");
  assert.equal(superseded.requires_immediate_invalidation, true);
  assert.equal(superseded.certification_issued, false);
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.replacementInvalid, () => createEvidenceInvalidationEvent({
    eventId: "invalidation-synthetic-lower-replacement",
    lifecycleEvent: lifecycleEvent("superseded", {
      replacement_ref: { ...evidenceRef, version: "0.9.0" }
    }),
    emittedAt: "2026-10-23T08:02:01.000Z"
  }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, () => createEvidenceInvalidationEvent({
    eventId: "invalidation-synthetic-unauthorized-revocation",
    lifecycleEvent: lifecycleEvent("revoked", {
      actor: { actor_id: "principal-synthetic-owner", actor_role: "owner" }
    }),
    emittedAt: "2026-10-23T08:02:01.000Z"
  }));
});

test("lets every downstream consume an event repeatedly without duplicate mutation", () => {
  const event = invalidationEvent("superseded");
  for (const [index, consumerId] of ["marketplace", "sla", "scheduler"].entries()) {
    const initial = projection(`consumer-synthetic-${consumerId}`);
    const first = consumeEvidenceInvalidationEvent(initial, event, {
      consumedAt: `2026-10-23T08:02:0${index + 2}.000Z`
    });
    const repeated = consumeEvidenceInvalidationEvent(first.projection, event, {
      consumedAt: `2026-10-23T08:02:0${index + 5}.000Z`
    });
    assert.equal(first.applied, true);
    assert.equal(repeated.applied, false);
    assert.equal(repeated.idempotent_replay, true);
    assert.deepEqual(repeated.projection, first.projection);
    assert.equal(first.projection.invalidation_reason, "superseded");
    assert.equal(first.projection.replacement_ref.version, "1.1.0");
  }
});

test("fails closed at TTL even when a downstream receives no event", () => {
  const initial = projection("consumer-synthetic-offline");
  const before = evaluateEvidenceDownstreamTtl(initial, { evaluatedAt: "2026-10-23T08:04:59.999Z" });
  assert.equal(before.projection.projection_state, "current");
  const elapsed = evaluateEvidenceDownstreamTtl(initial, { evaluatedAt: initial.ttl_expires_at });
  assert.equal(elapsed.invalidated, true);
  assert.equal(elapsed.projection.projection_state, "invalidated");
  assert.equal(elapsed.projection.invalidation_reason, "ttl_elapsed");
  assert.equal(elapsed.projection.invalidated_at, initial.ttl_expires_at);
  assert.equal(elapsed.projection.certification_issued, false);
});

test("replays at-least-once deliveries and then applies the TTL fallback", () => {
  const event = invalidationEvent("revoked");
  const final = replayEvidenceInvalidationEvents(projection("consumer-synthetic-replay"), [
    { event, consumed_at: "2026-10-23T08:02:02.000Z" },
    { event, consumed_at: "2026-10-23T08:02:03.000Z" }
  ], { evaluatedAt: "2026-10-23T08:06:00.000Z" });
  assert.equal(final.projection_state, "invalidated");
  assert.equal(final.invalidation_reason, "revoked");
  assert.equal(final.last_event_id, event.event_id);
});

test("rejects wrong versions, stale events, ID conflicts, tampering, and unknown fields", () => {
  const current = projection();
  const event = invalidationEvent("expired");
  const wrongReference = invalidationEvent("expired", {
    eventId: "invalidation-synthetic-wrong-ref",
    lifecycleEvent: lifecycleEvent("expired", {
      evidence_ref: { ...evidenceRef, tenant_id: "tenant-synthetic-other" }
    })
  });
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.referenceMismatch, () => consumeEvidenceInvalidationEvent(current, wrongReference, {
    consumedAt: "2026-10-23T08:02:02.000Z"
  }));
  const stale = createEvidenceInvalidationEvent({
    eventId: "invalidation-synthetic-stale",
    lifecycleEvent: lifecycleEvent("expired", { sequence: 3 }),
    emittedAt: "2026-10-23T08:02:01.000Z"
  });
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.eventStale, () => consumeEvidenceInvalidationEvent(current, stale, {
    consumedAt: "2026-10-23T08:02:02.000Z"
  }));
  const applied = consumeEvidenceInvalidationEvent(current, event, { consumedAt: "2026-10-23T08:02:02.000Z" });
  const conflicting = createEvidenceInvalidationEvent({
    eventId: event.event_id,
    lifecycleEvent: lifecycleEvent("revoked"),
    emittedAt: "2026-10-23T08:02:01.000Z"
  });
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.eventIdConflict, () => consumeEvidenceInvalidationEvent(applied.projection, conflicting, {
    consumedAt: "2026-10-23T08:02:03.000Z"
  }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.eventFingerprintMismatch, () => verifyEvidenceInvalidationEvent({
    ...event,
    emitted_at: "2026-10-23T08:02:02.000Z"
  }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.lifecycleEventInvalid, () => verifyEvidenceInvalidationEvent(event, {
    sourceLifecycleEvent: lifecycleEvent("revoked")
  }));
  expectCode(EVIDENCE_INVALIDATION_ERROR_CODES.fieldUnknown, () => verifyEvidenceTtlContract({
    ...createContract(),
    access_token: "must-not-be-carried"
  }));
});

test("publishes CT-607 SDK exports, bilingual guidance, and an offline scenario", async () => {
  const [english, chinese, publicApi, environment, sdk, types] = await Promise.all([
    readFile(new URL("../docs/evidence/downstream-invalidation-and-ttl-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/downstream-invalidation-and-ttl-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs"),
    readFile(new URL("../packages/evidence-invalidation/index.d.ts", import.meta.url), "utf8")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /CT-607/);
    assert.match(document, /at-least-once|至少一次/iu);
    assert.match(document, /TTL/);
    assert.match(document, /certif|认证/iu);
  }
  assert.equal(publicApi.sdk_version, "0.22.0");
  assert.ok(publicApi.public_contracts.includes("specs/evidence/evidence-status-ttl-contract-v1.schema.json"));
  assert.ok(publicApi.public_contracts.includes("specs/evidence/evidence-invalidation-event-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/evidence-invalidation/index.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-invalidation.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "evidence-downstream-invalidation"));
  assert.equal(typeof sdk.createEvidenceTtlContract, "function");
  assert.equal(typeof sdk.consumeEvidenceInvalidationEvent, "function");
  assert.equal(typeof sdk.evaluateEvidenceDownstreamTtl, "function");
  assert.match(types, /EvidenceDownstreamProjection/);
  assert.equal(
    Object.values(EVIDENCE_INVALIDATION_ERROR_CODES).length,
    new Set(Object.values(EVIDENCE_INVALIDATION_ERROR_CODES)).size
  );
});
