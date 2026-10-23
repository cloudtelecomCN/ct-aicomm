import {
  canonicalizeEvidenceValue,
  digestEvidenceBytes
} from "../evidence-integrity/index.mjs";
import { assertIndependentOpinionSignerEligible } from "./independence.mjs";
import { verifyIndependentReviewRecalculation } from "./recalculation.mjs";
import { verifyIndependentReviewSupervisedReexecution } from "./reexecution.mjs";

export const INDEPENDENT_REVIEW_OPINION_VERSION = "1.0.0";
export const INDEPENDENT_REVIEW_OPINION_OUTCOMES = Object.freeze([
  "consistent",
  "deviation",
  "uncertain"
]);
export const INDEPENDENT_REVIEW_OPINION_EVENT_TYPES = Object.freeze([
  "appeal-filed",
  "appeal-resolved",
  "correction-issued",
  "withdrawal-issued"
]);
export const INDEPENDENT_REVIEW_OPINION_ERROR_CODES = Object.freeze({
  inputInvalid: "independent_review_opinion_input_invalid",
  fieldUnknown: "independent_review_opinion_field_unknown",
  fieldMissing: "independent_review_opinion_field_missing",
  fingerprintMismatch: "independent_review_opinion_fingerprint_mismatch",
  contextMismatch: "independent_review_opinion_context_mismatch",
  timeInvalid: "independent_review_opinion_time_invalid",
  signerIneligible: "independent_review_opinion_signer_ineligible",
  sourceInvalid: "independent_review_opinion_source_invalid",
  actorUnauthorized: "independent_review_opinion_actor_unauthorized",
  eventInvalid: "independent_review_opinion_event_invalid",
  historyInvalid: "independent_review_opinion_history_invalid",
  correctionInvalid: "independent_review_opinion_correction_invalid",
  recordMismatch: "independent_review_opinion_record_mismatch"
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const OUTCOMES = new Set(INDEPENDENT_REVIEW_OPINION_OUTCOMES);
const EVENT_TYPES = new Set(INDEPENDENT_REVIEW_OPINION_EVENT_TYPES);
const ACTOR_ROLES = new Set(["commissioner", "evidence-submitter", "sales", "opinion-signer"]);
const REQUESTED_REMEDIES = new Set(["uphold", "correct", "withdraw"]);
const RESOLUTIONS = new Set(["upheld", "correction-required", "withdrawal-required"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, required, optional, label) {
  if (!isObject(value)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, `${label} must be an object`);
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fieldMissing, `${label}.${field} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fieldUnknown, `${label}.${field} is not allowed`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireString(value, label, { min = 1, max = 2000, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, `${label} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, `${label} must not contain control characters`);
  return value;
}

function requireId(value, label) {
  return requireString(value, label, { max: 128, pattern: ID });
}

function requireHash(value, label) {
  return requireString(value, label, { min: 71, max: 71, pattern: HASH });
}

function requireSemver(value, label) {
  return requireString(value, label, { max: 128, pattern: SEMVER });
}

function canonicalInstant(value, label) {
  const text = requireString(value, label, { max: 64 });
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.timeInvalid, `${label} must be a canonical UTC instant`);
  }
  return text;
}

function canonical(value) {
  return canonicalizeEvidenceValue(value);
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function fingerprint(value) {
  return digestEvidenceBytes(Buffer.from(canonical(value), "utf8"));
}

function reference(record, objectType, idKey) {
  return {
    object_type: objectType,
    object_id: record[idKey],
    version: record.version,
    tenant_id: record.tenant_id,
    content_fingerprint: record.content_fingerprint
  };
}

function commonContext(input) {
  return {
    engagement: input.engagement,
    independence_assessment: input.independence_assessment,
    share_grant: input.share_grant,
    share_revocations: input.share_revocations,
    passport_version: input.passport_version,
    passport_events: input.passport_events,
    delivery: input.delivery,
    ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
  };
}

function verifySources(input, recalculation, reexecution) {
  const context = commonContext(input);
  let independence;
  let verifiedRecalculation;
  try {
    independence = assertIndependentOpinionSignerEligible({
      record: input.independence_assessment,
      engagement: input.engagement,
      passport_version: input.passport_version,
      passport_events: input.passport_events,
      delivery: input.delivery,
      ...(input.previous_engagement === undefined ? {} : { previous_engagement: input.previous_engagement })
    });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.signerIneligible, `opinion signer gate failed: ${error.message}`);
  }
  try {
    verifiedRecalculation = verifyIndependentReviewRecalculation({ record: recalculation, ...context });
  } catch (error) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.sourceInvalid, `recalculation verification failed: ${error.message}`);
  }
  let verifiedReexecution = null;
  if (reexecution !== null && reexecution !== undefined) {
    try {
      verifiedReexecution = verifyIndependentReviewSupervisedReexecution({
        record: reexecution,
        historical_recalculation: verifiedRecalculation,
        ...context
      });
    } catch (error) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.sourceInvalid, `re-execution verification failed: ${error.message}`);
    }
  }
  if (independence.tenant_id !== verifiedRecalculation.tenant_id) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.contextMismatch, "opinion sources must use one tenant");
  }
  return { independence, recalculation: verifiedRecalculation, reexecution: verifiedReexecution };
}

