import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  EVIDENCE_QUERY_ERROR_CODES,
  EVIDENCE_QUERY_OPERATIONS,
  buildEvidenceQueryRequest,
  createEvidenceQueryError,
  createEvidenceQueryStatus,
  getEvidenceQueryRecord,
  normalizeEvidenceQuery,
  queryEvidenceRecords,
  validateEvidenceQueryError,
  validateEvidenceQueryRecord
} from "../packages/evidence-query/index.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const [openapi, recordSchema, statusSchema, errorSchema] = await Promise.all([
  readFile(new URL("../specs/evidence/evidence-query-api-v1.openapi.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../specs/evidence/evidence-query-record-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../specs/evidence/evidence-query-status-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../specs/evidence/evidence-query-error-v1.schema.json", import.meta.url), "utf8").then(JSON.parse)
]);

function expectCode(expected, action) {
  assert.throws(action, (error) => error?.code === expected, `expected ${expected}`);
}

function record(overrides = {}) {
  const id = overrides.evidence_id ?? "evidence-synthetic-ct608-a";
  const version = overrides.version ?? "1.0.0";
  return {
    schema_version: "1.0.0",
    record_type: "evidence_query_record",
    visibility: "public",
    evidence_id: id,
    version,
    content_fingerprint: `sha256:${"a".repeat(64)}`,
    published_at: "2026-10-23T09:00:00.000Z",
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
      site_labels: ["Synthetic Edge A", "Synthetic Region B"],
      direction: "unidirectional",
      workload_class: "inference",
      protocol: { name: "gRPC", version: "synthetic-v1" }
    },
    method: {
      method_id: "method-synthetic-ct608",
      version: "1.0.0",
      content_fingerprint: `sha256:${"b".repeat(64)}`,
      tool: { name: "ct-query-fixture", version: "1.0.0" }
    },
    metrics: [
      {
        metric: "ttft",
        aggregation: "p50",
        unit: "ms",
        value: 100,
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
    certification_issued: false,
    ...overrides
  };
}

function resolveParameter(parameter) {
  if (!parameter.$ref) return parameter;
  const name = parameter.$ref.split("/").at(-1);
  return openapi.components.parameters[name];
}

test("publishes a standalone OpenAPI 3.1 contract with only schema-complete GET operations", async () => {
  assert.equal(openapi.openapi, "3.1.0");
  assert.equal(openapi.info.version, "1.0.0");
  assert.equal(Object.hasOwn(openapi, "servers"), false);
  assert.equal(Object.hasOwn(openapi.components, "securitySchemes"), false);
  assert.deepEqual(Object.keys(openapi.paths), [
    "/evidence-versions",
    "/evidence-versions/{evidenceId}/versions/{version}",
    "/evidence-versions/{evidenceId}/versions/{version}/status"
  ]);
  for (const [route, pathItem] of Object.entries(openapi.paths)) {
    assert.deepEqual(Object.keys(pathItem), ["get"]);
    const operation = pathItem.get;
    assert.deepEqual(operation.security, []);
    assert.equal(Object.hasOwn(operation, "requestBody"), false);
    const parameters = operation.parameters.map(resolveParameter);
    for (const name of [...route.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1])) {
      const parameter = parameters.find((candidate) => candidate.in === "path" && candidate.name === name);
      assert.ok(parameter, `${route} does not declare ${name}`);
      assert.equal(parameter.required, true);
      assert.ok(parameter.schema);
    }
    for (const [status, responseReference] of Object.entries(operation.responses)) {
      const response = responseReference.$ref
        ? openapi.components.responses[responseReference.$ref.split("/").at(-1)]
        : responseReference;
      assert.equal(typeof response.description, "string");
      if (status !== "304") assert.ok(response.content?.["application/json"]?.schema, `${route} ${status} has no JSON schema`);
    }
  }
  for (const schema of [recordSchema, statusSchema, errorSchema]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
  }
  const references = JSON.stringify(openapi).match(/\.\/evidence-query-[a-z-]+\.schema\.json/gu) ?? [];
  for (const reference of new Set(references)) {
    await readFile(new URL(`../specs/evidence/${reference.slice(2)}`, import.meta.url), "utf8");
  }
});

