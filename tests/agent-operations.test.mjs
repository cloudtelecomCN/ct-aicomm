import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("release package contains signed artifacts and operator entry points", async () => {
  const packaging = await source("../agent/install/package-release.sh");
  for (const artifact of ["ct-aicomm-agent", "ct_selector.bpf.o", "ct-aicomm-agent.spdx.json", "provenance.json", "SHA256SUMS", "SHA256SUMS.sig", "release-public-key.pem"]) assert.match(packaging, new RegExp(artifact.replaceAll(".", "\\.")));
  for (const command of ["install-package.sh", "upgrade-package.sh", "diagnose.sh", "emergency-recover.sh", "uninstall.sh"]) assert.match(packaging, new RegExp(command.replaceAll(".", "\\.")));
  assert.match(packaging, /tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner/);
});

test("diagnostics avoid configuration values and emergency recovery stays latched", async () => {
  const diagnose = await source("../agent/install/diagnose.sh");
  const recover = await source("../agent/install/emergency-recover.sh");
  assert.doesNotMatch(diagnose, /cat\s+[^\n]*agent\.env/);
  assert.match(diagnose, /SUMMARY failures=/);
  assert.match(recover, /restore --all/);
  assert.match(recover, /automatic_execution=disabled/);
  assert.match(recover, /systemctl disable/);
  assert.doesNotMatch(recover, /systemctl (?:enable|start)/);
});

test("runbooks cover the complete third-party lifecycle in both languages", async () => {
  for (const path of ["../docs/agent/operations.md", "../docs/agent/operations.zh-CN.md"]) {
    const runbook = await source(path);
    for (const command of ["preflight.sh", "install-package.sh", "upgrade-package.sh", "diagnose.sh", "emergency-recover.sh", "uninstall.sh"]) assert.match(runbook, new RegExp(command.replaceAll(".", "\\.")));
  }
});