function opinionSigner(independence) {
  const assignment = independence.role_assignments.find(({ role }) => role === "opinion-signer");
  const subject = independence.subjects.find(({ subject_id: id }) => id === assignment?.subject_id);
  if (!subject
      || subject.subject_id !== independence.gate.opinion_signer_subject_id
      || subject.organization_id !== independence.gate.opinion_signer_organization_id) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.signerIneligible, "eligible opinion signer does not match the role assignment");
  }
  return {
    subject_id: subject.subject_id,
    organization_id: subject.organization_id,
    role: "opinion-signer"
  };
}

function findingStatement(outcome) {
  if (outcome === "consistent") return "The independently recalculated results are consistent with the declared tolerance policy.";
  if (outcome === "deviation") return "One or more independently recalculated results are outside the declared tolerance policy.";
  return "The recalculation has no outside-tolerance result, but the later execution contains changed or unknown environment dimensions.";
}

function deriveFinding(recalculation, reexecution) {
  const statisticFindings = recalculation.statistics.map((statistic) => ({
    finding_id: `statistic:${statistic.statistic_id}`,
    source_type: "recalculation-statistic",
    source_id: statistic.statistic_id,
    outcome: statistic.result === "outside-tolerance" ? "deviation" : "consistent",
    source_result: statistic.result,
    explanation: statistic.explanation
  }));
  const environmentFindings = (reexecution?.environment_difference_register ?? []).map((difference) => ({
    finding_id: `environment:${difference.dimension}`,
    source_type: "environment-dimension",
    source_id: difference.dimension,
    outcome: difference.classification === "same" ? "consistent" : "uncertain",
    source_result: difference.classification,
    explanation: difference.classification === "same"
      ? "The known environment fingerprint matches the historical package."
      : "A changed or unknown environment dimension prevents a historical-state equivalence claim."
  }));
  const hasDeviation = recalculation.summary.outcome === "deviation";
  const hasEnvironmentUncertainty = environmentFindings.some(({ outcome }) => outcome === "uncertain");
  const outcome = hasDeviation ? "deviation" : (hasEnvironmentUncertainty ? "uncertain" : "consistent");
  const reasonCodes = [];
  if (hasDeviation) reasonCodes.push("outside-declared-tolerance");
  if (reexecution?.summary.changed_count > 0) reasonCodes.push("later-execution-environment-changed");
  if (reexecution?.summary.unknown_count > 0) reasonCodes.push("later-execution-environment-unknown");
  if (reasonCodes.length === 0) reasonCodes.push("within-declared-tolerance");
  const body = {
    outcome,
    basis: reexecution === null ? "statistical-recalculation" : "recalculation-and-later-execution",
    statement: findingStatement(outcome),
    reason_codes: reasonCodes,
    source_recalculation_fingerprint: recalculation.content_fingerprint,
    source_reexecution_fingerprint: reexecution?.content_fingerprint ?? null,
    statistic_findings: statisticFindings,
    environment_findings: environmentFindings,
    historical_state_reproduced: false,
    performance_conclusion_issued: false
  };
  return deepFreeze({ ...body, finding_fingerprint: fingerprint(body) });
}

