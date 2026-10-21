import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [english, chinese, issueConfig, readmeEnglish, readmeChinese] = await Promise.all([
  readFile("SECURITY.md", "utf8"),
  readFile("SECURITY.zh-CN.md", "utf8"),
  readFile(".github/ISSUE_TEMPLATE/config.yml", "utf8"),
  readFile("README.md", "utf8"),
  readFile("README.zh-CN.md", "utf8")
]);

const privateReportUrl = "https://github.com/cloudtelecomCN/ct-aicomm/security/advisories/new";

test("routes vulnerability reports away from public issues", () => {
  assert.match(english, /Do not open a public issue/i);
  assert.match(chinese, /不得通过公开 Issue/);
  assert.ok(english.includes(privateReportUrl));
  assert.ok(chinese.includes(privateReportUrl));
  assert.ok(issueConfig.includes(privateReportUrl));
  assert.match(issueConfig, /Do not disclose vulnerabilities or credentials in a public issue/);
});

test("defines the supported source line and bounded response targets", () => {
  assert.match(english, /latest signed `v0\.1\.x` release are supported/i);
  assert.match(chinese, /最新签名 `v0\.1\.x` 版本均受支持/);
  for (const target of [
    "1 business day",
    "7 calendar days",
    "14 calendar days",
    "30 calendar days",
    "90 calendar days"
  ]) {
    assert.ok(english.includes(target), `missing English target: ${target}`);
  }
  for (const target of ["1 个工作日", "7 个自然日", "14 个自然日", "30 个自然日", "90 个自然日"]) {
    assert.ok(chinese.includes(target), `missing Chinese target: ${target}`);
  }
});

test("keeps remediation, disclosure, and evidence boundaries explicit", () => {
  for (const phrase of ["Maintainer process", "Coordinated disclosure", "fail-static", "not a commercial support contract"]) {
    assert.ok(english.includes(phrase), `missing English boundary: ${phrase}`);
  }
  for (const phrase of ["维护者处理流程", "协调披露", "fail-static", "不构成商业支持合同"]) {
    assert.ok(chinese.includes(phrase), `missing Chinese boundary: ${phrase}`);
  }
  assert.match(readmeEnglish, /\[SECURITY\.md\]\(SECURITY\.md\)/);
  assert.match(readmeChinese, /\[SECURITY\.zh-CN\.md\]\(SECURITY\.zh-CN\.md\)/);
});
