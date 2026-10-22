import {
  consumeEvidenceInvalidationEvent,
  createEvidenceDownstreamProjection,
  createEvidenceInvalidationEvent,
  createEvidenceTtlContract,
  evaluateEvidenceDownstreamTtl,
  verifyEvidenceInvalidationEvent,
  verifyEvidenceTtlContract
} from "../../packages/evidence-invalidation/index.mjs";

const evidenceRef = {
  object_type: "evidence_version",
  object_id: "evidence-synthetic-link-passport",
  version: "1.0.0",
  tenant_id: "tenant-synthetic-public"
};

const contract = createEvidenceTtlContract({
  leaseId: "lease-synthetic-status-001",
  evidenceRef,
  lifecycleSequence: 3,
  sourceStatusFingerprint: `sha256:${"b".repeat(64)}`,
  statusCheckedAt: "2026-10-23T08:00:00.000Z",
  issuedAt: "2026-10-23T08:00:01.000Z",
  evidenceExpiresAt: "2026-10-23T09:00:00.000Z",
  maxCacheTtlSeconds: 300,
  statusQueryUri: "https://cloudtelecom.cn/api/evidence/evidence-synthetic-link-passport/versions/1.0.0/status"
});

const statusAxes = {
  measurement_validity: "partial",
  content_integrity: "passed",
  independent_review: "in-progress",
  freshness: "valid",
  policy_decision: "manual-review"
};

const lifecycleEvent = {
  schema_version: "1.0.0",
  event_id: "event-synthetic-lifecycle-superseded-001",
  evidence_ref: evidenceRef,
  sequence: 4,
  from: { lifecycle_state: "published", status_axes: statusAxes },
  to: { lifecycle_state: "superseded", status_axes: statusAxes },
  reason_code: "replacement_published",
  occurred_at: "2026-10-23T08:02:00.000Z",
  actor: { actor_id: "principal-synthetic-publisher", actor_role: "publisher" },
  replacement_ref: { ...evidenceRef, version: "1.1.0" }
};

const invalidationEvent = createEvidenceInvalidationEvent({
  eventId: "invalidation-synthetic-superseded-001",
  lifecycleEvent,
  emittedAt: "2026-10-23T08:02:01.000Z"
});

verifyEvidenceTtlContract(contract);
verifyEvidenceInvalidationEvent(invalidationEvent);

const consumers = ["marketplace-public", "sla-workflow", "scheduler-adapter"];
let idempotentReplayCount = 0;
const projections = consumers.map((consumerId, index) => {
  const initial = createEvidenceDownstreamProjection({
    consumerId,
    contract,
    cachedAt: "2026-10-23T08:00:05.000Z"
  });
  const first = consumeEvidenceInvalidationEvent(initial, invalidationEvent, {
    consumedAt: `2026-10-23T08:02:0${index + 2}.000Z`
  });
  const repeated = consumeEvidenceInvalidationEvent(first.projection, invalidationEvent, {
    consumedAt: `2026-10-23T08:02:0${index + 5}.000Z`
  });
  if (repeated.idempotent_replay) idempotentReplayCount += 1;
  return repeated.projection;
});

const disconnected = createEvidenceDownstreamProjection({
  consumerId: "offline-export",
  contract,
  cachedAt: "2026-10-23T08:00:05.000Z"
});
const ttlFallback = evaluateEvidenceDownstreamTtl(disconnected, {
  evaluatedAt: contract.ttl_expires_at
});

console.log(JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  event_type: invalidationEvent.event_type,
  consumer_count: consumers.length,
  event_invalidated_count: projections.filter(({ projection_state }) => projection_state === "invalidated").length,
  idempotent_replay_count: idempotentReplayCount,
  ttl_fallback_invalidated: ttlFallback.projection.invalidation_reason === "ttl_elapsed",
  all_downstreams_eventually_invalidated: projections.every(({ projection_state }) => projection_state === "invalidated")
    && ttlFallback.projection.projection_state === "invalidated",
  replacement_version: invalidationEvent.replacement_ref.version,
  delivery_semantics: invalidationEvent.delivery_semantics,
  fail_closed_on_ttl_expiry: contract.fail_closed_on_ttl_expiry,
  certification_issued: false
}));
