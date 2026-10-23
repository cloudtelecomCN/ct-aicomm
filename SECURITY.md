# Security Policy

[中文](SECURITY.zh-CN.md)

## Report vulnerabilities privately

Do not open a public issue, discussion, pull request, or Registry contribution for a suspected vulnerability, leaked credential, private endpoint, or customer information.

Use [GitHub private vulnerability reporting](https://github.com/cloudtelecomCN/ct-aicomm/security/advisories/new). The repository has private reporting enabled, so the report and follow-up remain visible only to the reporter and repository security maintainers until coordinated disclosure.

Include, when available:

- the affected file, component, branch, commit, or version;
- impact and a realistic attack scenario;
- minimal reproduction steps or a proof of concept that does not access third-party data;
- whether exploitation has been observed;
- suggested mitigations and your preferred disclosure timeline.

Do not include live credentials or personal, customer, or partner data. If a credential appears exposed, stop testing it and report only its type, location, and enough redacted context for maintainers to identify and rotate it.

## Supported versions

The current `main` branch head and the latest signed `v0.1.x` release are supported. Security fixes land on `main` first and are included in a new signed patch release when they affect the release line.

| Source line | Security support |
| --- | --- |
| Current `main` branch head | Supported |
| Latest signed `v0.1.x` release | Supported |
| Older commits, untagged snapshots, forks, and modified builds | Not supported |

The `v0.1.x` line is pre-stable. Its support ends when a successor line is published and this table is updated. A downstream fork must publish and operate its own security policy.

## Response and remediation SLA

Maintainers use impact, exploitability, affected scope, and available mitigations to assign severity. The following are maximum response targets for reports with enough information to begin triage:

| Severity | Acknowledge | Initial triage | Mitigation or fix target |
| --- | --- | --- | --- |
| Critical | 1 business day | 2 calendar days | 7 calendar days |
| High | 2 business days | 3 calendar days | 14 calendar days |
| Medium | 3 business days | 7 calendar days | 30 calendar days |
| Low | 5 business days | 14 calendar days | Next planned release or 90 calendar days |

If a complete fix cannot meet the target, maintainers will document the blocker in the private advisory and provide a temporary mitigation, affected-version guidance, or a revised date. These targets describe the public project's maintenance process and are not a commercial support contract.

## Maintainer process

1. Acknowledge the report in the private advisory and confirm a communication owner.
2. Reproduce the issue without using production credentials or unrelated third-party data.
3. Record severity, affected versions, exposure, and any immediate containment action.
4. Prepare the fix and regression test in the advisory's private collaboration area when available.
5. Run the repository's contract, security-boundary, and supply-chain gates.
6. Publish a fixed revision or signed release, then publish the advisory with credit agreed by the reporter.

Credentials and signing material are rotated immediately when exposure is credible; they are never committed as a test fixture. A vulnerability fix does not weaken evidence-origin labels, human approval boundaries, fail-static behavior, or release verification.

## Public repository and hosted-product boundary

This public repository contains specifications, schemas, validation tools, offline workflows, public SDK surfaces, documentation, and releasable examples. It does not contain hosted-product credentials, customer or tenant data, private deployment topology, administrator secrets, commercial operations records, or the complete private service implementation.

The hosted CT-AIComm and CT-Advisor security contract follows these public principles:

- tenant scope is derived server-side from an authenticated workspace credential; callers cannot select another organization;
- owner, admin, operator, and viewer permissions are enforced by the service, with additional separation for formal review workflows;
- protected report and evidence downloads require authentication, disable caching, and append bounded audit facts without logging credentials, request bodies, query strings, or artifact bytes;
- workspace bearer credentials are displayed once and retained by the service only as cryptographic digests;
- project disposition is constrained by retention policy, formal evidence, active commercial state, and legal holds, and blocked requests remain auditable;
- recommendations and evidence do not authorize automatic infrastructure or network execution.

These statements describe product controls and testable boundaries. They are not an independent penetration-test result, certification, statutory assessment, or guarantee that all security risk has been eliminated. Private implementation details are intentionally omitted; disclose suspected weaknesses through the private reporting channel above.

## Coordinated disclosure

Keep the report private until a fix or effective mitigation is available. The default disclosure target is within 90 calendar days of a reproducible report. Maintainers and the reporter may agree to a different date when remediation depends on an upstream project or coordinated ecosystem release.

Maintainers may disclose sooner when active exploitation creates material risk, while limiting operational detail that would increase harm. Public advisories identify affected and fixed versions, impact, mitigations, and credit; they do not publish credentials, private topology, customer data, or unnecessarily weaponized exploit details.

## Scope and researcher conduct

In scope are released source code, SDKs, schemas, validation tools, GitHub workflows, contributor containers, and public examples in this repository. The public website is in scope only when a repository artifact directly causes the issue.

Do not perform denial-of-service testing, social engineering, credential stuffing, destructive testing, automated high-volume scanning, or access to data that is not yours. Stop when personal, customer, partner, or confidential data becomes visible. Third-party services, unsupported forks, and issues that require a user to ignore an explicit security boundary are outside this policy unless the repository itself creates the exposure.

Good-faith research that follows this policy, avoids privacy harm, and gives maintainers reasonable time to remediate will not be treated as malicious activity by the project maintainers.