function opinionBoundary() {
  return {
    opinion_issued: true,
    finding_derived_from_verified_sources: true,
    append_only_lifecycle_required: true,
    submitter_may_modify_finding: false,
    sales_may_modify_finding: false,
    independence_basis: "declared-records-only",
    principal_authentication_verified: false,
    organization_control_externally_verified: false,
    export_authorization_externally_verified: false,
    reviewer_independence_certified: false,
    historical_state_reproduced: false,
    passport_status_mutated: false,
    performance_claim_allowed: false,
    sla_adjudicated: false,
    certification_issued: false
  };
}

function buildOpinion(input) {
  const issuedAt = canonicalInstant(input.issued_at, "input.issued_at");
  const sources = verifySources(input, input.recalculation, input.reexecution ?? null);
  const signer = opinionSigner(sources.independence);
  const createdBy = requireId(input.created_by, "input.created_by");
  if (createdBy !== signer.subject_id) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, "only the eligible opinion signer may issue the opinion");
  }
  const latestSourceTime = sources.reexecution?.recorded_at ?? sources.recalculation.recalculated_at;
  if (Date.parse(issuedAt) < Date.parse(latestSourceTime)) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.timeInvalid, "opinion cannot predate its latest source record");
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_OPINION_VERSION,
    record_type: "independent_review_opinion",
    opinion_id: requireId(input.opinion_id, "input.opinion_id"),
    version: requireSemver(input.version, "input.version"),
    tenant_id: sources.recalculation.tenant_id,
    created_by: createdBy,
    issued_at: issuedAt,
    engagement_ref: reference(input.engagement, "independent_review_engagement", "engagement_id"),
    independence_assessment_ref: reference(sources.independence, "independent_review_independence_assessment", "assessment_id"),
    recalculation_ref: reference(sources.recalculation, "independent_review_recalculation", "recalculation_id"),
    reexecution_ref: sources.reexecution === null
      ? null
      : reference(sources.reexecution, "independent_review_supervised_reexecution", "reexecution_id"),
    signer,
    finding: deriveFinding(sources.recalculation, sources.reexecution),
    boundary: opinionBoundary()
  };
  return deepFreeze({ ...body, content_fingerprint: fingerprint(body) });
}

function normalizeOpinion(value, label = "opinion") {
  exactObject(value, [
    "schema_version", "record_type", "opinion_id", "version", "tenant_id", "created_by",
    "issued_at", "engagement_ref", "independence_assessment_ref", "recalculation_ref",
    "reexecution_ref", "signer", "finding", "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_OPINION_VERSION || value.record_type !== "independent_review_opinion") {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, `${label} has an unsupported schema or record type`);
  }
  requireId(value.opinion_id, `${label}.opinion_id`);
  requireSemver(value.version, `${label}.version`);
  requireId(value.tenant_id, `${label}.tenant_id`);
  requireId(value.created_by, `${label}.created_by`);
  canonicalInstant(value.issued_at, `${label}.issued_at`);
  if (!isObject(value.signer) || value.signer.role !== "opinion-signer" || value.signer.subject_id !== value.created_by) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, `${label}.signer is invalid`);
  }
  if (!isObject(value.finding) || !OUTCOMES.has(value.finding.outcome)) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, `${label}.finding is invalid`);
  }
  requireHash(value.finding.finding_fingerprint, `${label}.finding.finding_fingerprint`);
  const stored = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  const body = structuredClone(value);
  delete body.content_fingerprint;
  if (fingerprint(body) !== stored) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the record`);
  }
  return deepFreeze(structuredClone(value));
}

function assignmentSubject(independence, role) {
  return independence.role_assignments.find((assignment) => assignment.role === role)?.subject_id ?? null;
}

function normalizeActor(value, label) {
  exactObject(value, ["subject_id", "organization_id", "role"], [], label);
  const actor = {
    subject_id: requireId(value.subject_id, `${label}.subject_id`),
    organization_id: requireId(value.organization_id, `${label}.organization_id`),
    role: requireString(value.role, `${label}.role`, { max: 32 })
  };
  if (!ACTOR_ROLES.has(actor.role)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, `${label}.role is not permitted`);
  return actor;
}

function assertActor(input, actor, eventType, opinion, independence) {
  if (eventType === "appeal-filed") {
    if (!new Set(["commissioner", "evidence-submitter", "sales"]).has(actor.role)) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, "only an interested non-signer role may file an appeal");
    }
    if (actor.role === "sales") {
      if (actor.organization_id !== input.engagement.commissioning_party.organization_id) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, "sales appeals must belong to the commissioning organization");
      }
      return;
    }
    const expectedSubject = assignmentSubject(independence, actor.role);
    const expected = independence.subjects.find(({ subject_id: id }) => id === expectedSubject);
    if (!expected || actor.subject_id !== expected.subject_id || actor.organization_id !== expected.organization_id) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, `${actor.role} does not match the CT-617 assignment`);
    }
    return;
  }
  if (actor.role !== "opinion-signer"
      || actor.subject_id !== opinion.signer.subject_id
      || actor.organization_id !== opinion.signer.organization_id) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, "only the eligible opinion signer may resolve, correct, or withdraw a finding");
  }
}

function normalizeEvent(value, label = "event") {
  exactObject(value, [
    "schema_version", "record_type", "event_id", "version", "tenant_id", "opinion_ref",
    "sequence", "event_type", "occurred_at", "actor", "reason", "appeal_id",
    "requested_remedy", "resolution", "replacement", "previous_event_fingerprint",
    "boundary", "content_fingerprint"
  ], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_OPINION_VERSION || value.record_type !== "independent_review_opinion_event") {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, `${label} has an unsupported schema or record type`);
  }
  requireId(value.event_id, `${label}.event_id`);
  requireSemver(value.version, `${label}.version`);
  requireId(value.tenant_id, `${label}.tenant_id`);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, `${label}.sequence is invalid`);
  if (!EVENT_TYPES.has(value.event_type)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, `${label}.event_type is invalid`);
  canonicalInstant(value.occurred_at, `${label}.occurred_at`);
  normalizeActor(value.actor, `${label}.actor`);
  requireString(value.reason, `${label}.reason`, { min: 8, max: 2000 });
  if (value.appeal_id !== null) requireId(value.appeal_id, `${label}.appeal_id`);
  if (value.previous_event_fingerprint !== null) requireHash(value.previous_event_fingerprint, `${label}.previous_event_fingerprint`);
  const stored = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  const body = structuredClone(value);
  delete body.content_fingerprint;
  if (fingerprint(body) !== stored) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the event`);
  return deepFreeze(structuredClone(value));
}

