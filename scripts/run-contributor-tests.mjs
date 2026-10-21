import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUNNER_PATH = fileURLToPath(import.meta.url);
const MANIFEST_PATH = path.join(REPOSITORY_ROOT, "specs/contributor/test-environment-v1.json");
const GUARD_URL = pathToFileURL(path.join(REPOSITORY_ROOT, "scripts/offline-network-guard.mjs")).href;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 120_000;

const FORWARDED_ENVIRONMENT_KEYS = [
  "COMSPEC",
  "HOME",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR"
];

export function buildChildEnvironment(source = process.env) {
  const environment = {};
  for (const key of FORWARDED_ENVIRONMENT_KEYS) {
    if (source[key]) {
      environment[key] = source[key];
    }
  }
  environment.CI = "true";
  environment.CT_CONTRIBUTOR_OFFLINE = "1";
  environment.GIT_ALLOW_PROTOCOL = "file";
  environment.NODE_ENV = "test";
  environment.NODE_OPTIONS = `--import=${GUARD_URL}`;
  environment.NO_COLOR = "1";
  environment.NO_PROXY = "127.0.0.1,localhost,::1";
  environment.npm_config_offline = "true";
  return environment;
}

function repositoryPath(relativePath) {
  const resolved = path.resolve(REPOSITORY_ROOT, relativePath);
  const prefix = `${path.resolve(REPOSITORY_ROOT)}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    throw new Error(`Path escapes the public repository: ${relativePath}`);
  }
  return resolved;
}

async function runNode(label, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", GUARD_URL, ...args], {
      cwd: REPOSITORY_ROOT,
      env: buildChildEnvironment(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} exceeded ${TIMEOUT_MS} ms`));
    }, TIMEOUT_MS);

    function append(current, chunk) {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        reject(new Error(`${label} exceeded the output limit`));
        return current;
      }
      return current + chunk.toString("utf8");
    }

    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function valueAtPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function verifyScenarioResult(scenario, result) {
  for (const [dottedPath, expected] of Object.entries(scenario.expect?.equals ?? {})) {
    const actual = valueAtPath(result, dottedPath);
    if (actual !== expected) {
      throw new Error(`${scenario.id}: ${dottedPath} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  }
  for (const [dottedPath, expected] of Object.entries(scenario.expect?.every ?? {})) {
    const actual = valueAtPath(result, dottedPath);
    if (!Array.isArray(actual) || !actual.length || !actual.every((item) => item === expected)) {
      throw new Error(`${scenario.id}: every ${dottedPath} item must equal ${JSON.stringify(expected)}`);
    }
  }
}

async function loadManifest() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  if (manifest.schema_version !== "1.0.0") {
    throw new Error(`Unsupported contributor environment schema: ${manifest.schema_version}`);
  }
  if (manifest.security_boundary?.external_network_allowed !== false
    || manifest.security_boundary?.credentials_required !== false
    || manifest.security_boundary?.private_infrastructure_required !== false) {
    throw new Error("Contributor environment must remain offline, credential-free, and independent of private infrastructure");
  }
  if (manifest.evidence_boundary?.data_origin !== "synthetic"
    || manifest.evidence_boundary?.performance_claim_allowed !== false) {
    throw new Error("Contributor scenarios must remain synthetic and must not authorize performance claims");
  }
  return manifest;
}

async function runContracts(manifest) {
  const tests = manifest.contract_tests.map((testPath) => repositoryPath(testPath));
  await runNode("contract tests", ["--test", ...tests]);
  return manifest.contract_tests.map((testPath) => ({ id: testPath, status: "passed" }));
}

async function runScenarios(manifest) {
  const results = [];
  for (const scenario of manifest.synthetic_scenarios) {
    const entrypoint = repositoryPath(scenario.entrypoint);
    const { stdout } = await runNode(scenario.id, [entrypoint, ...(scenario.arguments ?? [])]);
    let output;
    try {
      output = JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${scenario.id}: entrypoint must emit one JSON document (${error.message})`);
    }
    verifyScenarioResult(scenario, output);
    results.push({ id: scenario.id, status: "passed" });
  }
  return results;
}

async function runFullSuite() {
  const testsDirectory = path.join(REPOSITORY_ROOT, "tests");
  const tests = (await readdir(testsDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => path.join(testsDirectory, name));
  await runNode("full public test suite", ["--test", ...tests]);
  return tests.map((testPath) => ({ id: path.relative(REPOSITORY_ROOT, testPath).replaceAll("\\", "/"), status: "passed" }));
}

export async function runProfile(profile) {
  const manifest = await loadManifest();
  if (!Object.hasOwn(manifest.profiles, profile)) {
    throw new Error(`Unknown profile ${profile}; choose ${Object.keys(manifest.profiles).join(", ")}`);
  }
  const checks = [];
  if (profile === "contracts" || profile === "all") {
    checks.push(...await runContracts(manifest));
  }
  if (profile === "scenarios" || profile === "all") {
    checks.push(...await runScenarios(manifest));
  }
  if (profile === "full") {
    checks.push(...await runFullSuite());
  }
  return {
    schema_version: "1.0.0",
    environment_id: manifest.environment_id,
    profile,
    passed: true,
    external_network_allowed: false,
    credentials_required: false,
    private_infrastructure_required: false,
    data_origin: "synthetic",
    performance_claim_allowed: false,
    checks
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") {
    const manifest = await loadManifest();
    console.log(JSON.stringify({ profiles: manifest.profiles }, null, 2));
    return;
  }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--profile" || !args[1])) {
    throw new Error("Usage: node scripts/run-contributor-tests.mjs [--profile contracts|scenarios|all|full] [--list]");
  }
  const profile = args[1] ?? "all";
  console.log(JSON.stringify(await runProfile(profile), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(RUNNER_PATH)) {
  main().catch((error) => {
    console.error(JSON.stringify({ passed: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
