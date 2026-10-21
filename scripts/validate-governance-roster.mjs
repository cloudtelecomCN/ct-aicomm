import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRosterPath = fileURLToPath(new URL("../governance/roles.json", import.meta.url));
const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const issuePattern = /^https:\/\/github\.com\/cloudtelecomCN\/ct-aicomm\/issues\/[1-9][0-9]*$/;
const activeStatuses = new Set(["probation", "active"]);
const rolePermissions = new Map([
  ["external-domain-reviewer", new Set(["none", "triage"])],
  ["scoped-maintainer", new Set(["write"])],
  ["release-manager", new Set(["write", "maintain"])],
  ["security-maintainer", new Set(["security"])],
  ["bootstrap-maintainer", new Set(["admin"])]
]);

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function validateGovernanceRoster(roster) {
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });

  if (roster?.schema_version !== "1.0.0") fail("schema_version_invalid", "schema_version must be 1.0.0");
  if (roster?.repository !== "cloudtelecomCN/ct-aicomm") fail("repository_invalid", "repository must identify the public project");
  if (!["bootstrap", "delegated"].includes(roster?.governance_phase)) fail("governance_phase_invalid", "governance_phase is invalid");
  if (!validDate(roster?.as_of)) fail("as_of_invalid", "as_of must be a valid ISO date");

  const committee = roster?.technical_steering_committee;
  if (typeof committee?.formed !== "boolean" || !Array.isArray(committee?.members)) {
    fail("tsc_record_invalid", "technical_steering_committee must declare formed and members");
  } else if (!committee.formed && committee.members.length) {
    fail("phantom_tsc_members", "an unformed TSC cannot list members");
  } else if (committee.formed && committee.members.length < 3) {
    fail("tsc_threshold_not_met", "a formed TSC requires at least three members");
  }

  const assignments = Array.isArray(roster?.assignments) ? roster.assignments : [];
  if (!assignments.length) fail("assignments_missing", "at least one accountable assignment is required");
  const keys = new Set();

  for (const [index, assignment] of assignments.entries()) {
    const prefix = `assignments[${index}]`;
    if (!githubLoginPattern.test(assignment?.github_login ?? "")) fail("github_login_invalid", `${prefix} has an invalid GitHub login`);
    if (!githubLoginPattern.test(assignment?.granted_by ?? "")) fail("grantor_invalid", `${prefix} has an invalid grantor`);
    if (!rolePermissions.has(assignment?.role)) fail("role_invalid", `${prefix} has an unknown role`);
    else if (!rolePermissions.get(assignment.role).has(assignment.repository_permission)) fail("permission_exceeds_role", `${prefix} permission is outside the role boundary`);
    if (!Array.isArray(assignment?.scope) || !assignment.scope.length || assignment.scope.some((scope) => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(scope))) {
      fail("scope_invalid", `${prefix} needs one or more normalized scopes`);
    }
    if (!["probation", "active", "suspended", "retired"].includes(assignment?.status)) fail("status_invalid", `${prefix} has an invalid status`);
    if (typeof assignment?.external !== "boolean") fail("external_flag_invalid", `${prefix} must declare whether the holder is external`);
    if (!validDate(assignment?.recorded_at) || !validDate(assignment?.review_due)) fail("review_dates_invalid", `${prefix} needs valid recorded_at and review_due dates`);
    if (validDate(assignment?.recorded_at) && validDate(assignment?.review_due) && assignment.review_due < assignment.recorded_at) fail("review_before_record", `${prefix} review cannot precede the record`);

    if (assignment?.external) {
      if (!issuePattern.test(assignment?.nomination_issue ?? "")) fail("external_nomination_missing", `${prefix} external role needs a public nomination issue`);
      if (assignment.repository_permission === "admin") fail("external_admin_forbidden", `${prefix} external roles cannot receive admin through this process`);
    } else if (assignment?.nomination_issue !== null) {
      fail("internal_nomination_invalid", `${prefix} bootstrap record must use a null nomination issue`);
    }

    const key = `${assignment?.github_login}:${assignment?.role}:${(assignment?.scope ?? []).join(",")}`;
    if (keys.has(key)) fail("assignment_duplicate", `${prefix} duplicates another assignment`);
    keys.add(key);
  }

  const activeExternal = assignments.filter((assignment) => assignment.external && activeStatuses.has(assignment.status));
  const reviewers = activeExternal.filter((assignment) => assignment.role === "external-domain-reviewer").length;
  const maintainers = activeExternal.filter((assignment) => assignment.role === "scoped-maintainer").length;
  if (roster?.external_role_counts?.reviewers !== reviewers) fail("reviewer_count_mismatch", "external reviewer count does not match active assignments");
  if (roster?.external_role_counts?.maintainers !== maintainers) fail("maintainer_count_mismatch", "external maintainer count does not match active assignments");

  if (committee?.formed) {
    const activeMaintainers = new Set(assignments
      .filter((assignment) => activeStatuses.has(assignment.status) && ["scoped-maintainer", "bootstrap-maintainer"].includes(assignment.role))
      .map((assignment) => assignment.github_login));
    for (const member of committee.members) {
      if (!activeMaintainers.has(member)) fail("tsc_member_not_maintainer", `${member} is not an active maintainer`);
    }
    if (roster.governance_phase !== "delegated") fail("tsc_phase_invalid", "a formed TSC requires delegated governance");
  }

  return errors;
}

async function main(args = process.argv.slice(2)) {
  if (args.length > 1) throw new Error("Usage: node scripts/validate-governance-roster.mjs [roster.json]");
  const rosterPath = path.resolve(args[0] ?? defaultRosterPath);
  const roster = JSON.parse(await readFile(rosterPath, "utf8"));
  const errors = validateGovernanceRoster(roster);
  if (errors.length) {
    for (const error of errors) console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CT-555 governance roster valid: ${roster.assignments.length} assignment(s), ${roster.external_role_counts.reviewers} external reviewer(s), ${roster.external_role_counts.maintainers} external maintainer(s), TSC formed=${roster.technical_steering_committee.formed}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
