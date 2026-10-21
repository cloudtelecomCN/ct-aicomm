#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fingerprintEnvironment, parseJsonLines, verifyBenchPackage, writeBenchPackage } from "./index.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((argument) => { const index = argument.indexOf("="); return index > 2 ? [argument.slice(2, index), argument.slice(index + 1)] : [argument.slice(2), true]; }));
try {
  if (args["fingerprint-environment"]) {
    const environment = JSON.parse(await readFile(args["fingerprint-environment"], "utf8"));
    process.stdout.write(`${fingerprintEnvironment(environment)}\n`);
  } else if (args.verify) process.stdout.write(`${JSON.stringify(await verifyBenchPackage(args.verify))}\n`);
  else {
    for (const name of ["samples", "environment", "output", "data-origin", "scenario", "protocol"]) if (!args[name] || args[name] === true) throw new Error(`--${name} is required`);
    const samples = parseJsonLines(await readFile(args.samples, "utf8"));
    const environment = JSON.parse(await readFile(args.environment, "utf8"));
    const result = await writeBenchPackage(args.output, { samples, environment, dataOrigin: args["data-origin"], scenarioSlug: args.scenario, protocolSlug: args.protocol, methodologyVersion: args.methodology ?? "1.0.0" });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
