import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const value = (flag) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : null; };
const output = resolve(value("--output") ?? "dist/SHA256SUMS");
const canonical = new Map([["--agent", "ct-aicomm-agent"], ["--bpf", "ct_selector.bpf.o"], ["--sbom", "ct-aicomm-agent.spdx.json"], ["--provenance", "provenance.json"]]);
const lines = [];
for (const [flag, name] of canonical) {
  const path = value(flag);
  if (!path) throw new Error(`${flag} is required`);
  const digest = createHash("sha256").update(await readFile(resolve(path))).digest("hex");
  lines.push(`${digest}  ${name}`);
}
await writeFile(output, `${lines.sort((a, b) => a.split("  ")[1].localeCompare(b.split("  ")[1])).join("\n")}\n`);
process.stdout.write(`${basename(output)}\n`);
