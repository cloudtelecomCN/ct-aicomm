#!/usr/bin/env node
import { collectTtft } from "./collector.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf("=");
  return index > 2 ? [arg.slice(2, index), arg.slice(index + 1)] : [arg.slice(2), true];
}));

try {
  const sample = await collectTtft({
    endpoint: args.endpoint,
    model: args.model,
    prompt: args.prompt,
    environmentFingerprint: args["environment-fingerprint"],
    apiKey: process.env.VLLM_API_KEY
  });
  process.stdout.write(`${JSON.stringify(sample)}\n`);
  process.exitCode = sample.outcome.success ? 0 : 2;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