function replayHistory(opinionValue, eventValues) {
  const opinion = normalizeOpinion(opinionValue);
  if (!Array.isArray(eventValues) || eventValues.length > 1024) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "events must be an array of at most 1024 records");
  }
  const events = eventValues.map((event, index) => normalizeEvent(event, `events[${index}]`));
  const appeals = new Map();
  const eventIds = new Set();
  let previousFingerprint = null;
  let previousTime = opinion.issued_at;
  let currentFinding = opinion.finding;
  let currentSources = {
    recalculation_ref: opinion.recalculation_ref,
    reexecution_ref: opinion.reexecution_ref
  };
  let status = "issued";
  let correctionCount = 0;
  let withdrawnAt = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1 || event.previous_event_fingerprint !== previousFingerprint) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, `events[${index}] breaks the append-only sequence or fingerprint chain`);
    }
    if (eventIds.has(event.event_id)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, `events[${index}].event_id is duplicated`);
    eventIds.add(event.event_id);
    if (event.tenant_id !== opinion.tenant_id || event.opinion_ref.content_fingerprint !== opinion.content_fingerprint) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, `events[${index}] does not bind the exact opinion`);
    }
    if (Date.parse(event.occurred_at) < Date.parse(previousTime)) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, `events[${index}] is not chronological`);
    }
    if (status === "withdrawn") fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "withdrawal is terminal");
    if (event.event_type !== "appeal-filed"
        && (event.actor.role !== "opinion-signer"
          || event.actor.subject_id !== opinion.signer.subject_id
          || event.actor.organization_id !== opinion.signer.organization_id)) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.actorUnauthorized, "a non-signer cannot resolve, correct, or withdraw a finding");
    }
    if (event.event_type === "appeal-filed") {
      if (event.appeal_id === null || appeals.has(event.appeal_id) || !REQUESTED_REMEDIES.has(event.requested_remedy)
          || event.resolution !== null || event.replacement !== null) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "appeal-filed event is invalid");
      }
      appeals.set(event.appeal_id, {
        appeal_id: event.appeal_id,
        status: "open",
        requested_remedy: event.requested_remedy,
        disputed_finding_fingerprint: currentFinding.finding_fingerprint,
        filed_event_id: event.event_id,
        resolution: null,
        resolved_event_id: null,
        remedy_event_id: null
      });
      status = "under-appeal";
    } else if (event.event_type === "appeal-resolved") {
      const appeal = appeals.get(event.appeal_id);
      if (!appeal || appeal.status !== "open" || !RESOLUTIONS.has(event.resolution)
          || event.requested_remedy !== null || event.replacement !== null) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "appeal-resolved event does not resolve one open appeal");
      }
      appeal.status = event.resolution === "upheld" ? "closed" : "remedy-required";
      appeal.resolution = event.resolution;
      appeal.resolved_event_id = event.event_id;
      status = event.resolution === "upheld" ? (correctionCount > 0 ? "corrected" : "issued") : event.resolution;
    } else if (event.event_type === "correction-issued") {
      const appeal = appeals.get(event.appeal_id);
      if (!appeal || appeal.status !== "remedy-required" || appeal.resolution !== "correction-required"
          || event.replacement === null || event.requested_remedy !== null || event.resolution !== null) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "correction must satisfy one correction-required appeal");
      }
      if (event.replacement.finding.finding_fingerprint === currentFinding.finding_fingerprint) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid, "correction must change the source-bound finding");
      }
      currentFinding = event.replacement.finding;
      currentSources = {
        recalculation_ref: event.replacement.recalculation_ref,
        reexecution_ref: event.replacement.reexecution_ref
      };
      correctionCount += 1;
      appeal.status = "closed";
      appeal.remedy_event_id = event.event_id;
      status = "corrected";
    } else {
      const appeal = appeals.get(event.appeal_id);
      if (!appeal || appeal.status !== "remedy-required" || appeal.resolution !== "withdrawal-required"
          || event.replacement !== null || event.requested_remedy !== null || event.resolution !== null) {
        fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.historyInvalid, "withdrawal must satisfy one withdrawal-required appeal");
      }
      appeal.status = "closed";
      appeal.remedy_event_id = event.event_id;
      status = "withdrawn";
      withdrawnAt = event.occurred_at;
    }
    previousFingerprint = event.content_fingerprint;
    previousTime = event.occurred_at;
  }
  const appealHistory = [...appeals.values()];
  return deepFreeze({
    opinion_ref: reference(opinion, "independent_review_opinion", "opinion_id"),
    status,
    current_finding: currentFinding,
    current_sources: currentSources,
    event_count: events.length,
    correction_count: correctionCount,
    appeal_count: appealHistory.length,
    open_appeal_count: appealHistory.filter(({ status: appealStatus }) => appealStatus !== "closed").length,
    appeals: appealHistory,
    last_event_fingerprint: previousFingerprint,
    withdrawn_at: withdrawnAt,
    history_complete: true,
    original_opinion_retained: true
  });
}

