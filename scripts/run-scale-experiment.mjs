#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildScalePlan, runScalePlan, summarizeScaleBatch } from "../packages/poc/scale-experiment.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function values(argv, name) {
  return argv.filter((entry) => entry.startsWith(`${name}=`)).map((entry) => entry.slice(name.length + 1));
}

function value(argv, name, fallback = "") {
  const matches = values(argv, name);
  return matches.length ? matches.at(-1) : fallback;
}

function positiveInteger(valueText, name, fallback) {
  const parsed = Number.parseInt(valueText || String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1) fail(`${name} must be a positive integer`);
  return parsed;
}

function parseEndpoint(entry) {
  const separator = entry.indexOf("=");
  if (separator < 1) fail("--endpoint must use alias=http://host:port");
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}

function parseTopology(entry) {
  const separator = entry.indexOf(":");
  if (separator < 1) fail("--topology must use id:alias[,alias]");
  return { id: entry.slice(0, separator), endpoint_ids: entry.slice(separator + 1).split(",").filter(Boolean) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const argv = process.argv.slice(2);
const environmentPath = value(argv, "--environment");
const promptsPath = value(argv, "--prompts");
const outputPath = value(argv, "--output");
if (!environmentPath || !promptsPath || !outputPath) {
  fail("usage: run-scale-experiment --environment=FILE --prompts=FILE --endpoint=alias=URL --endpoint=alias=URL --output=DIR [--topology=id:alias,alias --concurrency=1,8,32,64 --samples=64 --repetitions=2 --model=MODEL]");
}

const endpointEntries = values(argv, "--endpoint").map(parseEndpoint);
if (endpointEntries.length < 2) fail("at least two --endpoint values are required");
const endpoints = new Map(endpointEntries);
if (endpoints.size !== endpointEntries.length) fail("endpoint aliases must be unique");
const topologyEntries = values(argv, "--topology");
const endpointIds = [...endpoints.keys()];
const topologies = topologyEntries.length
  ? topologyEntries.map(parseTopology)
  : [{ id: "single-endpoint", endpoint_ids: [endpointIds[0]] }, { id: "all-endpoints", endpoint_ids: endpointIds }];
const concurrencyLevels = value(argv, "--concurrency", "1,8,32,64").split(",").map((entry) => positiveInteger(entry, "concurrency", 1));
const samplesPerStratum = positiveInteger(value(argv, "--samples"), "samples", 64);
const repetitions = positiveInteger(value(argv, "--repetitions"), "repetitions", 2);

const environment = JSON.parse(await readFile(resolve(environmentPath), "utf8"));
const prompts = (await readFile(resolve(promptsPath), "utf8"))
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const plan = buildScalePlan({ environment, prompts, topologies, concurrencyLevels, samplesPerStratum, repetitions });
const batch = await runScalePlan({
  plan,
  endpoints,
  model: value(argv, "--model", environment.model?.identifier),
  apiKey: process.env.VLLM_API_KEY
});
const summary = summarizeScaleBatch(batch);
const output = resolve(outputPath);
await mkdir(output, { recursive: true, mode: 0o700 });
const artifacts = new Map([
  ["plan.json", `${JSON.stringify(plan, null, 2)}\n`],
  ["batch.json", `${JSON.stringify(batch)}\n`],
  ["summary.json", `${JSON.stringify(summary, null, 2)}\n`]
]);
for (const [name, bytes] of artifacts) await writeFile(resolve(output, name), bytes, { mode: 0o600 });
const checksums = [...artifacts].map(([name, bytes]) => `${sha256(bytes)}  ${name}`).join("\n");
await writeFile(resolve(output, "SHA256SUMS"), `${checksums}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
