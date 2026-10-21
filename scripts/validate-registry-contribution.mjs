import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_KEYS = ["schema_version", "contribution_id", "change_type", "supersedes", "protocol", "provenance", "conflict_of_interest", "review"];
const PROTOCOL_KEYS = ["id", "name", "version", "category", "summary", "specification_urls", "implementation_urls", "interoperability_tags"];
const PROVENANCE_KEYS = ["contributor", "sources", "rights"];
const CONTRIBUTOR_KEYS = ["github_login", "affiliation"];
const SOURCE_KEYS = ["kind", "title", "publisher", "url", "accessed_at", "license_spdx", "sha256"];
const RIGHTS_KEYS = ["basis", "has_rights_to_contribute", "contains_confidential_material"];
const CONFLICT_KEYS = ["declared", "relationships"];
const RELATIONSHIP_KEYS = ["kind", "party", "description"];
const REVIEW_KEYS = ["status", "requested_roles", "required_checks", "independent_review_required", "submitter_may_approve"];

const CATEGORIES = new Set(["collective-communication", "transport", "rpc", "inference-serving", "network-offload", "security", "observability", "other"]);
const SOURCE_KINDS = new Set(["official-specification", "vendor-documentation", "research-paper", "reference-implementation", "benchmark-report", "other"]);
const RIGHTS_BASES = new Set(["author", "public-domain", "open-license", "link-only"]);
const RELATIONSHIP_KINDS = new Set(["employer", "vendor", "consultant", "investor", "maintainer", "other"]);
const REQUIRED_ROLES = ["registry-maintainer", "independent-domain-reviewer"];
const REQUIRED_CHECKS = ["metadata", "provenance-rights", "conflict-of-interest", "technical"];
const CONTRIBUTIONS_DIRECTORY = "registry/contributions";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const TAG = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

function issue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path, issues) {
  if (!isObject(value)) {
    issue(issues, path, "object_required", "must be an object");
    return false;
  }
  return true;
}

function exactKeys(value, allowed, path, issues) {
  if (!requireObject(value, path, issues)) return false;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) issue(issues, `${path}.${key}`, "field_unknown", "is not allowed by Registry contribution v2");
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) issue(issues, `${path}.${key}`, "field_required", "is required");
  }
  return true;
}

function text(value, path, issues, { min = 1, max = 500, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    issue(issues, path, "string_invalid", `must be a ${min}-${max} character string${pattern ? " in the required format" : ""}`);
    return false;
  }
  return true;
}

function enumValue(value, allowed, path, issues) {
  if (!allowed.has(value)) {
    issue(issues, path, "enum_invalid", `must be one of: ${[...allowed].join(", ")}`);
    return false;
  }
  return true;
}

function list(value, path, issues, { min = 0, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    issue(issues, path, "array_invalid", `must contain between ${min} and ${max} items`);
    return false;
  }
  return true;
}

function uniqueStrings(value, path, issues, options = {}) {
  if (!list(value, path, issues, options)) return false;
  const seen = new Set();
  value.forEach((item, index) => {
    if (typeof item !== "string") issue(issues, `${path}[${index}]`, "string_required", "must be a string");
    else if (seen.has(item)) issue(issues, `${path}[${index}]`, "duplicate", "must be unique");
    else seen.add(item);
  });
  return true;
}

function privateIpv4(hostname) {
  const [a, b] = hostname.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function publicHttpsUrl(value, path, issues) {
  if (typeof value !== "string") {
    issue(issues, path, "url_invalid", "must be a public HTTPS URL");
    return false;
  }
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const privateIpv6 = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
    const privateHost = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || (isIP(hostname) === 4 && privateIpv4(hostname)) || (isIP(hostname) === 6 && privateIpv6);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || privateHost) throw new Error("not public HTTPS");
    return true;
  } catch {
    issue(issues, path, "url_not_public_https", "must be a public HTTPS URL without embedded credentials or private hostnames");
    return false;
  }
}