function opinionReference(opinion) {
  return reference(opinion, "independent_review_opinion", "opinion_id");
}

function buildEvent(input) {
  const opinion = normalizeOpinion(input.opinion);
  const history = Array.isArray(input.events) ? input.events : fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, "input.events must be an array");
  const projection = replayHistory(opinion, history);
  const eventType = requireString(input.event_type, "input.event_type", { max: 32 });
  if (!EVENT_TYPES.has(eventType)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, "input.event_type is invalid");
  const occurredAt = canonicalInstant(input.occurred_at, "input.occurred_at");
  const latestTime = history.length === 0 ? opinion.issued_at : history.at(-1).occurred_at;
  if (Date.parse(occurredAt) < Date.parse(latestTime)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.timeInvalid, "event cannot predate opinion history");
  const sources = verifySources(input, input.recalculation, input.reexecution ?? null);
  const expectedOpinion = buildOpinion({
    opinion_id: opinion.opinion_id,
    version: opinion.version,
    created_by: opinion.created_by,
    issued_at: opinion.issued_at,
    recalculation: input.recalculation,
    reexecution: input.reexecution ?? null,
    ...commonContext(input)
  });
  if (!same(opinion, expectedOpinion)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.contextMismatch, "opinion does not match the verified lifecycle context");
  const actor = normalizeActor(input.actor, "input.actor");
  assertActor(input, actor, eventType, opinion, sources.independence);
  const appealId = input.appeal_id === null || input.appeal_id === undefined ? null : requireId(input.appeal_id, "input.appeal_id");
  let requestedRemedy = null;
  let resolution = null;
  let replacement = null;
  if (eventType === "appeal-filed") {
    requestedRemedy = requireString(input.requested_remedy, "input.requested_remedy", { max: 32 });
    if (!REQUESTED_REMEDIES.has(requestedRemedy)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, "requested remedy is invalid");
  } else if (eventType === "appeal-resolved") {
    resolution = requireString(input.resolution, "input.resolution", { max: 32 });
    if (!RESOLUTIONS.has(resolution)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.eventInvalid, "appeal resolution is invalid");
  } else if (eventType === "correction-issued") {
    if (!isObject(input.replacement_source)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid, "correction requires replacement_source");
    exactObject(input.replacement_source, ["recalculation"], ["reexecution"], "input.replacement_source");
    const replacementSources = verifySources(
      input,
      input.replacement_source.recalculation,
      input.replacement_source.reexecution ?? null
    );
    const finding = deriveFinding(replacementSources.recalculation, replacementSources.reexecution);
    replacement = {
      recalculation_ref: reference(replacementSources.recalculation, "independent_review_recalculation", "recalculation_id"),
      reexecution_ref: replacementSources.reexecution === null
        ? null
        : reference(replacementSources.reexecution, "independent_review_supervised_reexecution", "reexecution_id"),
      finding
    };
    if (replacement.finding.finding_fingerprint === projection.current_finding.finding_fingerprint) {
      fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid, "replacement source does not change the current finding");
    }
  }
  const body = {
    schema_version: INDEPENDENT_REVIEW_OPINION_VERSION,
    record_type: "independent_review_opinion_event",
    event_id: requireId(input.event_id, "input.event_id"),
    version: requireSemver(input.version, "input.version"),
    tenant_id: opinion.tenant_id,
    opinion_ref: opinionReference(opinion),
    sequence: history.length + 1,
    event_type: eventType,
    occurred_at: occurredAt,
    actor,
    reason: requireString(input.reason, "input.reason", { min: 8, max: 2000 }),
    appeal_id: appealId,
    requested_remedy: requestedRemedy,
    resolution,
    replacement,
    previous_event_fingerprint: history.length === 0 ? null : history.at(-1).content_fingerprint,
    boundary: {
      append_only: true,
      prior_opinion_retained: true,
      finding_modified: eventType === "correction-issued",
      submitter_may_modify_finding: false,
      sales_may_modify_finding: false,
      performance_claim_allowed: false,
      certification_issued: false
    }
  };
  const event = deepFreeze({ ...body, content_fingerprint: fingerprint(body) });
  replayHistory(opinion, [...history, event]);
  return event;
}