test("accepts only strict public projections and rejects private fields", () => {
  const normalized = validateEvidenceQueryRecord(record());
  assert.equal(normalized.visibility, "public");
  assert.equal(normalized.boundary.data_origin, "synthetic");
  assert.equal(normalized.certification_issued, false);
  assert.equal(Object.isFrozen(normalized), true);
  expectCode(EVIDENCE_QUERY_ERROR_CODES.privateField, () => validateEvidenceQueryRecord({ ...record(), tenant_id: "tenant-private" }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.privateField, () => validateEvidenceQueryRecord({ ...record(), visibility: "private" }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.privateField, () => validateEvidenceQueryRecord({
    ...record(),
    links: { ...record().links, self: "https://evidence.example.invalid/item?access_token=secret" }
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, () => validateEvidenceQueryRecord({
    ...record(),
    boundary: { ...record().boundary, performance_claim_allowed: true }
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.fieldUnknown, () => validateEvidenceQueryRecord({ ...record(), unreviewed_note: "not allowed" }));
});

test("filters and paginates deterministically with cursors bound to the normalized query", () => {
  const records = [
    record(),
    record({
      evidence_id: "evidence-synthetic-ct608-b",
      version: "1.10.0",
      published_at: "2026-10-23T08:00:00.000Z",
      scope: { ...record().scope, protocol: { name: "QUIC", version: "synthetic-v1" } },
      links: {
        self: "https://evidence.example.invalid/v1/evidence-versions/evidence-synthetic-ct608-b/versions/1.10.0",
        status: "https://evidence.example.invalid/v1/evidence-versions/evidence-synthetic-ct608-b/versions/1.10.0/status",
        manifest: null
      }
    })
  ];
  const first = queryEvidenceRecords(records, { data_origin: "synthetic", limit: 1 });
  const repeated = queryEvidenceRecords([...records].reverse(), { data_origin: "synthetic", limit: 1 });
  assert.deepEqual(first, repeated);
  assert.equal(first.items[0].evidence_id, "evidence-synthetic-ct608-a");
  assert.ok(first.page.next_cursor);
  const second = queryEvidenceRecords(records, {
    data_origin: "synthetic",
    limit: 1,
    cursor: first.page.next_cursor
  });
  assert.equal(second.items[0].evidence_id, "evidence-synthetic-ct608-b");
  assert.equal(second.page.next_cursor, null);
  expectCode(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, () => queryEvidenceRecords(records, {
    data_origin: "synthetic",
    protocol: "gRPC",
    limit: 1,
    cursor: first.page.next_cursor
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.cursorInvalid, () => queryEvidenceRecords(records, {
    data_origin: "synthetic",
    limit: 2,
    cursor: first.page.next_cursor
  }));
});

test("requires exact versions and never resolves a mutable latest alias", () => {
  const records = [record(), record({
    version: "1.1.0",
    published_at: "2026-10-23T10:00:00.000Z",
    links: {
      self: "https://evidence.example.invalid/v1/evidence-versions/evidence-synthetic-ct608-a/versions/1.1.0",
      status: "https://evidence.example.invalid/v1/evidence-versions/evidence-synthetic-ct608-a/versions/1.1.0/status",
      manifest: null
    }
  })];
  assert.equal(getEvidenceQueryRecord(records, {
    evidence_id: "evidence-synthetic-ct608-a",
    version: "1.0.0"
  }).version, "1.0.0");
  expectCode(EVIDENCE_QUERY_ERROR_CODES.versionRequired, () => getEvidenceQueryRecord(records, {
    evidence_id: "evidence-synthetic-ct608-a"
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, () => getEvidenceQueryRecord(records, {
    evidence_id: "evidence-synthetic-ct608-a",
    version: "latest"
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.notFound, () => getEvidenceQueryRecord(records, {
    evidence_id: "evidence-synthetic-ct608-a",
    version: "2.0.0"
  }));
});

test("builds transport-neutral GET descriptors without credentials", () => {
  const list = buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1",
    operation: "list",
    query: { data_origin: "synthetic", limit: 25 },
    etag: '"synthetic-list"'
  });
  const detail = buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1/",
    operation: "get",
    evidenceId: "evidence-synthetic-ct608-a",
    version: "1.0.0",
    etag: 'W/"synthetic-1"'
  });
  assert.deepEqual(EVIDENCE_QUERY_OPERATIONS, ["list", "get", "status"]);
  assert.equal(list.method, "GET");
  assert.equal(list.body, null);
  assert.match(list.url, /data_origin=synthetic/u);
  assert.match(list.url, /limit=25/u);
  assert.equal(list.headers["If-None-Match"], '"synthetic-list"');
  assert.equal(detail.headers["If-None-Match"], 'W/"synthetic-1"');
  for (const request of [list, detail]) {
    assert.equal(Object.keys(request.headers).some((key) => key.toLowerCase() === "authorization"), false);
  }
  expectCode(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, () => buildEvidenceQueryRequest({
    baseUrl: "http://evidence.example.invalid/v1/",
    operation: "list"
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, () => buildEvidenceQueryRequest({
    baseUrl: "https://user:password@evidence.example.invalid/v1/",
    operation: "list"
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.privateField, () => buildEvidenceQueryRequest({
    baseUrl: "https://evidence.example.invalid/v1/?api_key=secret",
    operation: "list"
  }));
});

test("keeps status cache freshness separate from validity and certification", () => {
  const status = createEvidenceQueryStatus(record(), {
    checkedAt: "2026-10-23T09:05:00.000Z",
    eventCursor: "event-synthetic-ct608-0001"
  });
  assert.equal(status.cache_freshness_only, true);
  assert.equal(status.certification_issued, false);
  assert.equal(status.status.measurement_validity, "partial");
  assert.equal(status.status.independent_review, "not-reviewed");
  assert.equal(status.checked_at, "2026-10-23T09:05:00.000Z");
});

test("uses a strict stable error envelope without internal diagnostics", () => {
  const envelope = createEvidenceQueryError({
    code: EVIDENCE_QUERY_ERROR_CODES.notFound,
    message: "The exact public evidence version was not found.",
    requestId: "request-synthetic-ct608",
    retryable: false,
    field: null
  });
  assert.deepEqual(validateEvidenceQueryError(envelope), envelope);
  assert.equal(Object.hasOwn(envelope.error, "stack"), false);
  assert.equal(Object.hasOwn(envelope.error, "tenant_id"), false);
  expectCode(EVIDENCE_QUERY_ERROR_CODES.privateField, () => validateEvidenceQueryError({
    ...envelope,
    error: { ...envelope.error, tenant_id: "tenant-private" }
  }));
  expectCode(EVIDENCE_QUERY_ERROR_CODES.inputInvalid, () => createEvidenceQueryError({
    code: "database_failed",
    message: "Private implementation detail.",
    requestId: "request-synthetic-ct608"
  }));
});

test("publishes CT-608 SDK exports, bilingual guidance, and an offline synthetic scenario", async () => {
  const [english, chinese, packageEnglish, packageChinese, publicApi, environment, sdk, types, scenario] = await Promise.all([
    readFile(new URL("../docs/evidence/query-api-and-sdk-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/evidence/query-api-and-sdk-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/evidence-query/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/evidence-query/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    import("../sdk/index.mjs"),
    readFile(new URL("../packages/evidence-query/index.d.ts", import.meta.url), "utf8"),
    exec(process.execPath, ["examples/evidence/query-api-synthetic.mjs"], { cwd: root })
  ]);
  for (const document of [english, chinese, packageEnglish, packageChinese]) {
    assert.match(document, /CT-608/);
    assert.match(document, /read-only|只读/iu);
    assert.match(document, /certif|认证/iu);
  }
  assert.equal(publicApi.sdk_version, "0.16.0");
  for (const contract of [
    "specs/evidence/evidence-query-api-v1.openapi.json",
    "specs/evidence/evidence-query-record-v1.schema.json",
    "specs/evidence/evidence-query-status-v1.schema.json",
    "specs/evidence/evidence-query-error-v1.schema.json"
  ]) assert.ok(publicApi.public_contracts.includes(contract));
  for (const tool of ["packages/evidence-query/index.mjs", "packages/evidence-query/index.d.ts"]) {
    assert.ok(publicApi.public_tools.includes(tool));
  }
  assert.ok(environment.contract_tests.includes("tests/evidence-query.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "evidence-query-api"));
  for (const symbol of [
    "buildEvidenceQueryRequest",
    "createEvidenceQueryError",
    "createEvidenceQueryStatus",
    "getEvidenceQueryRecord",
    "normalizeEvidenceQuery",
    "queryEvidenceRecords",
    "validateEvidenceQueryError",
    "validateEvidenceQueryRecord"
  ]) assert.equal(typeof sdk[symbol], "function");
  for (const forbidden of ["authenticateEvidenceCaller", "authorizePrivateEvidence", "readCustomerEvidence"]) {
    assert.equal(Object.hasOwn(sdk, forbidden), false);
  }
  assert.match(types, /EvidenceQueryRecord/);
  const output = JSON.parse(scenario.stdout);
  assert.equal(output.data_origin, "synthetic");
  assert.equal(output.performance_claim_allowed, false);
  assert.equal(output.read_only_methods_only, true);
  assert.equal(output.credentials_attached, false);
  assert.equal(output.private_fields_returned, false);
  assert.equal(output.certification_issued, false);
  assert.equal(
    Object.values(EVIDENCE_QUERY_ERROR_CODES).length,
    new Set(Object.values(EVIDENCE_QUERY_ERROR_CODES)).size
  );
  assert.equal(normalizeEvidenceQuery().limit, 50);
});
