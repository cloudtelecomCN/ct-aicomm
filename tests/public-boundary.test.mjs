import test from "node:test";
import assert from "node:assert/strict";
import { getPublicBoundary } from "../sdk/index.mjs";

test("public SDK declares excluded proprietary components", () => {
  const boundary = getPublicBoundary();
  assert.equal(boundary.contract_version, "0.2.0-open.1");
  assert.ok(boundary.public_components.includes("evidence-schema"));
  assert.ok(boundary.proprietary_components_not_included.includes("decision-and-scoring-core"));
  assert.equal(boundary.claims.performance_result, false);
  assert.equal(boundary.claims.execution_authorization, false);
});
