#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { verifySoakStage } from "../packages/qa/soak-gate.mjs";

function values(argv, name) {
  return argv.filter((entry) => entry.startsWith(`${name}=`)).map((entry) => entry.slice(name.length + 1));
}

function value(argv, name, fallback = "") {
  return values(argv, name).at(-1) ?? fallback;
}

function required(argv, name) {
  const result = value(argv, name);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

async function jsonLines(path) {
  return (await readFile(path, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function sha256File(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function aliasFile(entry, option) {
  const separator = entry.indexOf("=");
  if (separator < 1) throw new Error(`${option} must use alias=FILE`);
  return [entry.slice(0, separator), resolve(entry.slice(separator + 1))];
}

function completionEnvelope(value, manifest, field) {
  if (value?.schema_version !== "1.0.0" || value?.task !== "CT-581" || value?.manifest_fingerprint !== manifest.manifest_fingerprint || !Number.isFinite(Date.parse(value?.completed_at)) || Date.parse(value.completed_at) < Date.parse(manifest.planned_finish_at)) {
    throw new Error(`${field} is not bound to the soak manifest`);
  }
}

const argv = process.argv.slice(2);
const manifest = JSON.parse(await readFile(resolve(required(argv, "--manifest")), "utf8"));
const workloadPath = resolve(required(argv, "--workload-windows"));
const workloadCompletion = JSON.parse(await readFile(resolve(required(argv, "--workload-completion")), "utf8"));
completionEnvelope(workloadCompletion, manifest, "workload completion");
const workloadWindows = await jsonLines(workloadPath);
if (workloadCompletion.window_count !== workloadWindows.length || workloadCompletion.workload_ledger_sha256 !== await sha256File(workloadPath)) throw new Error("workload completion does not match its immutable ledger");
const nodeObservations = [];
const observationEntries = values(argv, "--node-observations").map((entry) => aliasFile(entry, "--node-observations"));
const completionEntries = values(argv, "--node-completion").map((entry) => aliasFile(entry, "--node-completion"));
const observationFiles = new Map(observationEntries);
const completionFiles = new Map(completionEntries);
if (observationEntries.length !== observationFiles.size || completionEntries.length !== completionFiles.size || observationFiles.size !== manifest.node_aliases.length || completionFiles.size !== manifest.node_aliases.length || manifest.node_aliases.some((alias) => !observationFiles.has(alias) || !completionFiles.has(alias))) {
  throw new Error("node observation and completion files must exactly match manifest aliases");
}
const completedAt = [workloadCompletion.completed_at];
for (const alias of manifest.node_aliases) {
  const observationPath = observationFiles.get(alias);
  const observations = await jsonLines(observationPath);
  const completion = JSON.parse(await readFile(completionFiles.get(alias), "utf8"));
  completionEnvelope(completion, manifest, `${alias} completion`);
  if (completion.node_alias !== alias || completion.observation_count !== observations.length || completion.observations_sha256 !== await sha256File(observationPath)) throw new Error(`${alias} completion does not match its immutable ledger`);
  for (const observation of observations) {
    if (observation.node_alias !== alias) throw new Error(`node observation alias mismatch for ${alias}`);
    nodeObservations.push(observation);
  }
  completedAt.push(completion.completed_at);
}
const inferredFinishedAt = new Date(Math.max(...completedAt.map((entry) => Date.parse(entry)))).toISOString();
const receipt = verifySoakStage({ manifest, workloadWindows, nodeObservations, finishedAt: inferredFinishedAt });
const output = resolve(required(argv, "--output"));
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ output, status: receipt.status, claim_gate: receipt.claim_gate, receipt_fingerprint: receipt.receipt_fingerprint })}\n`);
if (receipt.status !== "passed") process.exitCode = 1;