function buildLifecycle(opinionValue, eventValues) {
  const opinion = normalizeOpinion(opinionValue);
  const events = eventValues.map((event, index) => normalizeEvent(event, `events[${index}]`));
  const projection = replayHistory(opinion, events);
  const body = {
    schema_version: INDEPENDENT_REVIEW_OPINION_VERSION,
    record_type: "independent_review_opinion_lifecycle",
    opinion,
    events,
    projection,
    boundary: {
      complete_append_only_history: true,
      original_opinion_retained: true,
      appeals_do_not_modify_findings: true,
      only_eligible_signer_may_correct_or_withdraw: true,
      performance_claim_allowed: false,
      certification_issued: false
    }
  };
  return deepFreeze({ ...body, content_fingerprint: fingerprint(body) });
}

function normalizeLifecycle(value, label = "lifecycle") {
  exactObject(value, ["schema_version", "record_type", "opinion", "events", "projection", "boundary", "content_fingerprint"], [], label);
  if (value.schema_version !== INDEPENDENT_REVIEW_OPINION_VERSION || value.record_type !== "independent_review_opinion_lifecycle") {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, `${label} has an unsupported schema or record type`);
  }
  const stored = requireHash(value.content_fingerprint, `${label}.content_fingerprint`);
  const body = structuredClone(value);
  delete body.content_fingerprint;
  if (fingerprint(body) !== stored) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.fingerprintMismatch, `${label}.content_fingerprint does not match the lifecycle`);
  return deepFreeze(structuredClone(value));
}

