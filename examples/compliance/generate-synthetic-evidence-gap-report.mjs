import { readFile } from "node:fs/promises";
import { inspectEvidenceGaps } from "../../packages/compliance/evidence-gap.mjs";

const assessment = JSON.parse(await readFile(new URL("synthetic-evidence-gap-assessment.json", import.meta.url), "utf8"));
const report = inspectEvidenceGaps(assessment, {
  expectedContext: assessment.subject,
  evaluatedAt: new Date("2026-10-22T12:00:00.000Z"),
  trustedVerifierIds: ["synthetic-verifier-v1"]
});

console.log(JSON.stringify(report, null, 2));
