import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildChildEnvironment, repositoryPath } from "../scripts/run-contributor-tests.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(repositoryRoot, "specs/contributor/test-environment-v1.json"), "utf8"));

test("defines a credential-free synthetic contributor environment", () => {
  assert.equal(manifest.runtime.package_install_required, false);
  assert.deepEqual(manifest.runtime.external_dependencies, []);
  assert.equal(manifest.security_boundary.network_mode, "loopback-only");
  assert.equal(manifest.security_boundary.external_network_allowed, false);
  assert.equal(manifest.security_boundary.credentials_required, false);
  assert.equal(manifest.security_boundary.private_infrastructure_required, false);
  assert.equal(manifest.evidence_boundary.data_origin, "synthetic");
  assert.equal(manifest.evidence_boundary.performance_claim_allowed, false);
});

test("sanitizes credentials and deployment variables before spawning checks", () => {
  const environment = buildChildEnvironment({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    CLOUDFLARE_API_TOKEN: "do-not-forward",
    GITHUB_TOKEN: "do-not-forward",
    SSH_AUTH_SOCK: "do-not-forward",
    VLLM_ENDPOINT: "do-not-forward",
    NODE_OPTIONS: "--require=do-not-forward"
  });
  assert.equal(environment.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.SSH_AUTH_SOCK, undefined);
  assert.equal(environment.VLLM_ENDPOINT, undefined);
  assert.match(environment.NODE_OPTIONS, /^--import=file:/);
  assert.doesNotMatch(environment.NODE_OPTIONS, /do-not-forward/);
  assert.equal(environment.CT_CONTRIBUTOR_OFFLINE, "1");
});

test("rejects contributor paths outside the repository before execution", async () => {
  assert.equal(
    await repositoryPath("tests/contributor-test-environment.test.mjs"),
    fileURLToPath(import.meta.url)
  );
  await assert.rejects(repositoryPath("../package.json"), /escapes the allowed root/u);
  await assert.rejects(repositoryPath(repositoryRoot), /non-empty relative path/u);
});

test("blocks non-loopback network access before a connection is attempted", () => {
  const guard = pathToFileURL(path.join(repositoryRoot, "scripts/offline-network-guard.mjs")).href;
  const expression = "try { await fetch('https://example.invalid'); console.log('unexpected'); } catch (error) { console.log(error.code); }";
  const output = execFileSync(process.execPath, ["--import", guard, "--input-type=module", "--eval", expression], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CT_CONTRIBUTOR_OFFLINE: "1" }
  });
  assert.equal(output.trim(), "CT_CONTRIBUTOR_NETWORK_DENIED");
});

test("runs all executable synthetic scenarios through the public runner", () => {
  const output = execFileSync(process.execPath, ["scripts/run-contributor-tests.mjs", "--profile", "scenarios"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "must-not-be-forwarded" }
  });
  const report = JSON.parse(output);
  assert.equal(report.passed, true);
  assert.equal(report.external_network_allowed, false);
  assert.equal(report.private_infrastructure_required, false);
  assert.equal(report.data_origin, "synthetic");
  assert.equal(report.performance_claim_allowed, false);
  assert.deepEqual(report.checks.map((check) => check.id), manifest.synthetic_scenarios.map((scenario) => scenario.id));
});

test("container runs without package installation or root privileges", async () => {
  const dockerfile = await readFile(path.join(repositoryRoot, manifest.container.dockerfile), "utf8");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.doesNotMatch(dockerfile, /^RUN\s+(npm|npx|apt|curl|wget)\b/im);
  assert.deepEqual(manifest.container.recommended_runtime_flags, ["--network=none", "--read-only", "--tmpfs=/tmp"]);
});
