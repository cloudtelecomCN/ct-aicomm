import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { validateGovernanceRoster } from "../scripts/validate-governance-roster.mjs";

const exec = promisify(execFile);
const [roster, schema, governance, governanceChinese, owners, nomination, nodeWorkflow] = await Promise.all([
  readFile("governance/roles.json", "utf8").then(JSON.parse),
  readFile("specs/governance/project-role-roster-v1.schema.json", "utf8").then(JSON.parse),
  readFile("GOVERNANCE.md", "utf8"),
  readFile("GOVERNANCE.zh-CN.md", "utf8"),
  readFile(".github/CODEOWNERS", "utf8"),
  readFile(".github/ISSUE_TEMPLATE/external-role-nomination.yml", "utf8"),
  readFile(".github/workflows/node-tests.yml", "utf8")
]);

const clone = () => structuredClone(roster);
const codes = (value) => validateGovernanceRoster(value).map(({ code }) => code);

test("publishes a truthful bootstrap roster with no invented external roles or TSC", () => {
  assert.deepEqual(validateGovernanceRoster(roster), []);
  assert.equal(roster.governance_phase, "bootstrap");
  assert.deepEqual(roster.technical_steering_committee, { formed: false, members: [] });
  assert.deepEqual(roster.external_role_counts, { reviewers: 0, maintainers: 0 });
  assert.deepEqual(roster.assignments.map(({ github_login }) => github_login), ["cloudtelecomCN"]);
  assert.equal(schema.properties.schema_version.const, "1.0.0");
  assert.equal(schema.properties.technical_steering_committee.allOf.length, 1);
});

test("rejects phantom committees, excess permission, and unrecorded external appointments", () => {
  const phantom = clone();
  phantom.technical_steering_committee.members = ["one", "two", "three"];
  assert.ok(codes(phantom).includes("phantom_tsc_members"));

  const excess = clone();
  excess.assignments[0].role = "external-domain-reviewer";
  assert.ok(codes(excess).includes("permission_exceeds_role"));

  const external = clone();
  external.assignments.push({
    github_login: "example-reviewer",
    role: "external-domain-reviewer",
    scope: ["registry"],
    repository_permission: "triage",
    status: "probation",
    external: true,
    recorded_at: "2026-10-22",
    review_due: "2027-01-20",
    nomination_issue: null,
    granted_by: "cloudtelecomCN"
  });
  assert.ok(codes(external).includes("external_nomination_missing"));
  assert.ok(codes(external).includes("reviewer_count_mismatch"));
});

test("documents admission, least privilege, review, exit, recusal, and the bootstrap truth", () => {
  for (const phrase of ["Admission process", "least privilege", "90-day probation", "Voluntary exit", "cannot approve their own nomination", "No TSC has been formed"]) {
    assert.match(governance, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const phrase of ["准入流程", "最小权限", "90 天试用期", "自愿退出", "不能批准自己的提名", "当前尚未成立 TSC"]) {
    assert.match(governanceChinese, new RegExp(phrase));
  }
  assert.match(owners, /^\/governance\/ @cloudtelecomCN/m);
  assert.match(owners, /^\/GOVERNANCE\.md @cloudtelecomCN/m);
  assert.doesNotMatch(owners, /@bestchatgpt8/);
});

test("ships a public nomination form without requesting sensitive identity material", () => {
  assert.match(nomination, /External reviewer or maintainer nomination/);
  assert.match(nomination, /Conflict-of-interest disclosure/);
  assert.match(nomination, /public evidence/i);
  assert.match(nomination, /Do not include credentials/i);
  assert.doesNotMatch(nomination, /passport|identity card|government ID/i);
});

test("runs the required public test context for every pull request", () => {
  assert.match(nodeWorkflow, /^\s*pull_request:\s*$/m);
  assert.match(nodeWorkflow, /^\s*push:\s*$/m);
  assert.doesNotMatch(nodeWorkflow, /^\s+paths:\s*$/m);
  assert.match(nodeWorkflow, /^\s{2}test:\s*$/m);
});

test("runs the standalone roster validator", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/validate-governance-roster.mjs"]);
  assert.match(stdout, /governance roster valid/);
  assert.match(stdout, /TSC formed=false/);
});
