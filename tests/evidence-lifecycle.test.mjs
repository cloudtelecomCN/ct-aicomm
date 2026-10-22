import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EVIDENCE_LIFECYCLE_ERROR_CODES,
  createEvidenceLifecycleSnapshot,
  projectEvidenceStatus,
  replayEvidenceLifecycle,
  transitionEvidenceLifecycle
} from "../packages/evidence-lifecycle/index.mjs";

const schema = JSON.parse(await readFile(new URL("../specs/evidence/evidence-lifecycle-event-v1.schema.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../examples/evidence/lifecycle/history.synthetic.json", import.meta.url), "utf8"));

function resolveReference(reference) {
  return reference.slice(2).split("/").reduce((current, token) => current[token.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validate(value, contract, path = "$") {
  if (contract.$ref) return validate(value, resolveReference(contract.$ref), path);
  const errors = [];
  if (contract.oneOf) {
    const passing = contract.oneOf.filter((branch) => validate(value, branch, path).length === 0).length;
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
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) errors.push(`${path} is not a canonical instant`);
    }
  }
  if (typeof value === "number" && contract.minimum !== undefined && value < contract.minimum) errors.push(`${path} is below its minimum`);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = contract.properties ?? {};
    for (const field of contract.required ?? []) if (!Object.hasOwn(value, field)) errors.push(`${path}.${field} is required`);
    if (contract.additionalProperties === false) {
      for (const field of Object.keys(value)) if (!Object.hasOwn(properties, field)) errors.push(`${path}.${field} is not allowed`);
    }
    for (const [field, child] of Object.entries(properties)) if (Object.hasOwn(value, field)) errors.push(...validate(value[field], child, `${path}.${field}`));
  }
  return errors;
}

function commandFromEvent(event) {
  return {
    event_id: event.event_id,
    to_state: event.to.lifecycle_state,
    reason_code: event.reason_code,
    occurred_at: event.occurred_at,
    actor: event.actor,
    replacement_ref: event.replacement_ref,
    next_status_axes: event.to.status_axes
  };
}

function expectCode(expected, action) {
  assert.throws(action, (error) => error?.code === expected, `expected ${expected}`);
}

test("validates and deterministically replays the complete synthetic lifecycle", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(fixture.data_origin, "synthetic");
  assert.equal(fixture.performance_claim_allowed, false);
  for (const event of fixture.events) assert.deepEqual(validate(event, schema), [], event.event_id);

  const initial = createEvidenceLifecycleSnapshot({
    evidence_ref: fixture.initial_snapshot.evidence_ref,
    status_axes: fixture.initial_snapshot.status_axes,
    created_at: fixture.initial_snapshot.updated_at
  });
  assert.deepEqual(initial, fixture.initial_snapshot);
  const final = replayEvidenceLifecycle(initial, fixture.events);
  const projection = projectEvidenceStatus(final);
  assert.equal(projection.lifecycle_state, fixture.expected_projection.lifecycle_state);
  assert.deepEqual(projection.blocking_conditions, fixture.expected_projection.blocking_conditions);
  assert.equal(projection.single_status_allowed, false);
  assert.equal(projection.certification_issued, false);
});

test("keeps all five axes visible when an evidence version is published", () => {
  const published = replayEvidenceLifecycle(fixture.initial_snapshot, fixture.events.slice(0, 3));
  const projection = projectEvidenceStatus(published);
  assert.equal(projection.lifecycle_state, "published");
  assert.deepEqual(projection.status_axes, fixture.initial_snapshot.status_axes);
  assert.deepEqual(projection.blocking_conditions, [
    "measurement_partial",
    "content_integrity_unverifiable",
    "independent_review_not-reviewed",
    "policy_decision_manual-review"
  ]);
  assert.equal(Object.keys(projection.status_axes).length, 5);
});

test("rejects lifecycle shortcuts, wrong reasons, unauthorized roles, and no-op updates", () => {
  const initial = fixture.initial_snapshot;
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.transitionNotAllowed, () => transitionEvidenceLifecycle(initial, {
    ...commandFromEvent(fixture.events[0]),
    to_state: "published",
    reason_code: "publication_authorized",
    actor: { actor_id: "principal-synthetic-publisher", actor_role: "publisher" }
  }));
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.reasonMismatch, () => transitionEvidenceLifecycle(initial, {
    ...commandFromEvent(fixture.events[0]),
    reason_code: "validation_passed"
  }));
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.actorUnauthorized, () => transitionEvidenceLifecycle(initial, {
    ...commandFromEvent(fixture.events[0]),
    actor: { actor_id: "principal-synthetic-reviewer", actor_role: "reviewer" }
  }));

  const published = replayEvidenceLifecycle(initial, fixture.events.slice(0, 3));
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.statusNoop, () => transitionEvidenceLifecycle(published, {
    event_id: "event-synthetic-noop",
    to_state: "published",
    reason_code: "status_changed",
    occurred_at: "2026-10-22T08:31:00.000Z",
    actor: { actor_id: "principal-synthetic-reviewer", actor_role: "reviewer" },
    replacement_ref: null,
    next_status_axes: published.status_axes
  }));
});

