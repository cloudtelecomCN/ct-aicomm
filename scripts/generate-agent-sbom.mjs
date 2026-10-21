import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const outputArg = process.argv.indexOf("--output");
const output = resolve(outputArg >= 0 ? process.argv[outputArg + 1] : "dist/ct-aicomm-agent.spdx.json");
const root = process.cwd();
const files = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "build") await inventory(path);
    } else if (entry.isFile()) {
      files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
}
await inventory(resolve("agent"));
await inventory(resolve("packages/agent-control"));
files.sort();
if (!files.length) throw new Error("agent source inventory is empty");
const spdxFiles = [];
for (const path of files) {
  const content = await readFile(resolve(path));
  spdxFiles.push({ SPDXID: `SPDXRef-File-${spdxFiles.length + 1}`, fileName: path.replaceAll("\\", "/"), checksums: [{ algorithm: "SHA256", checksumValue: createHash("sha256").update(content).digest("hex") }] });
}
const namespaceHash = createHash("sha256").update(JSON.stringify(spdxFiles)).digest("hex");
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "ct-aicomm-agent-source",
  documentNamespace: `https://cloudtelecom.cn/spdx/ct-aicomm-agent/${namespaceHash}`,
  creationInfo: { created: new Date(0).toISOString(), creators: ["Tool: CT-AIComm deterministic SBOM generator 1.0.0"] },
  packages: [{ name: "ct-aicomm-agent", SPDXID: "SPDXRef-Package-Agent", versionInfo: "source", downloadLocation: "NOASSERTION", filesAnalyzed: true, licenseConcluded: "Apache-2.0", licenseDeclared: "Apache-2.0", copyrightText: "NOASSERTION", packageVerificationCode: { packageVerificationCodeValue: namespaceHash } }],
  files: spdxFiles,
  relationships: spdxFiles.map(({ SPDXID }) => ({ spdxElementId: "SPDXRef-Package-Agent", relationshipType: "CONTAINS", relatedSpdxElement: SPDXID }))
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`${output}\n`);
