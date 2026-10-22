export const EVIDENCE_QUERY_VERSION: "1.0.0";
export const EVIDENCE_QUERY_OPERATIONS: readonly ["list", "get", "status"];
export const EVIDENCE_QUERY_ERROR_CODES: Readonly<{
  inputInvalid: "invalid_request";
  cursorInvalid: "invalid_cursor";
  versionRequired: "version_required";
  notFound: "not_found";
  rateLimited: "rate_limited";
  temporarilyUnavailable: "temporarily_unavailable";
  responseInvalid: "response_invalid";
  privateField: "private_field_forbidden";
  fieldUnknown: "field_unknown";
}>;

export type EvidenceQueryLifecycleState = "published" | "expired" | "superseded" | "revoked";
export type EvidenceQueryDataOrigin = "synthetic" | "hybrid" | "measured";
export type EvidenceQueryWorkloadClass = "network-transfer" | "inference" | "training" | "other";

export interface EvidenceQueryStatusAxes {
  measurement_validity: "sufficient" | "partial" | "invalid" | "unknown";
  content_integrity: "passed" | "failed" | "unverifiable";
  independent_review: "not-reviewed" | "in-progress" | "consistent" | "deviation" | "uncertain";
  freshness: "valid" | "expiring" | "expired" | "unknown";
  policy_decision: "accepted" | "rejected" | "manual-review";
}

export interface EvidenceQueryBoundary {
  statement: string;
  data_origin: EvidenceQueryDataOrigin;
  limitations: string[];
  performance_claim_allowed: boolean;
}

export interface EvidenceQueryMetric {
  metric: string;
  aggregation: "raw" | "count" | "mean" | "min" | "max" | "p50" | "p95" | "p99";
  unit: string;
  value: number;
  sample_count: number;
  origin: "measured" | "synthetic" | "inferred" | "declared";
  quality: "valid" | "partial" | "invalid" | "unknown";
}

export interface EvidenceQueryRecord {
  schema_version: "1.0.0";
  record_type: "evidence_query_record";
  visibility: "public";
  evidence_id: string;
  version: string;
  content_fingerprint: `sha256:${string}`;
  published_at: string;
  lifecycle_state: EvidenceQueryLifecycleState;
  status: EvidenceQueryStatusAxes;
  boundary: EvidenceQueryBoundary;
  scope: {
    site_labels: string[];
    direction: "unidirectional" | "bidirectional";
    workload_class: EvidenceQueryWorkloadClass;
    protocol: { name: string; version: string };
  };
  method: {
    method_id: string;
    version: string;
    content_fingerprint: `sha256:${string}`;
    tool: { name: string; version: string };
  };
  metrics: EvidenceQueryMetric[];
  links: { self: string; status: string; manifest: string | null };
  certification_issued: false;
}

export interface EvidenceQuery {
  cursor?: string | null;
  limit?: number;
  data_origin?: EvidenceQueryDataOrigin | null;
  lifecycle_state?: EvidenceQueryLifecycleState | null;
  measurement_validity?: EvidenceQueryStatusAxes["measurement_validity"] | null;
  content_integrity?: EvidenceQueryStatusAxes["content_integrity"] | null;
  independent_review?: EvidenceQueryStatusAxes["independent_review"] | null;
  freshness?: EvidenceQueryStatusAxes["freshness"] | null;
  policy_decision?: EvidenceQueryStatusAxes["policy_decision"] | null;
  workload_class?: EvidenceQueryWorkloadClass | null;
  protocol?: string | null;
  site?: string | null;
}

export interface NormalizedEvidenceQuery extends Required<EvidenceQuery> {}

export interface EvidenceQueryListResponse {
  schema_version: "1.0.0";
  response_type: "evidence_query_list";
  query_fingerprint: `sha256:${string}`;
  items: EvidenceQueryRecord[];
  page: { limit: number; returned: number; next_cursor: string | null };
  boundary: {
    public_projection_only: true;
    private_data_returned: false;
    certification_issued: false;
  };
}

export interface EvidenceQueryStatusResponse {
  schema_version: "1.0.0";
  response_type: "evidence_query_status";
  evidence_id: string;
  version: string;
  content_fingerprint: `sha256:${string}`;
  lifecycle_state: EvidenceQueryLifecycleState;
  status: EvidenceQueryStatusAxes;
  boundary: EvidenceQueryBoundary;
  checked_at: string;
  event_cursor: string | null;
  cache_freshness_only: true;
  certification_issued: false;
}

export type EvidenceQueryErrorCode = typeof EVIDENCE_QUERY_ERROR_CODES[keyof typeof EVIDENCE_QUERY_ERROR_CODES];

export interface EvidenceQueryErrorResponse {
  schema_version: "1.0.0";
  response_type: "evidence_query_error";
  error: {
    code: EvidenceQueryErrorCode;
    message: string;
    request_id: string;
    retryable: boolean;
    field: string | null;
  };
}

export interface EvidenceQueryRequest {
  method: "GET";
  url: string;
  headers: Readonly<{ Accept: "application/json"; "If-None-Match"?: string }>;
  body: null;
}

export function validateEvidenceQueryRecord(record: unknown): EvidenceQueryRecord;
export function normalizeEvidenceQuery(query?: EvidenceQuery): NormalizedEvidenceQuery;
export function queryEvidenceRecords(records: unknown[], query?: EvidenceQuery): EvidenceQueryListResponse;
export function getEvidenceQueryRecord(records: unknown[], reference: { evidence_id: string; version?: string | null }): EvidenceQueryRecord;
export function createEvidenceQueryStatus(record: unknown, options: { checkedAt: string; eventCursor?: string | null }): EvidenceQueryStatusResponse;
export function createEvidenceQueryError(options: {
  code: EvidenceQueryErrorCode;
  message: string;
  requestId: string;
  retryable?: boolean;
  field?: string | null;
}): EvidenceQueryErrorResponse;
export function validateEvidenceQueryError(value: unknown): EvidenceQueryErrorResponse;
export function buildEvidenceQueryRequest(options: {
  baseUrl: string;
  operation: "list";
  query?: EvidenceQuery;
  etag?: string;
} | {
  baseUrl: string;
  operation: "get" | "status";
  evidenceId: string;
  version: string;
  etag?: string;
}): EvidenceQueryRequest;