test("rejects backward axis transitions and terminal-state resurrection", () => {
  const expiring = replayEvidenceLifecycle(fixture.initial_snapshot, fixture.events.slice(0, 5));
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.statusTransitionNotAllowed, () => transitionEvidenceLifecycle(expiring, {
    event_id: "event-synthetic-freshness-reversal",
    to_state: "published",
    reason_code: "status_changed",
    occurred_at: "2026-11-20T08:01:00.000Z",
    actor: { actor_id: "system-synthetic-lifecycle", actor_role: "system" },
    replacement_ref: null,
    next_status_axes: { ...expiring.status_axes, freshness: "valid" }
  }));

  const expired = replayEvidenceLifecycle(fixture.initial_snapshot, fixture.events);
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.terminalState, () => transitionEvidenceLifecycle(expired, {
    event_id: "event-synthetic-resurrection",
    to_state: "published",
    reason_code: "status_changed",
    occurred_at: "2026-11-22T08:01:00.000Z",
    actor: { actor_id: "system-synthetic-lifecycle", actor_role: "system" },
    replacement_ref: null,
    next_status_axes: expired.status_axes
  }));
});

test("requires a higher same-tenant exact version for supersession", () => {
  const published = replayEvidenceLifecycle(fixture.initial_snapshot, fixture.events.slice(0, 3));
  const base = {
    event_id: "event-synthetic-replacement-published",
    to_state: "superseded",
    reason_code: "replacement_published",
    occurred_at: "2026-10-22T08:31:00.000Z",
    actor: { actor_id: "principal-synthetic-publisher", actor_role: "publisher" },
    next_status_axes: published.status_axes
  };
  for (const replacement_ref of [
    { ...published.evidence_ref, tenant_id: "tenant-synthetic-other", version: "1.1.0" },
    { ...published.evidence_ref, version: "1.0.0" },
    { ...published.evidence_ref, object_id: "evidence-synthetic-other", version: "1.1.0" }
  ]) {
    expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.replacementInvalid, () => transitionEvidenceLifecycle(published, { ...base, replacement_ref }));
  }
  const result = transitionEvidenceLifecycle(published, { ...base, replacement_ref: { ...published.evidence_ref, version: "1.1.0" } });
  assert.equal(result.snapshot.lifecycle_state, "superseded");
  assert.equal(result.event.replacement_ref.version, "1.1.0");
});

test("rejects unknown fields, stale time, broken sequences, and mismatched references", () => {
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.fieldUnknown, () => transitionEvidenceLifecycle(fixture.initial_snapshot, {
    ...commandFromEvent(fixture.events[0]),
    access_token: "must-not-be-carried"
  }));
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.timeInvalid, () => transitionEvidenceLifecycle(fixture.initial_snapshot, {
    ...commandFromEvent(fixture.events[0]),
    occurred_at: fixture.initial_snapshot.updated_at
  }));
  const sequence = structuredClone(fixture.events);
  sequence[1].sequence = 9;
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.historyMismatch, () => replayEvidenceLifecycle(fixture.initial_snapshot, sequence));
  const tenant = structuredClone(fixture.events);
  tenant[2].evidence_ref.tenant_id = "tenant-synthetic-other";
  expectCode(EVIDENCE_LIFECYCLE_ERROR_CODES.historyMismatch, () => replayEvidenceLifecycle(fixture.initial_snapshot, tenant));
});

test("publishes bilingual rules, stable errors, and public package boundaries", async () => {
  const [english, chinese, manifest, environment, sdk] = await Promise.all([
    readFile(new URL("../docs/evidence/status-and-lifecycle-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/status-and-lifecycle-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs")
  ]);
  for (const document of [english, chinese]) {
    assert.match(document, /single_status_allowed/);
    assert.match(document, /CT-603/);
    assert.match(document, /CT-607/);
    assert.match(document, /replacement_published/);
  }
  assert.ok(manifest.public_contracts.includes("specs/evidence/evidence-lifecycle-event-v1.schema.json"));
  assert.ok(manifest.public_tools.includes("packages/evidence-lifecycle/index.mjs"));
  assert.ok(environment.contract_tests.includes("tests/evidence-lifecycle.test.mjs"));
  assert.equal(typeof sdk.transitionEvidenceLifecycle, "function");
  assert.equal(typeof sdk.projectEvidenceStatus, "function");
  assert.equal(Object.values(EVIDENCE_LIFECYCLE_ERROR_CODES).length, new Set(Object.values(EVIDENCE_LIFECYCLE_ERROR_CODES)).size);
});
