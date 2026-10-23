import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { createIndependentReviewOpinionLifecycle } from "../packages/independent-run-review/opinion.mjs";
import * as sdk from "../packages/independent-run-review/workspace.mjs";
import {
  INDEPENDENT_REVIEW_SCOPE_MARK_STATES,
  INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES,
  createIndependentReviewScopeMark,
  createIndependentReviewWorkspace,
  createIndependentReviewWorkspaceExport,
  verifyIndependentReviewScopeMark,
  verifyIndependentReviewWorkspace,
  verifyIndependentReviewWorkspaceExport
} from "../packages/independent-run-review/workspace.mjs";
import { buildSyntheticReviewWorkspaceScenario } from "../examples/review/workspace-scope-mark-synthetic.mjs";

const execute = promisify(execFile);

function context(scenario, lifecycle = scenario.activeLifecycle, correctionSources = []) {
  return {
    lifecycle,
    correction_sources: correctionSources,
    engagement: scenario.initial,
    independence_assessment: scenario.eligible,
    share_grant: scenario.shareGrant,
    share_revocations: [],
    passport_version: scenario.replacement,
    passport_events: [],
    delivery: scenario.delivery,
    recalculation: scenario.consistent
  };
}

function workspaceInput(scenario, overrides = {}) {
  return {
    workspace_id: "review-workspace-ct621-test",
    version: "1.0.0",
    created_by: "workspace-operator-ct621",
    generated_at: "2026-10-23T12:20:00.000Z",
    reviewer_organization: {
      organization_id: "reviewer-org-synthetic",
      display_name: "Synthetic Independent Review Lab"
    },
    ...context(scenario),
    ...overrides
  };
}

test("exports one closed CT-621 workspace, scope mark, and export API", () => {
  assert.deepEqual(INDEPENDENT_REVIEW_SCOPE_MARK_STATES, ["eligible", "blocked", "withdrawn"]);
  assert.equal(Object.isFrozen(INDEPENDENT_REVIEW_SCOPE_MARK_STATES), true);
  for (const name of [
    "createIndependentReviewWorkspace",
    "verifyIndependentReviewWorkspace",
    "createIndependentReviewScopeMark",
    "verifyIndependentReviewScopeMark",
    "createIndependentReviewWorkspaceExport",
    "verifyIndependentReviewWorkspaceExport"
  ]) assert.equal(typeof sdk[name], "function");
});

test("builds a read-only workspace from the exact verified opinion lifecycle", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  const { workspace } = scenario;
  assert.equal(workspace.reviewer_organization.display_name, "Synthetic Independent Review Lab");
  assert.equal(workspace.scope.review_level, "statistical-recalculation");
  assert.equal(workspace.scope.passport_ref.content_fingerprint, scenario.initial.scope.passport_ref.content_fingerprint);
  assert.equal(workspace.opinion.status, "issued");
  assert.equal(workspace.opinion.outcome, "consistent");
  assert.equal(workspace.workflow_steps.length, 6);
  assert.deepEqual(workspace.workflow_steps.map(({ step_id: stepId }) => stepId), [
    "scope", "independence", "recalculation", "reexecution", "opinion", "scope-mark"
  ]);
  assert.equal(workspace.workflow_steps.at(-1).state, "ready");
  assert.equal(workspace.scope_mark_eligibility.eligible, true);
  assert.equal(workspace.boundary.read_model_only, true);
  assert.equal(workspace.boundary.customer_data_persisted, false);
  assert.deepEqual(verifyIndependentReviewWorkspace({ workspace, ...context(scenario) }), workspace);
});

test("renders institution, opinion date, exact scope, outcome, and limitations on the mark", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  const { scopeMark } = scenario;
  assert.equal(scopeMark.display.label, "Scope-bound independent review opinion");
  assert.equal(scopeMark.display.institution, "Synthetic Independent Review Lab");
  assert.equal(scopeMark.display.date, "2026-10-23");
  assert.match(scopeMark.display.scope, /statistical-recalculation/);
  assert.ok(scopeMark.display.scope.includes(scenario.workspace.scope.passport_ref.object_id));
  assert.equal(scopeMark.display.outcome, "consistent");
  assert.match(scopeMark.display.limitation, /Not certification/);
  assert.ok(scopeMark.limitations.includes("no-sla-adjudication"));
  assert.ok(scopeMark.limitations.includes("not-a-legal-conclusion"));
  assert.equal(scopeMark.boundary.trusted_signature_attached, false);
  assert.equal(scopeMark.boundary.certification_issued, false);
  assert.deepEqual(verifyIndependentReviewScopeMark({
    scope_mark: scopeMark,
    workspace: scenario.workspace,
    ...context(scenario)
  }), scopeMark);
});

test("blocks a scope mark while an appeal is open and after withdrawal", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  const appealedLifecycle = createIndependentReviewOpinionLifecycle({
    opinion: scenario.consistentOpinion,
    events: [scenario.events[0]]
  });
  const appealedContext = context(scenario, appealedLifecycle);
  const appealedWorkspace = createIndependentReviewWorkspace(workspaceInput(scenario, {
    workspace_id: "review-workspace-ct621-appealed",
    ...appealedContext
  }));
  assert.equal(appealedWorkspace.opinion.status, "under-appeal");
  assert.equal(appealedWorkspace.scope_mark_eligibility.state, "blocked");
  assert.ok(appealedWorkspace.scope_mark_eligibility.blockers.includes("open-appeal"));
  assert.throws(() => createIndependentReviewScopeMark({
    mark_id: "scope-mark-ct621-appealed",
    version: "1.0.0",
    created_by: "opinion-signer-ct617",
    issued_at: "2026-10-23T12:21:00.000Z",
    workspace: appealedWorkspace,
    ...appealedContext
  }), (error) => error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.markIneligible);
  assert.equal(scenario.withdrawnWorkspace.scope_mark_eligibility.state, "withdrawn");
  assert.equal(scenario.withdrawnMarkBlocked, true);
});

