import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import * as sdk from "../packages/link-evidence-passport/delivery.mjs";
import {
  PASSPORT_DELIVERY_ERROR_CODES,
  PASSPORT_DELIVERY_STATISTICS_PROFILE,
  PASSPORT_DELIVERY_VERSION,
  createPassportDeliveryPackage,
  parsePassportDeliverySamplesCsv,
  verifyPassportDeliveryPackage
} from "../packages/link-evidence-passport/delivery.mjs";
import { buildSyntheticPassportDeliveryScenario } from "../examples/passport/delivery-package-synthetic.mjs";

const execute = promisify(execFile);
const assertCode = (code) => (error) => error?.code === code;

function replaceFile(files, path, transform) {
  return files.map((file) => file.path === path ? { ...file, content: transform(file.content) } : { ...file });
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("builds one checksum-bound JSON, CSV, summary, and offline verification delivery", () => {
  const { delivery, verification } = buildSyntheticPassportDeliveryScenario();
  const paths = delivery.files.map(({ path }) => path);

  assert.equal(delivery.manifest.schema_version, PASSPORT_DELIVERY_VERSION);
  assert.equal(delivery.manifest.statistics_profile.profile_id, PASSPORT_DELIVERY_STATISTICS_PROFILE);
  assert.deepEqual(delivery.manifest.data_origins, ["synthetic"]);
  assert.equal(delivery.manifest.summary.observation_count, 2);
  assert.equal(delivery.manifest.summary.sample_count, 20);
  assert.equal(delivery.manifest.summary.statistic_count, 2);
  assert.equal(delivery.manifest.summary.all_statistics_exact, true);
  assert.deepEqual(
    delivery.manifest.summary.statistics.map(({ aggregation, recomputed_value: value }) => [aggregation, value]),
    [["mean", 32], ["p95", 46]]
  );
  for (const required of [
    "manifest.json", "passport-version.json", "previous-version.json", "run.json", "freeze.json",
    "observations.json", "samples.csv", "SUMMARY.md", "VERIFY.md", "SHA256SUMS"
  ]) assert.ok(paths.includes(required), required);
  assert.equal(verification.valid, true);
  assert.equal(verification.checksums_verified, true);
  assert.equal(verification.statistics_recomputed, true);
  assert.equal(verification.summary_recomputed, true);
  assert.equal(verification.performance_claim_allowed, false);
  assert.equal(verification.certification_issued, false);
  assert.ok(Object.isFrozen(delivery));
});

test("fails closed when source samples cannot reproduce a sealed statistic", () => {
  const scenario = buildSyntheticPassportDeliveryScenario();
  const samples = structuredClone(scenario.samples);
  const row = samples.find(({ observation_id: observationId, sequence }) => observationId === scenario.validObservation.observation_id && sequence === 1);
  row.value = 123;

  assert.throws(() => createPassportDeliveryPackage({
    delivery_id: "passport-delivery-ct614-statistic-tamper",
    version: "1.0.0",
    created_at: "2026-10-23T11:06:00.000Z",
    record: scenario.replacement,
    previous_version: scenario.initial,
    run: scenario.started,
    freeze: scenario.freeze,
    observations: [scenario.partialObservation, scenario.validObservation],
    samples
  }), assertCode(PASSPORT_DELIVERY_ERROR_CODES.statisticMismatch));
});

test("rejects checksum tampering, regenerated summary forgery, and extra files", () => {
  const { delivery } = buildSyntheticPassportDeliveryScenario();
  const csvTamper = replaceFile(delivery.files, "samples.csv", (content) => content.replace(",23,ms,", ",24,ms,"));
  assert.throws(
    () => verifyPassportDeliveryPackage({ files: csvTamper }),
    assertCode(PASSPORT_DELIVERY_ERROR_CODES.checksumMismatch)
  );

  const forgedSummary = replaceFile(delivery.files, "SUMMARY.md", (content) => content.replace("| yes |", "| independently verified |"));
  const forgedContent = forgedSummary.find(({ path: filePath }) => filePath === "SUMMARY.md").content;
  const forgedWithChecksum = replaceFile(forgedSummary, "SHA256SUMS", (content) => content.replace(
    /^[a-f0-9]{64}  SUMMARY\.md$/m,
    `${checksum(forgedContent)}  SUMMARY.md`
  ));
  assert.throws(
    () => verifyPassportDeliveryPackage({ files: forgedWithChecksum }),
    assertCode(PASSPORT_DELIVERY_ERROR_CODES.contentMismatch)
  );

  assert.throws(() => verifyPassportDeliveryPackage({
    files: [...delivery.files, { path: "unexpected.txt", content: "not allowed\n" }]
  }), assertCode(PASSPORT_DELIVERY_ERROR_CODES.fileSetMismatch));
});

test("round-trips quoted CSV fields while preserving canonical row order", () => {
  const scenario = buildSyntheticPassportDeliveryScenario();
  const csv = scenario.delivery.files.find(({ path: filePath }) => filePath === "samples.csv").content;
  const parsed = parsePassportDeliverySamplesCsv(csv);
  assert.equal(parsed.length, 20);
  assert.equal(parsed[0].sequence, 1);
  assert.equal(parsed.at(-1).sequence, 10);
});

test("verifies the package in a separate offline process", async () => {
  const { delivery } = buildSyntheticPassportDeliveryScenario();
  const root = await mkdtemp(path.join(tmpdir(), "ct-aicomm-passport-delivery-"));
  try {
    await Promise.all(delivery.files.map(({ path: filePath, content }) => writeFile(path.join(root, filePath), content, { flag: "wx" })));
    const { stdout } = await execute(process.execPath, ["scripts/verify-passport-delivery.mjs", root], {
      cwd: new URL("..", import.meta.url),
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
      timeout: 10000,
      windowsHide: true
    });
    const verified = JSON.parse(stdout);
    assert.equal(verified.valid, true);
    assert.equal(verified.sample_count, 20);
    assert.equal(verified.statistics_recomputed, true);
    assert.equal(verified.summary_recomputed, true);
    assert.equal(verified.external_network_used, false);
    assert.equal(verified.independent_review_verified, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes strict schema, SDK exports, bilingual guidance, and offline coverage", async () => {
  const [schema, publicApi, environment, english, chinese, types] = await Promise.all([
    readFile(new URL("../specs/passport/passport-delivery-manifest-v1.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/public-api-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../specs/contributor/test-environment-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../docs/passport/delivery-package-and-offline-verification-v1.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/passport/delivery-package-and-offline-verification-v1.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../packages/link-evidence-passport/delivery.d.ts", import.meta.url), "utf8")
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.record_type.const, "passport_delivery_manifest");
  assert.equal(publicApi.sdk_version, "0.23.0");
  assert.ok(publicApi.public_contracts.includes("specs/passport/passport-delivery-manifest-v1.schema.json"));
  assert.ok(publicApi.public_tools.includes("scripts/verify-passport-delivery.mjs"));
  for (const exported of [
    "PASSPORT_DELIVERY_VERSION",
    "PASSPORT_DELIVERY_STATISTICS_PROFILE",
    "PASSPORT_DELIVERY_CSV_HEADER",
    "PASSPORT_DELIVERY_ERROR_CODES",
    "renderPassportDeliverySamplesCsv",
    "parsePassportDeliverySamplesCsv",
    "renderPassportDeliverySummary",
    "renderPassportDeliveryVerificationGuide",
    "createPassportDeliveryPackage",
    "verifyPassportDeliveryPackage"
  ]) {
    assert.ok(publicApi.exports.includes(exported), exported);
    assert.ok(exported in sdk, exported);
    assert.match(types, new RegExp(exported));
  }
  assert.match(english, /another environment.*recompute.*statistics.*summary/is);
  assert.match(chinese, /另一环境.*复算.*统计.*摘要/s);
  assert.ok(environment.contract_tests.includes("tests/passport-delivery-package.test.mjs"));
  assert.ok(environment.synthetic_scenarios.some(({ id }) => id === "passport-delivery-package"));
});

test("runs the CT-614 delivery example offline without making a performance claim", async () => {
  const { stdout } = await execute(process.execPath, ["examples/passport/delivery-package-synthetic.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC },
    timeout: 10000,
    windowsHide: true
  });
  assert.deepEqual(JSON.parse(stdout), {
    schema_version: "1.0.0",
    data_origin: "synthetic",
    json_delivered: true,
    csv_delivered: true,
    human_summary_delivered: true,
    offline_steps_delivered: true,
    checksums_verified: true,
    statistics_recomputed: true,
    summary_recomputed: true,
    observation_count: 2,
    sample_count: 20,
    p95_recomputed: true,
    mean_recomputed: true,
    external_network_used: false,
    principal_authentication_verified: false,
    export_authorization_verified: false,
    independent_review_verified: false,
    performance_claim_allowed: false,
    certification_issued: false
  });
});
