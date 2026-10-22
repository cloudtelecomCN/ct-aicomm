import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

test("generates deterministic SPDX, provenance, and canonical release checksums", async () => {
  const work = await mkdtemp(resolve(tmpdir(), "ct-agent-supply-"));
  const agent = resolve(work, "agent");
  const bpf = resolve(work, "selector.o");
  const sbom = resolve(work, "agent.spdx.json");
  const provenance = resolve(work, "provenance.json");
  const checksums = resolve(work, "SHA256SUMS");
  await writeFile(agent, "agent\n");
  await writeFile(bpf, "bpf\n");
  await exec(process.execPath, ["scripts/generate-agent-sbom.mjs", "--output", sbom], { cwd: root });
  await exec(process.execPath, ["scripts/generate-agent-provenance.mjs", "--agent", agent, "--bpf", bpf, "--sbom", sbom, "--output", provenance], { cwd: root, env: { ...process.env, SOURCE_COMMIT: "a".repeat(40) } });
  await exec(process.execPath, ["scripts/create-release-checksums.mjs", "--agent", agent, "--bpf", bpf, "--sbom", sbom, "--provenance", provenance, "--output", checksums], { cwd: root });
  const spdx = JSON.parse(await readFile(sbom, "utf8"));
  const statement = JSON.parse(await readFile(provenance, "utf8"));
  const lines = (await readFile(checksums, "utf8")).trim().split(/\r?\n/);
  assert.equal(spdx.spdxVersion, "SPDX-2.3");
  assert.ok(spdx.files.length > 10);
  assert.equal(statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit, "a".repeat(40));
  assert.deepEqual(lines.map((line) => line.split(/\s+/).at(-1)), ["ct_selector.bpf.o", "ct-aicomm-agent", "ct-aicomm-agent.spdx.json", "provenance.json"]);
});

test("requires signed production installs and hardened non-root service settings", async () => {
  const install = await readFile(new URL("../agent/install/install.sh", import.meta.url), "utf8");
  const verify = await readFile(new URL("../agent/install/verify-release.sh", import.meta.url), "utf8");
  const service = await readFile(new URL("../agent/install/ct-aicomm-agent.service.in", import.meta.url), "utf8");
  assert.match(install, /unsigned development mode is forbidden for the host root/);
  assert.match(install, /verify-release\.sh/);
  assert.match(verify, /openssl pkeyutl -verify/);
  assert.match(verify, /sha256sum --check --strict/);
  for (const setting of ["User=ct-aicomm-agent", "NoNewPrivileges=true", "ProtectKernelModules=true", "ProtectControlGroups=true", "SystemCallFilter=@system-service bpf", "CapabilityBoundingSet=CAP_BPF CAP_NET_ADMIN CAP_PERFMON", "LimitMEMLOCK=infinity", "ReadWritePaths=/sys/fs/bpf/ct-aicomm-agent /var/lib/ct-aicomm-agent"]) assert.match(service, new RegExp(setting));
  assert.match(service, /^ExecStartPre=\+\/usr\/bin\/chgrp ct-aicomm-agent \/sys\/fs\/bpf$/m);
  assert.match(service, /^ExecStartPre=\+\/usr\/bin\/chmod 1710 \/sys\/fs\/bpf$/m);
  assert.match(service, /^ExecStartPre=\+\/usr\/bin\/install -d -o ct-aicomm-agent -g ct-aicomm-agent -m 0750 \/sys\/fs\/bpf\/ct-aicomm-agent$/m);
});

test("ships a real observe-only runtime instead of a release placeholder", async () => {
  const runtime = await readFile(new URL("../agent/bin/ct-aicomm-agent", import.meta.url), "utf8");
  assert.match(runtime, /bpftool.*prog loadall/s);
  assert.match(runtime, /cgroup attach.*connect4.*cgroup_connect4/s);
  assert.match(runtime, /cgroup attach.*sock_ops.*sockops/s);
  assert.match(runtime, /heartbeat\.jsonl/);
  assert.match(runtime, /permits only CT_AGENT_MODE=observe_only/);
  assert.doesNotMatch(runtime, /^exit 0$/m);
});

test("agent dependency audit rejects undeclared third-party runtime imports", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/audit-agent-dependencies.mjs"], { cwd: root });
  const report = JSON.parse(stdout);
  assert.equal(report.status, "passed");
  assert.ok(report.files_scanned > 0);
  assert.deepEqual(report.third_party_runtime_dependencies, []);
});
