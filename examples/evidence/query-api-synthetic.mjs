import {
  EVIDENCE_QUERY_ERROR_CODES,
  buildEvidenceQueryRequest,
  createEvidenceQueryError,
  createEvidenceQueryStatus,
  getEvidenceQueryRecord,
  queryEvidenceRecords
} from "../../packages/evidence-query/index.mjs";

function record({ id, version, publishedAt, protocol, metric, value, sites }) {
  return {
    schema_version: "1.0.0",
    record_type: "evidence_query_record",
    visibility: "public",
    evidence_id: id,
    version,
    content_fingerprint: `sha256:${(id.endsWith("a") ? "a" : "b").repeat(64)}`,
    published_at: publishedAt,
    lifecycle_state: "published",
    status: {
      measurement_validity: "partial",
      content_integrity: "passed",
      independent_review: "not-reviewed",
      freshness: "valid",
      policy_decision: "manual-review"
    },
    boundary: {
      statement: "Synthetic CT-608 query fixture; no production performance claim.",
      data_origin: "synthetic",
      limitations: ["Generated values", "No independent review"],
      performance_claim_allowed: false
    },
    scope: {
      site_labels: sites,
      direction: "unidirectional",
      workload_class: "inference",
      protocol: { name: protocol, version: "synthetic-v1" }
    },
    method: {
      method_id: "method-synthetic-ct608",
      version: "1.0.0",
      content_fingerprint: `sha256:${"c".repeat(64)}`,
      tool: { name: "ct-query-fixture", version: "1.0.0" }
    },
    metrics: [
      {
        metric,
        aggregation: "p50",
        unit: "ms",
        value,
        sample_count: 8,
        origin: "synthetic",
        quality: "partial"
      }
    ],
    links: {
      self: `https://evidence.example.invalid/v1/evidence-versions/${id}/versions/${version}`,
      status: `https://evidence.example.invalid/v1/evidence-versions/${id}/versions/${version}/status`,
      manifest: null
    },
    certification_issued: false
  };
}

const records = [
  record({
    id: "evidence-synthetic-ct608-a",
    version: "1.0.0",
    publishedAt: "2026-10-23T09:00:00.000Z",
    protocol: "gRPC",
    metric: "ttft",
    value: 100,
    sites: ["Synthetic Edge A", "Synthetic Region B"]
  }),
  record({
    id: "evidence-synthetic-ct608-b",
    version: "1.1.0",
    publishedAt: "2026-10-23T08:00:00.000Z",
    protocol: "QUIC",
    metric: "rtt",
    value: 10,
    sites: ["Synthetic Edge C", "Synthetic Region D"]
  })
];

const firstPage = queryEvidenceRecords(records, { data_origin: "synthetic", limit: 1 });
const secondPage = queryEvidenceRecords(records, {
  data_origin: "synthetic",
  limit: 1,
  cursor: firstPage.page.next_cursor
});
const exact = getEvidenceQueryRecord(records, {
  evidence_id: "evidence-synthetic-ct608-a",
  version: "1.0.0"
});
const status = createEvidenceQueryStatus(exact, {
  checkedAt: "2026-10-23T09:05:00.000Z",
  eventCursor: "event-synthetic-ct608-0001"
});
const requests = [
  buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1/",
    operation: "list",
    query: { data_origin: "synthetic", limit: 1 }
  }),
  buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1/",
    operation: "get",
    evidenceId: exact.evidence_id,
    version: exact.version,
    etag: '"synthetic-ct608-a-1.0.0"'
  }),
  buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1/",
    operation: "status",
    evidenceId: exact.evidence_id,
    version: exact.version
  })
];
const notFound = createEvidenceQueryError({
  code: EVIDENCE_QUERY_ERROR_CODES.notFound,
  message: "The exact synthetic evidence version was not found.",
  requestId: "request-synthetic-ct608",
  retryable: false
});

process.stdout.write(`${JSON.stringify({
  data_origin: "synthetic",
  performance_claim_allowed: false,
  public_record_count: records.length,
  first_page_count: firstPage.items.length,
  pagination_cursor_issued: firstPage.page.next_cursor !== null,
  second_page_count: secondPage.items.length,
  exact_version_required: exact.version === "1.0.0",
  status_cache_freshness_only: status.cache_freshness_only,
  read_only_methods_only: requests.every(({ method, body }) => method === "GET" && body === null),
  credentials_attached: requests.some(({ headers }) => Object.keys(headers).some((key) => key.toLowerCase() === "authorization")),
  private_fields_returned: records.some((item) => Object.hasOwn(item, "tenant_id") || Object.hasOwn(item, "storage_locator")),
  stable_error_code: notFound.error.code,
  certification_issued: false
}, null, 2)}\n`);