test("rejects a reviewer institution that does not match the engagement and signer", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  assert.throws(() => createIndependentReviewWorkspace(workspaceInput(scenario, {
    reviewer_organization: {
      organization_id: "unrelated-reviewer-org",
      display_name: "Unrelated Review Organization"
    }
  })), (error) => error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.contextMismatch);
});

test("detects workspace and mark tampering", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  const workspace = structuredClone(scenario.workspace);
  workspace.opinion.outcome = "deviation";
  assert.throws(() => verifyIndependentReviewWorkspace({
    workspace,
    ...context(scenario)
  }), (error) => error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fingerprintMismatch);

  const scopeMark = structuredClone(scenario.scopeMark);
  scopeMark.display.institution = "Changed Institution";
  assert.throws(() => verifyIndependentReviewScopeMark({
    scope_mark: scopeMark,
    workspace: scenario.workspace,
    ...context(scenario)
  }), (error) => error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fingerprintMismatch);
});

test("exports a five-file integrity package without raw or customer data", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  assert.deepEqual(scenario.exportPackage.files.map(({ path }) => path), [
    "README.md", "SHA256SUMS", "manifest.json", "scope-mark.json", "workspace.json"
  ]);
  assert.equal(scenario.exportPackage.manifest.artifacts.length, 3);
  assert.equal(scenario.exportVerification.checksums_verified, true);
  assert.equal(scenario.exportVerification.record_fingerprints_verified, true);
  assert.equal(scenario.exportVerification.exact_scope_binding_verified, true);
  assert.equal(scenario.exportVerification.raw_samples_included, false);
  assert.equal(scenario.exportVerification.customer_identifiers_included, false);
  assert.equal(scenario.exportVerification.source_records_embedded, false);
  assert.equal(scenario.exportVerification.offline_source_reverification, false);
  assert.equal(scenario.exportVerification.trusted_signature_attached, false);
  assert.equal(scenario.exportVerification.certification_issued, false);
});

test("rejects export byte tampering and extra files", () => {
  const scenario = buildSyntheticReviewWorkspaceScenario();
  const tampered = structuredClone(scenario.exportPackage.files);
  tampered.find(({ path }) => path === "README.md").content += "tampered\n";
  assert.throws(() => verifyIndependentReviewWorkspaceExport({ files: tampered }), (error) => (
    error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.checksumMismatch
  ));
  assert.throws(() => verifyIndependentReviewWorkspaceExport({
    files: [...scenario.exportPackage.files, { path: "extra.txt", content: "extra" }]
  }), (error) => error.code === INDEPENDENT_REVIEW_WORKSPACE_ERROR_CODES.fileSetMismatch);
});

test("publishes a closed schema, bilingual guidance, types, SDK surface, and offline fixture", async () => {
  const [schema, publicApi, environment, guideEnglish, guideChinese, packageEnglish, packageChinese, types] = await Promise.all([
    readFile(new URL("../specs/review/review-workspace-scope-mark-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/review/workspace-scope-mark-export-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/review/workspace-scope-mark-export-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/independent-run-review/workspace.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.$defs.workspace.additionalProperties, false);
  assert.equal(schema.$defs.scopeMark.additionalProperties, false);
  assert.equal(schema.$defs.exportManifest.additionalProperties, false);
  assert.equal(publicApi.sdk_version, "0.28.0");
  assert.ok(publicApi.public_contracts.includes("specs/review/review-workspace-scope-mark-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/workspace.mjs"));
  assert.ok(publicApi.public_tools.includes("packages/independent-run-review/workspace.d.ts"));
  assert.match(guideEnglish, /institution.*date.*scope.*limitations/is);
  assert.match(guideChinese, /机构.*日期.*范围.*限制/s);
  assert.match(guideEnglish, /not certification/is);
  assert.match(guideChinese, /不是认证/s);
  assert.match(packageEnglish, /CT-621.*workspace.*scope mark.*export/is);
  assert.match(packageChinese, /CT-621.*工作区.*范围化标识.*导出/s);
  assert.match(types, /IndependentReviewWorkspaceSnapshot/);
  assert.ok(environment.contract_tests.includes("tests/review-workspace-scope-mark.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "independent-review-workspace-scope-mark"));
});

test("runs the CT-621 scenario offline without a certification claim", async () => {
  const { stdout } = await execute(process.execPath, ["examples/review/workspace-scope-mark-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  const result = JSON.parse(stdout);
  assert.equal(result.data_origin, "synthetic");
  assert.equal(result.workspace_read_model_only, true);
  assert.equal(result.workflow_step_count, 6);
  assert.equal(result.active_scope_mark_eligible, true);
  assert.equal(result.institution_visible, true);
  assert.equal(result.opinion_date_visible, true);
  assert.equal(result.scope_visible, true);
  assert.equal(result.limitation_visible, true);
  assert.equal(result.withdrawn_scope_mark_blocked, true);
  assert.equal(result.export_checksums_verified, true);
  assert.equal(result.raw_samples_included, false);
  assert.equal(result.customer_identifiers_included, false);
  assert.equal(result.certification_issued, false);
  assert.equal(result.external_network_used, false);
});
