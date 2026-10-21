import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { parseNameStatusZ, runPreflight, validateRegistryContribution } from "../scripts/validate-registry-contribution.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const exampleUrl = new URL("../examples/registry/synthetic-quic-example-v1.json", import.meta.url);
const example = JSON.parse(await readFile(exampleUrl, "utf8"));
const clone = () => structuredClone(example);
const codes = (document, options) => validateRegistryContribution(document, options).map(({ code }) => code);

test("validates the synthetic Registry contribution against the v2 contract", async () => {
  assert.deepEqual(validateRegistryContribution(example, { file: "synthetic-quic-example-v1.json" }), []);
  const schema = JSON.parse(await readFile(new URL("../specs/registry/registry-contribution-v2.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.schema_version.const, "2.0.0");
  assert.equal(schema.properties.provenance.properties.sources.minItems, 1);
  assert.equal(schema.properties.review.properties.status.const, "pending");
  assert.equal(schema.properties.review.properties.submitter_may_approve.const, false);
  assert.equal(schema.properties.conflict_of_interest.allOf.length, 2);
});

test("rejects missing provenance, private URLs, false rights, and confidential material", () => {
  const missingSource = clone();
  missingSource.provenance.sources = [];
  assert.ok(codes(missingSource).includes("array_invalid"));

  const privateSource = clone();
  privateSource.provenance.sources[0].url = "https://10.0.0.8/spec";
  assert.ok(codes(privateSource).includes("url_not_public_https"));

  const rights = clone();
  rights.provenance.rights.has_rights_to_contribute = false;
  rights.provenance.rights.contains_confidential_material = true;
  assert.ok(codes(rights).includes("rights_not_attested"));
  assert.ok(codes(rights).includes("confidential_material_forbidden"));
});

test("requires a complete conflict declaration without treating disclosure as rejection", () => {
  const undisclosed = clone();
  undisclosed.conflict_of_interest.relationships.push({ kind: "vendor", party: "Example Vendor", description: "Contributor represents this protocol vendor." });
  assert.ok(codes(undisclosed).includes("conflict_declaration_mismatch"));

  const incomplete = clone();
  incomplete.conflict_of_interest.declared = true;
  assert.ok(codes(incomplete).includes("conflict_details_required"));

  const declared = clone();
  declared.conflict_of_interest = {
    declared: true,
    relationships: [{ kind: "vendor", party: "Example Vendor", description: "Contributor represents this protocol vendor." }]
  };
  assert.deepEqual(validateRegistryContribution(declared), []);
});

test("keeps contributor-authored review state pending and independently governed", () => {
  const approved = clone();
  approved.review.status = "approved";
  approved.review.submitter_may_approve = true;
  approved.review.requested_roles = ["registry-maintainer"];
  approved.review.required_checks = ["metadata", "technical"];
  const failures = codes(approved);
  assert.ok(failures.includes("review_status_invalid"));
  assert.ok(failures.includes("submitter_approval_forbidden"));
  assert.ok(failures.includes("array_invalid"));
});

test("enforces immutable contribution identity and explicit update lineage", () => {
  assert.ok(codes(example, { file: "different-name.json" }).includes("filename_mismatch"));

  const update = clone();
  update.change_type = "update";
  update.supersedes = "different-protocol@1.0.0";
  assert.ok(codes(update).includes("supersedes_protocol_mismatch"));

  update.supersedes = "synthetic-quic-example@0.9.0";
  assert.deepEqual(validateRegistryContribution(update), []);
});

test("rejects unknown fields instead of silently carrying credentials or approvals", () => {
  const credential = clone();
  credential.provenance.access_token = "not-allowed";
  assert.ok(codes(credential).includes("field_unknown"));

  const claimedApproval = clone();
  claimedApproval.review.approved_by = "submitter";
  assert.ok(codes(claimedApproval).includes("field_unknown"));
});

test("parses changed-file records and identifies renames without losing either path", () => {
  assert.deepEqual(parseNameStatusZ("A\0registry/contributions/a.json\0M\0registry/contributions/b.json\0R100\0registry/contributions/old.json\0registry/contributions/new.json\0"), [
    { status: "A", path: "registry/contributions/a.json" },
    { status: "M", path: "registry/contributions/b.json" },
    { status: "R100", previous: "registry/contributions/old.json", path: "registry/contributions/new.json" }
  ]);
});

test("validates an added contribution from an actual pull-request Git range", async (t) => {
  const directory = await mkdtemp(join(rootPath, ".tmp-registry-preflight-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const contributions = join(directory, "registry", "contributions");
  await mkdir(contributions, { recursive: true });
  await writeFile(join(contributions, ".gitkeep"), "\n");
  await exec("git", ["init"], { cwd: directory });
  await exec("git", ["config", "user.name", "Registry Test"], { cwd: directory });
  await exec("git", ["config", "user.email", "registry-test@example.invalid"], { cwd: directory });
  await exec("git", ["add", "."], { cwd: directory });
  await exec("git", ["commit", "-m", "base"], { cwd: directory });
  const { stdout: baseOutput } = await exec("git", ["rev-parse", "HEAD"], { cwd: directory });

  await writeFile(join(contributions, "synthetic-quic-example-v1.json"), `${JSON.stringify(example, null, 2)}\n`);
  await exec("git", ["add", "."], { cwd: directory });
  await exec("git", ["commit", "-m", "add Registry contribution"], { cwd: directory });
  const { stdout: headOutput } = await exec("git", ["rev-parse", "HEAD"], { cwd: directory });

  const result = await runPreflight(["--base", baseOutput.trim(), "--head", headOutput.trim()], { cwd: directory });
  assert.deepEqual(result.files, ["registry/contributions/synthetic-quic-example-v1.json"]);
});

test("runs the public CLI without dependencies and states the approval boundary", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/validate-registry-contribution.mjs", "--files", "examples/registry/synthetic-quic-example-v1.json"], { cwd: root });
  assert.match(stdout, /preflight passed for 1 packet/);
  assert.match(stdout, /does not grant publication approval/);
  const result = await runPreflight(["--all"], { cwd: new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)) });
  assert.deepEqual(result.files, []);
});

test("ships a read-only external pull-request preflight and explicit review ownership", async () => {
  const workflow = await readFile(new URL("../.github/workflows/registry-preflight.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /--base "\$BASE_SHA" --head "\$HEAD_SHA"/);
  assert.doesNotMatch(workflow, /secrets\./);

  const owners = await readFile(new URL("../.github/CODEOWNERS", import.meta.url), "utf8");
  assert.match(owners, /^\/registry\/contributions\/ @cloudtelecomCN/m);
  const template = await readFile(new URL("../.github/PULL_REQUEST_TEMPLATE/registry-contribution.md", import.meta.url), "utf8");
  assert.match(template, /Independent domain review/);
  assert.match(template, /Preflight success is not publication approval/);
});