function dateOnly(value, path, issues) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issue(issues, path, "date_invalid", "must use YYYY-MM-DD");
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    issue(issues, path, "date_invalid", "must be a real calendar date");
    return false;
  }
  return true;
}

function exactSet(value, expected, path, issues) {
  if (!uniqueStrings(value, path, issues, { min: expected.length, max: expected.length })) return;
  const actual = new Set(value);
  for (const item of expected) if (!actual.has(item)) issue(issues, path, "set_incomplete", `must include ${item}`);
  for (const item of actual) if (!expected.includes(item)) issue(issues, path, "set_unknown", `contains unsupported value ${item}`);
}

export function validateRegistryContribution(document, { file } = {}) {
  const issues = [];
  if (!exactKeys(document, ROOT_KEYS, "$", issues)) return issues;

  if (document.schema_version !== "2.0.0") issue(issues, "$.schema_version", "schema_version_invalid", "must equal 2.0.0");
  text(document.contribution_id, "$.contribution_id", issues, { min: 3, max: 96, pattern: SLUG });
  enumValue(document.change_type, new Set(["add", "update", "deprecate"]), "$.change_type", issues);

  if (document.change_type === "add" && document.supersedes !== null) issue(issues, "$.supersedes", "supersedes_forbidden", "must be null for an add contribution");
  if (["update", "deprecate"].includes(document.change_type) && (typeof document.supersedes !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*@[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(document.supersedes))) {
    issue(issues, "$.supersedes", "supersedes_required", "must identify the prior protocol id and version as id@version");
  }

  if (exactKeys(document.protocol, PROTOCOL_KEYS, "$.protocol", issues)) {
    text(document.protocol.id, "$.protocol.id", issues, { min: 2, max: 64, pattern: SLUG });
    text(document.protocol.name, "$.protocol.name", issues, { min: 2, max: 120 });
    text(document.protocol.version, "$.protocol.version", issues, { min: 1, max: 64, pattern: VERSION });
    enumValue(document.protocol.category, CATEGORIES, "$.protocol.category", issues);
    text(document.protocol.summary, "$.protocol.summary", issues, { min: 20, max: 500 });
    if (uniqueStrings(document.protocol.specification_urls, "$.protocol.specification_urls", issues, { min: 1, max: 12 })) document.protocol.specification_urls.forEach((url, index) => publicHttpsUrl(url, `$.protocol.specification_urls[${index}]`, issues));
    if (uniqueStrings(document.protocol.implementation_urls, "$.protocol.implementation_urls", issues, { max: 12 })) document.protocol.implementation_urls.forEach((url, index) => publicHttpsUrl(url, `$.protocol.implementation_urls[${index}]`, issues));
    if (uniqueStrings(document.protocol.interoperability_tags, "$.protocol.interoperability_tags", issues, { min: 1, max: 20 })) {
      document.protocol.interoperability_tags.forEach((tag, index) => text(tag, `$.protocol.interoperability_tags[${index}]`, issues, { min: 1, max: 48, pattern: TAG }));
    }
    if (["update", "deprecate"].includes(document.change_type) && typeof document.supersedes === "string" && !document.supersedes.startsWith(`${document.protocol.id}@`)) issue(issues, "$.supersedes", "supersedes_protocol_mismatch", "must reference the same protocol id");
  }

  if (exactKeys(document.provenance, PROVENANCE_KEYS, "$.provenance", issues)) {
    const contributor = document.provenance.contributor;
    if (exactKeys(contributor, CONTRIBUTOR_KEYS, "$.provenance.contributor", issues)) {
      text(contributor.github_login, "$.provenance.contributor.github_login", issues, { min: 1, max: 39, pattern: LOGIN });
      if (contributor.affiliation !== null) text(contributor.affiliation, "$.provenance.contributor.affiliation", issues, { min: 2, max: 120 });
    }

    const sources = document.provenance.sources;
    if (list(sources, "$.provenance.sources", issues, { min: 1, max: 20 })) {
      const sourceUrls = new Set();
      sources.forEach((source, index) => {
        const path = `$.provenance.sources[${index}]`;
        if (!exactKeys(source, SOURCE_KEYS, path, issues)) return;
        enumValue(source.kind, SOURCE_KINDS, `${path}.kind`, issues);
        text(source.title, `${path}.title`, issues, { min: 3, max: 200 });
        text(source.publisher, `${path}.publisher`, issues, { min: 2, max: 120 });
        if (publicHttpsUrl(source.url, `${path}.url`, issues)) {
          if (sourceUrls.has(source.url)) issue(issues, `${path}.url`, "source_duplicate", "duplicates another provenance source");
          sourceUrls.add(source.url);
        }
        dateOnly(source.accessed_at, `${path}.accessed_at`, issues);
        if (source.license_spdx !== null) text(source.license_spdx, `${path}.license_spdx`, issues, { min: 1, max: 64, pattern: SPDX });
        if (source.sha256 !== null) text(source.sha256, `${path}.sha256`, issues, { min: 71, max: 71, pattern: SHA256 });
      });
    }

    const rights = document.provenance.rights;
    if (exactKeys(rights, RIGHTS_KEYS, "$.provenance.rights", issues)) {
      enumValue(rights.basis, RIGHTS_BASES, "$.provenance.rights.basis", issues);
      if (rights.has_rights_to_contribute !== true) issue(issues, "$.provenance.rights.has_rights_to_contribute", "rights_not_attested", "must be true");
      if (rights.contains_confidential_material !== false) issue(issues, "$.provenance.rights.contains_confidential_material", "confidential_material_forbidden", "must be false");
    }
  }

  const conflict = document.conflict_of_interest;
  if (exactKeys(conflict, CONFLICT_KEYS, "$.conflict_of_interest", issues)) {
    if (typeof conflict.declared !== "boolean") issue(issues, "$.conflict_of_interest.declared", "boolean_required", "must be a boolean");
    if (list(conflict.relationships, "$.conflict_of_interest.relationships", issues, { max: 12 })) {
      if (conflict.declared === true && conflict.relationships.length === 0) issue(issues, "$.conflict_of_interest.relationships", "conflict_details_required", "must describe at least one declared relationship");
      if (conflict.declared === false && conflict.relationships.length !== 0) issue(issues, "$.conflict_of_interest.relationships", "conflict_declaration_mismatch", "must be empty when no conflict is declared");
      conflict.relationships.forEach((relationship, index) => {
        const path = `$.conflict_of_interest.relationships[${index}]`;
        if (!exactKeys(relationship, RELATIONSHIP_KEYS, path, issues)) return;
        enumValue(relationship.kind, RELATIONSHIP_KINDS, `${path}.kind`, issues);
        text(relationship.party, `${path}.party`, issues, { min: 2, max: 120 });
        text(relationship.description, `${path}.description`, issues, { min: 10, max: 500 });
      });
    }
  }

  const review = document.review;
  if (exactKeys(review, REVIEW_KEYS, "$.review", issues)) {
    if (review.status !== "pending") issue(issues, "$.review.status", "review_status_invalid", "must remain pending in a contributor-authored packet");
    exactSet(review.requested_roles, REQUIRED_ROLES, "$.review.requested_roles", issues);
    exactSet(review.required_checks, REQUIRED_CHECKS, "$.review.required_checks", issues);
    if (review.independent_review_required !== true) issue(issues, "$.review.independent_review_required", "independent_review_required", "must be true");
    if (review.submitter_may_approve !== false) issue(issues, "$.review.submitter_may_approve", "submitter_approval_forbidden", "must be false");
  }

  if (file && typeof document.contribution_id === "string" && basename(file) !== `${document.contribution_id}.json`) issue(issues, "$.contribution_id", "filename_mismatch", `must match filename ${basename(file)}`);
  return issues;
}

export function parseNameStatusZ(output) {
  const tokens = output.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const records = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      records.push({ status, previous: tokens[index++], path: tokens[index++] });
    } else {
      records.push({ status, path: tokens[index++] });
    }
  }
  return records;
}