export function createIndependentReviewOpinion(input) {
  exactObject(input, [
    "opinion_id", "version", "created_by", "issued_at", "engagement", "independence_assessment",
    "share_grant", "share_revocations", "passport_version", "passport_events", "delivery", "recalculation"
  ], ["previous_engagement", "reexecution"], "input");
  if (!Array.isArray(input.share_revocations) || !Array.isArray(input.passport_events)) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, "share_revocations and passport_events must be arrays");
  }
  return normalizeOpinion(buildOpinion(input));
}

export function verifyIndependentReviewOpinion(input) {
  exactObject(input, [
    "opinion", "engagement", "independence_assessment", "share_grant", "share_revocations",
    "passport_version", "passport_events", "delivery", "recalculation"
  ], ["previous_engagement", "reexecution"], "input");
  const opinion = normalizeOpinion(input.opinion);
  const rebuilt = buildOpinion({
    opinion_id: opinion.opinion_id,
    version: opinion.version,
    created_by: opinion.created_by,
    issued_at: opinion.issued_at,
    ...input
  });
  if (!same(opinion, rebuilt)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, "opinion does not match its verified sources");
  return opinion;
}

export function createIndependentReviewOpinionEvent(input) {
  exactObject(input, [
    "event_id", "version", "event_type", "occurred_at", "actor", "reason", "opinion", "events",
    "engagement", "independence_assessment", "share_grant", "share_revocations", "passport_version",
    "passport_events", "delivery", "recalculation"
  ], ["appeal_id", "requested_remedy", "resolution", "replacement_source", "previous_engagement", "reexecution"], "input");
  return normalizeEvent(buildEvent(input));
}

export function projectIndependentReviewOpinion(input) {
  exactObject(input, ["opinion", "events"], [], "input");
  return replayHistory(input.opinion, input.events);
}

export function createIndependentReviewOpinionLifecycle(input) {
  exactObject(input, ["opinion", "events"], [], "input");
  return normalizeLifecycle(buildLifecycle(input.opinion, input.events));
}

export function verifyIndependentReviewOpinionLifecycle(input) {
  exactObject(input, [
    "lifecycle", "engagement", "independence_assessment", "share_grant", "share_revocations",
    "passport_version", "passport_events", "delivery", "recalculation", "correction_sources"
  ], ["previous_engagement", "reexecution"], "input");
  if (!Array.isArray(input.correction_sources)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.inputInvalid, "correction_sources must be an array");
  const lifecycle = normalizeLifecycle(input.lifecycle);
  const opinion = verifyIndependentReviewOpinion({ opinion: lifecycle.opinion, ...commonContext(input), recalculation: input.recalculation, reexecution: input.reexecution ?? null });
  const verifiedEvents = [];
  const correctionByEvent = new Map(input.correction_sources.map((source) => {
    exactObject(source, ["event_id", "recalculation"], ["reexecution"], "correction_sources[]");
    return [requireId(source.event_id, "correction_sources[].event_id"), source];
  }));
  for (const event of lifecycle.events) {
    const correctionSource = correctionByEvent.get(event.event_id);
    const rebuilt = buildEvent({
      event_id: event.event_id,
      version: event.version,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      actor: event.actor,
      reason: event.reason,
      opinion,
      events: verifiedEvents,
      appeal_id: event.appeal_id,
      ...(event.requested_remedy === null ? {} : { requested_remedy: event.requested_remedy }),
      ...(event.resolution === null ? {} : { resolution: event.resolution }),
      ...(event.event_type === "correction-issued"
        ? {
            replacement_source: {
              recalculation: correctionSource?.recalculation,
              ...(correctionSource?.reexecution === undefined ? {} : { reexecution: correctionSource.reexecution })
            }
          }
        : {}),
      ...commonContext(input),
      recalculation: input.recalculation,
      reexecution: input.reexecution ?? null
    });
    if (!same(event, rebuilt)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, `${event.event_id} does not match the verified lifecycle transition`);
    verifiedEvents.push(event);
  }
  if (correctionByEvent.size !== lifecycle.events.filter(({ event_type: type }) => type === "correction-issued").length) {
    fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.correctionInvalid, "correction_sources must cover exactly the correction events");
  }
  const rebuiltLifecycle = buildLifecycle(opinion, verifiedEvents);
  if (!same(lifecycle, rebuiltLifecycle)) fail(INDEPENDENT_REVIEW_OPINION_ERROR_CODES.recordMismatch, "lifecycle projection does not match its complete event history");
  return lifecycle;
}
