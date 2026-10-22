export const EVIDENCE_LIFECYCLE_VERSION = "1.0.0";

export const EVIDENCE_LIFECYCLE_STATES = Object.freeze([
  "draft",
  "validating",
  "sealed",
  "published",
  "expired",
  "superseded",
  "revoked"
]);

export const EVIDENCE_LIFECYCLE_ERROR_CODES = Object.freeze({
  inputInvalid: "evidence_lifecycle_input_invalid",
  fieldUnknown: "evidence_lifecycle_field_unknown",
  fieldMissing: "evidence_lifecycle_field_missing",
  referenceInvalid: "evidence_lifecycle_reference_invalid",
  stateInvalid: "evidence_lifecycle_state_invalid",
  transitionNotAllowed: "evidence_lifecycle_transition_not_allowed",
  terminalState: "evidence_lifecycle_terminal_state",
  reasonMismatch: "evidence_lifecycle_reason_mismatch",
  actorUnauthorized: "evidence_lifecycle_actor_unauthorized",
  timeInvalid: "evidence_lifecycle_time_invalid",
  sequenceInvalid: "evidence_lifecycle_sequence_invalid",
  historyMismatch: "evidence_lifecycle_history_mismatch",
  statusAxisInvalid: "evidence_status_axis_invalid",
  statusTransitionNotAllowed: "evidence_status_transition_not_allowed",
  statusNoop: "evidence_status_noop",
  replacementRequired: "evidence_lifecycle_replacement_required",
  replacementForbidden: "evidence_lifecycle_replacement_forbidden",
  replacementInvalid: "evidence_lifecycle_replacement_invalid"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const TERMINAL_STATES = new Set(["expired", "superseded", "revoked"]);
const STATE_SET = new Set(EVIDENCE_LIFECYCLE_STATES);

const AXIS_VALUES = Object.freeze({
  measurement_validity: Object.freeze(["sufficient", "partial", "invalid", "unknown"]),
  content_integrity: Object.freeze(["passed", "failed", "unverifiable"]),
  independent_review: Object.freeze(["not-reviewed", "in-progress", "consistent", "deviation", "uncertain"]),
  freshness: Object.freeze(["valid", "expiring", "expired", "unknown"]),
  policy_decision: Object.freeze(["accepted", "rejected", "manual-review"])
});

export const EVIDENCE_STATUS_AXES = Object.freeze(Object.fromEntries(
  Object.entries(AXIS_VALUES).map(([name, values]) => [name, values])
));

const STATUS_TRANSITIONS = Object.freeze({
  measurement_validity: Object.freeze({
    unknown: new Set(["unknown", "partial", "sufficient", "invalid"]),
    partial: new Set(["partial", "sufficient", "invalid"]),
    sufficient: new Set(["sufficient", "invalid"]),
    invalid: new Set(["invalid"])
  }),
  content_integrity: Object.freeze({
    unverifiable: new Set(["unverifiable", "passed", "failed"]),
    passed: new Set(["passed", "failed"]),
    failed: new Set(["failed"])
  }),
  independent_review: Object.freeze({
    "not-reviewed": new Set(["not-reviewed", "in-progress"]),
    "in-progress": new Set(["in-progress", "consistent", "deviation", "uncertain"]),
    consistent: new Set(["consistent"]),
    deviation: new Set(["deviation"]),
    uncertain: new Set(["uncertain"])
  }),
  freshness: Object.freeze({
    unknown: new Set(["unknown", "valid", "expiring", "expired"]),
    valid: new Set(["valid", "expiring", "expired"]),
    expiring: new Set(["expiring", "expired"]),
    expired: new Set(["expired"])
  }),
  policy_decision: Object.freeze({
    "manual-review": new Set(["manual-review", "accepted", "rejected"]),
    accepted: new Set(["accepted", "rejected"]),
    rejected: new Set(["rejected"])
  })
});

const TRANSITIONS = Object.freeze({
  draft: Object.freeze({ validating: "validation_requested" }),
  validating: Object.freeze({ draft: "validation_failed", sealed: "validation_passed" }),
  sealed: Object.freeze({ published: "publication_authorized" }),
  published: Object.freeze({ expired: "validity_elapsed", superseded: "replacement_published", revoked: "revocation_authorized" })
});

const REASON_ROLES = Object.freeze({
  validation_requested: new Set(["owner", "operator"]),
  validation_failed: new Set(["validator"]),
  validation_passed: new Set(["validator"]),
  publication_authorized: new Set(["publisher"]),
  status_changed: new Set(["reviewer", "policy-consumer", "system", "operator"]),
  validity_elapsed: new Set(["system", "operator"]),
  replacement_published: new Set(["publisher"]),
  revocation_authorized: new Set(["publisher", "operator"])
});

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, label) {
  if (!isObject(value)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.inputInvalid, `${label} must be a plain object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.fieldUnknown, `${label}.${key} is not allowed`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.fieldMissing, `${label}.${key} is required`);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.inputInvalid, `${label} is invalid`);
  return value;
}

function requireInstant(value, label) {
  if (typeof value !== "string") fail(EVIDENCE_LIFECYCLE_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return parsed.toISOString();
}

function parseSemver(value, label) {
  const match = typeof value === "string" ? value.match(SEMVER) : null;
  if (!match) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.referenceInvalid, `${label} must be a strict semantic version`);
  return { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? [] };
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue, "left version");
  const right = parseSemver(rightValue, "right version");
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left.prerelease[index]);
    const rightNumeric = /^\d+$/.test(right.prerelease[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(left.prerelease[index]) - Number(right.prerelease[index]);
      if (difference) return difference;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left.prerelease[index] !== right.prerelease[index]) {
      return left.prerelease[index] < right.prerelease[index] ? -1 : 1;
    }
  }
  return 0;
}

function normalizeEvidenceReference(value, label = "evidence_ref") {
  exactObject(value, ["object_type", "object_id", "version", "tenant_id"], label);
  if (value.object_type !== "evidence_version") {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.referenceInvalid, `${label}.object_type must equal evidence_version`);
  }
  parseSemver(value.version, `${label}.version`);
  return {
    object_type: "evidence_version",
    object_id: requireId(value.object_id, `${label}.object_id`),
    version: value.version,
    tenant_id: requireId(value.tenant_id, `${label}.tenant_id`)
  };
}

function normalizeStatusAxes(value, label = "status_axes") {
  const fields = Object.keys(AXIS_VALUES);
  exactObject(value, fields, label);
  const normalized = {};
  for (const field of fields) {
    if (!AXIS_VALUES[field].includes(value[field])) {
      fail(EVIDENCE_LIFECYCLE_ERROR_CODES.statusAxisInvalid, `${label}.${field} is outside the allowed vocabulary`);
    }
    normalized[field] = value[field];
  }
  return normalized;
}

function normalizeActor(value) {
  exactObject(value, ["actor_id", "actor_role"], "actor");
  const actorRole = requireId(value.actor_role, "actor.actor_role");
  if (!new Set(["owner", "operator", "validator", "publisher", "reviewer", "policy-consumer", "system"]).has(actorRole)) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.actorUnauthorized, `actor role ${actorRole} is not recognized`);
  }
  return { actor_id: requireId(value.actor_id, "actor.actor_id"), actor_role: actorRole };
}

function normalizeState(value, label) {
  if (typeof value !== "string" || !STATE_SET.has(value)) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.stateInvalid, `${label} is not an Evidence Core lifecycle state`);
  }
  return value;
}

function normalizeSnapshot(value) {
  exactObject(value, ["schema_version", "evidence_ref", "lifecycle_state", "status_axes", "sequence", "last_event_id", "updated_at"], "snapshot");
  if (value.schema_version !== EVIDENCE_LIFECYCLE_VERSION) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.inputInvalid, `snapshot.schema_version must equal ${EVIDENCE_LIFECYCLE_VERSION}`);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.sequenceInvalid, "snapshot.sequence must be a non-negative safe integer");
  if (value.last_event_id !== null) requireId(value.last_event_id, "snapshot.last_event_id");
  if ((value.sequence === 0) !== (value.last_event_id === null)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.sequenceInvalid, "snapshot sequence and last_event_id are inconsistent");
  return {
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    evidence_ref: normalizeEvidenceReference(value.evidence_ref),
    lifecycle_state: normalizeState(value.lifecycle_state, "snapshot.lifecycle_state"),
    status_axes: normalizeStatusAxes(value.status_axes),
    sequence: value.sequence,
    last_event_id: value.last_event_id,
    updated_at: requireInstant(value.updated_at, "snapshot.updated_at")
  };
}

function normalizeCommand(value) {
  exactObject(value, ["event_id", "to_state", "reason_code", "occurred_at", "actor", "replacement_ref", "next_status_axes"], "command");
  const reasonCode = requireId(value.reason_code, "command.reason_code");
  if (!Object.hasOwn(REASON_ROLES, reasonCode)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.reasonMismatch, `command.reason_code ${reasonCode} is not recognized`);
  return {
    event_id: requireId(value.event_id, "command.event_id"),
    to_state: normalizeState(value.to_state, "command.to_state"),
    reason_code: reasonCode,
    occurred_at: requireInstant(value.occurred_at, "command.occurred_at"),
    actor: normalizeActor(value.actor),
    replacement_ref: value.replacement_ref === null ? null : normalizeEvidenceReference(value.replacement_ref, "command.replacement_ref"),
    next_status_axes: normalizeStatusAxes(value.next_status_axes, "command.next_status_axes")
  };
}

function sameReference(left, right) {
  return ["object_type", "object_id", "version", "tenant_id"].every((field) => left[field] === right[field]);
}

function statusChanged(left, right) {
  return Object.keys(AXIS_VALUES).some((field) => left[field] !== right[field]);
}

function validateStatusTransitions(previous, next) {
  for (const field of Object.keys(AXIS_VALUES)) {
    if (!STATUS_TRANSITIONS[field][previous[field]].has(next[field])) {
      fail(EVIDENCE_LIFECYCLE_ERROR_CODES.statusTransitionNotAllowed, `${field} cannot move from ${previous[field]} to ${next[field]} within one EvidenceVersion`);
    }
  }
}

function validateReplacement(snapshot, command) {
  if (command.to_state === "superseded") {
    if (!command.replacement_ref) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.replacementRequired, "superseded requires replacement_ref");
    if (command.replacement_ref.tenant_id !== snapshot.evidence_ref.tenant_id
      || command.replacement_ref.object_id !== snapshot.evidence_ref.object_id
      || compareSemver(command.replacement_ref.version, snapshot.evidence_ref.version) <= 0) {
      fail(EVIDENCE_LIFECYCLE_ERROR_CODES.replacementInvalid, "replacement_ref must name a higher exact version of the same tenant-scoped evidence object");
    }
  } else if (command.replacement_ref !== null) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.replacementForbidden, "replacement_ref is allowed only when entering superseded");
  }
}

function validateLifecycleTransition(snapshot, command) {
  if (TERMINAL_STATES.has(snapshot.lifecycle_state)) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.terminalState, `${snapshot.lifecycle_state} is terminal`);
  }
  if (command.to_state === snapshot.lifecycle_state) {
    if (command.reason_code !== "status_changed") fail(EVIDENCE_LIFECYCLE_ERROR_CODES.reasonMismatch, "same-state events require status_changed");
    if (!statusChanged(snapshot.status_axes, command.next_status_axes)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.statusNoop, "status_changed must change at least one axis");
  } else {
    const expectedReason = TRANSITIONS[snapshot.lifecycle_state]?.[command.to_state];
    if (!expectedReason) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.transitionNotAllowed, `${snapshot.lifecycle_state} cannot transition to ${command.to_state}`);
    if (command.reason_code !== expectedReason) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.reasonMismatch, `${snapshot.lifecycle_state} -> ${command.to_state} requires ${expectedReason}`);
  }
  if (!REASON_ROLES[command.reason_code].has(command.actor.actor_role)) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.actorUnauthorized, `${command.actor.actor_role} cannot record ${command.reason_code}`);
  }
  if (command.to_state === "expired" && command.next_status_axes.freshness !== "expired") {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.statusTransitionNotAllowed, "expired lifecycle requires freshness=expired in the same event");
  }
}

function freezeResult(value) {
  Object.freeze(value.evidence_ref);
  Object.freeze(value.status_axes);
  return Object.freeze(value);
}

export function createEvidenceLifecycleSnapshot(input) {
  exactObject(input, ["evidence_ref", "status_axes", "created_at"], "input");
  return freezeResult({
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    evidence_ref: normalizeEvidenceReference(input.evidence_ref),
    lifecycle_state: "draft",
    status_axes: normalizeStatusAxes(input.status_axes),
    sequence: 0,
    last_event_id: null,
    updated_at: requireInstant(input.created_at, "input.created_at")
  });
}

export function transitionEvidenceLifecycle(snapshotInput, commandInput) {
  const snapshot = normalizeSnapshot(snapshotInput);
  const command = normalizeCommand(commandInput);
  if (Date.parse(command.occurred_at) <= Date.parse(snapshot.updated_at)) {
    fail(EVIDENCE_LIFECYCLE_ERROR_CODES.timeInvalid, "event time must be later than the previous lifecycle update");
  }
  validateStatusTransitions(snapshot.status_axes, command.next_status_axes);
  validateLifecycleTransition(snapshot, command);
  validateReplacement(snapshot, command);

  const event = {
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    event_id: command.event_id,
    evidence_ref: snapshot.evidence_ref,
    sequence: snapshot.sequence + 1,
    from: { lifecycle_state: snapshot.lifecycle_state, status_axes: snapshot.status_axes },
    to: { lifecycle_state: command.to_state, status_axes: command.next_status_axes },
    reason_code: command.reason_code,
    occurred_at: command.occurred_at,
    actor: command.actor,
    replacement_ref: command.replacement_ref
  };
  const nextSnapshot = {
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    evidence_ref: snapshot.evidence_ref,
    lifecycle_state: command.to_state,
    status_axes: command.next_status_axes,
    sequence: event.sequence,
    last_event_id: event.event_id,
    updated_at: event.occurred_at
  };
  Object.freeze(event.from.status_axes);
  Object.freeze(event.to.status_axes);
  Object.freeze(event.from);
  Object.freeze(event.to);
  Object.freeze(event.actor);
  if (event.replacement_ref) Object.freeze(event.replacement_ref);
  Object.freeze(event.evidence_ref);
  return Object.freeze({ snapshot: freezeResult(nextSnapshot), event: Object.freeze(event) });
}

function normalizeEvent(value) {
  exactObject(value, ["schema_version", "event_id", "evidence_ref", "sequence", "from", "to", "reason_code", "occurred_at", "actor", "replacement_ref"], "event");
  if (value.schema_version !== EVIDENCE_LIFECYCLE_VERSION) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.inputInvalid, `event.schema_version must equal ${EVIDENCE_LIFECYCLE_VERSION}`);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.sequenceInvalid, "event.sequence must be a positive safe integer");
  exactObject(value.from, ["lifecycle_state", "status_axes"], "event.from");
  exactObject(value.to, ["lifecycle_state", "status_axes"], "event.to");
  return {
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    event_id: requireId(value.event_id, "event.event_id"),
    evidence_ref: normalizeEvidenceReference(value.evidence_ref, "event.evidence_ref"),
    sequence: value.sequence,
    from: { lifecycle_state: normalizeState(value.from.lifecycle_state, "event.from.lifecycle_state"), status_axes: normalizeStatusAxes(value.from.status_axes, "event.from.status_axes") },
    to: { lifecycle_state: normalizeState(value.to.lifecycle_state, "event.to.lifecycle_state"), status_axes: normalizeStatusAxes(value.to.status_axes, "event.to.status_axes") },
    reason_code: requireId(value.reason_code, "event.reason_code"),
    occurred_at: requireInstant(value.occurred_at, "event.occurred_at"),
    actor: normalizeActor(value.actor),
    replacement_ref: value.replacement_ref === null ? null : normalizeEvidenceReference(value.replacement_ref, "event.replacement_ref")
  };
}

export function replayEvidenceLifecycle(initialSnapshotInput, historyInput) {
  if (!Array.isArray(historyInput)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.inputInvalid, "history must be an array");
  let snapshot = normalizeSnapshot(initialSnapshotInput);
  const seen = new Set();
  for (const rawEvent of historyInput) {
    const event = normalizeEvent(rawEvent);
    if (seen.has(event.event_id)) fail(EVIDENCE_LIFECYCLE_ERROR_CODES.sequenceInvalid, `duplicate event_id ${event.event_id}`);
    seen.add(event.event_id);
    if (event.sequence !== snapshot.sequence + 1 || !sameReference(event.evidence_ref, snapshot.evidence_ref)
      || event.from.lifecycle_state !== snapshot.lifecycle_state
      || JSON.stringify(event.from.status_axes) !== JSON.stringify(snapshot.status_axes)) {
      fail(EVIDENCE_LIFECYCLE_ERROR_CODES.historyMismatch, `event ${event.event_id} does not continue the current snapshot`);
    }
    const result = transitionEvidenceLifecycle(snapshot, {
      event_id: event.event_id,
      to_state: event.to.lifecycle_state,
      reason_code: event.reason_code,
      occurred_at: event.occurred_at,
      actor: event.actor,
      replacement_ref: event.replacement_ref,
      next_status_axes: event.to.status_axes
    });
    snapshot = result.snapshot;
  }
  return freezeResult(snapshot);
}

export function projectEvidenceStatus(snapshotInput) {
  const snapshot = normalizeSnapshot(snapshotInput);
  const blockers = [];
  if (snapshot.lifecycle_state !== "published") blockers.push(`lifecycle_${snapshot.lifecycle_state}`);
  if (snapshot.status_axes.measurement_validity !== "sufficient") blockers.push(`measurement_${snapshot.status_axes.measurement_validity}`);
  if (snapshot.status_axes.content_integrity !== "passed") blockers.push(`content_integrity_${snapshot.status_axes.content_integrity}`);
  if (snapshot.status_axes.independent_review !== "consistent") blockers.push(`independent_review_${snapshot.status_axes.independent_review}`);
  if (snapshot.status_axes.freshness !== "valid") blockers.push(`freshness_${snapshot.status_axes.freshness}`);
  if (snapshot.status_axes.policy_decision !== "accepted") blockers.push(`policy_decision_${snapshot.status_axes.policy_decision}`);
  return Object.freeze({
    schema_version: EVIDENCE_LIFECYCLE_VERSION,
    evidence_ref: Object.freeze(snapshot.evidence_ref),
    lifecycle_state: snapshot.lifecycle_state,
    status_axes: Object.freeze(snapshot.status_axes),
    blocking_conditions: Object.freeze(blockers),
    must_evaluate_all_axes: true,
    single_status_allowed: false,
    certification_issued: false
  });
}