export function changedContributionFiles(base, head, { cwd = process.cwd() } = {}) {
  if (!/^[0-9a-f]{7,40}$/i.test(base) || !/^[0-9a-f]{7,40}$/i.test(head)) throw new Error("base and head must be Git commit identifiers");
  const output = execFileSync("git", ["diff", "--name-status", "-z", base, head, "--", CONTRIBUTIONS_DIRECTORY], { cwd, encoding: "utf8" });
  return parseNameStatusZ(output);
}

async function contributionTree(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(directory);
  return files;
}

async function validateFile(file) {
  try {
    const document = JSON.parse(await readFile(file, "utf8"));
    return validateRegistryContribution(document, { file });
  } catch (error) {
    return [{ path: "$", code: "json_invalid", message: error instanceof SyntaxError ? "must contain valid JSON" : error.message }];
  }
}

function annotationValue(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function emitFailure(file, failure) {
  const message = `${failure.code}: ${failure.path} ${failure.message}`;
  if (process.env.GITHUB_ACTIONS === "true") console.error(`::error file=${annotationValue(file)},title=Registry contribution preflight::${annotationValue(message)}`);
  else console.error(`${file}: ${message}`);
}

function parseArguments(argv) {
  const options = { all: false, files: [], base: null, head: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") options.all = true;
    else if (argument === "--base") options.base = argv[++index];
    else if (argument === "--head") options.head = argv[++index];
    else if (argument === "--files") {
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) options.files.push(argv[++index]);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if ((options.base && !options.head) || (!options.base && options.head)) throw new Error("--base and --head must be provided together");
  if ([options.all, options.files.length > 0, Boolean(options.base)].filter(Boolean).length > 1) throw new Error("Choose exactly one of --all, --files, or --base/--head");
  if (!options.all && options.files.length === 0 && !options.base) options.all = true;
  return options;
}

export async function runPreflight(argv, { cwd = process.cwd() } = {}) {
  const options = parseArguments(argv);
  const failures = [];
  let files = [];

  if (options.all) {
    const directory = resolve(cwd, CONTRIBUTIONS_DIRECTORY);
    const tracked = await contributionTree(directory);
    for (const file of tracked) {
      const path = relative(cwd, file).split(sep).join("/");
      if (path === `${CONTRIBUTIONS_DIRECTORY}/.gitkeep`) continue;
      if (!path.endsWith(".json")) failures.push({ file: path, issue: { path: "$", code: "file_type_invalid", message: "only .json contribution packets are allowed" } });
      else files.push(file);
    }
  } else if (options.files.length > 0) {
    files = options.files.map((file) => resolve(cwd, file));
  } else {
    const records = changedContributionFiles(options.base, options.head, { cwd });
    for (const record of records) {
      if (record.status.startsWith("D")) failures.push({ file: record.path, issue: { path: "$", code: "deletion_forbidden", message: "submit a deprecate packet instead of deleting Registry history" } });
      else if (record.status.startsWith("R") || record.status.startsWith("C")) failures.push({ file: record.path, issue: { path: "$", code: "rename_forbidden", message: "contribution packets must keep stable identities" } });
      else if (record.path === `${CONTRIBUTIONS_DIRECTORY}/.gitkeep`) failures.push({ file: record.path, issue: { path: "$", code: "placeholder_change_forbidden", message: "do not modify the contribution directory placeholder" } });
      else if (!record.path.endsWith(".json")) failures.push({ file: record.path, issue: { path: "$", code: "file_type_invalid", message: "only .json contribution packets are allowed" } });
      else files.push(resolve(cwd, record.path));
    }
  }

  for (const file of files) {
    const display = relative(cwd, file).split(sep).join("/");
    for (const validationIssue of await validateFile(file)) failures.push({ file: display, issue: validationIssue });
  }

  for (const failure of failures) emitFailure(failure.file, failure.issue);
  if (failures.length > 0) throw new Error(`Registry contribution preflight failed with ${failures.length} issue(s)`);
  console.log(`Registry contribution v2 preflight passed for ${files.length} packet(s). Validation does not grant publication approval.`);
  return { files: files.map((file) => relative(cwd, file).split(sep).join("/")), failures: [] };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runPreflight(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
