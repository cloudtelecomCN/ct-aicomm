import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const value = (flag) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : null; };
const output = resolve(value("--output") ?? "dist/provenance.json");
const subjects = [value("--agent"), value("--bpf"), value("--sbom")].filter(Boolean).map((path) => resolve(path));
if (subjects.length !== 3) throw new Error("--agent, --bpf, and --sbom are required");
let commit = process.env.SOURCE_COMMIT;
if (!commit) ({ stdout: commit } = await exec("git", ["rev-parse", "HEAD"]));
commit = commit.trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("SOURCE_COMMIT must be a full Git commit SHA");
const subject = [];
for (const path of subjects) subject.push({ name: basename(path), digest: { sha256: createHash("sha256").update(await readFile(path)).digest("hex") } });
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject,
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: { buildType: "https://cloudtelecom.cn/build-types/ct-aicomm-agent/v1", externalParameters: {}, internalParameters: {}, resolvedDependencies: [{ uri: "git+https://github.com/cloudtelecomCN/ct-aicomm", digest: { gitCommit: commit } }] },
    runDetails: { builder: { id: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : "local-reproducible-build" }, metadata: { invocationId: process.env.GITHUB_RUN_ID ?? "local" } }
  }
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(statement, null, 2)}\n`);
process.stdout.write(`${output}\n`);
