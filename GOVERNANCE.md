# Project governance

[中文](GOVERNANCE.zh-CN.md)

This document defines how people may become reviewers or maintainers of the public `cloudtelecomCN/ct-aicomm` repository, what each role may do, and how access is reviewed or removed.

## Current governance status

CT-AIComm is in a **bootstrap governance** phase. The authoritative [role roster](governance/roles.json) currently records one bootstrap maintainer, `cloudtelecomCN`.

- External reviewers: **0**
- External maintainers: **0**
- Technical Steering Committee (TSC): **not formed**

No person, company, advisory group, or TSC should be inferred from examples, issue comments, contributor history, or aspirational role names. GitHub repository settings grant access; the roster records and explains that access but does not grant it.

## Roles and permission boundaries

| Role | Normal GitHub permission | May do | Must not do |
|---|---|---|---|
| Contributor | none | Open issues and pull requests, run public tests, comment on public work | Approve their own contribution or claim project authority |
| External domain reviewer | none, optionally triage after probation | Review evidence in a declared scope and publish a reasoned recommendation | Merge, tag, change settings, access secrets, or review a conflicted submission |
| Scoped maintainer | write | Review and merge pull requests inside an approved scope after required checks and approvals | Administer the repository, access secrets, bypass evidence gates, or merge their own change |
| Release manager | write or maintain | Prepare a version and invoke the signed release workflow | Store signing keys, bypass the tag/version gate, or change repository security settings |
| Security maintainer | separately assigned security access | Triage private vulnerability reports and coordinate disclosure | Copy private reports into public issues or use security access for unrelated work |
| Bootstrap maintainer | admin | Configure safeguards, appoint scoped roles, and handle recovery while governance is bootstrapping | Claim a TSC exists, silently appoint external maintainers, or approve a decision in which they are conflicted |

Permissions are least privilege and scope limited. A reviewer title does not automatically confer GitHub write access. Access to private vulnerability reports, releases, repository administration, and production systems is never implied by another role.

## Admission process

1. Open the public **External reviewer or maintainer nomination** issue. A candidate may nominate themselves. Do not include private identity documents, credentials, customer data, or vulnerability details.
2. Name one requested role and scope, link public contribution or review evidence, disclose relevant employer, vendor, consulting, investment, or other conflicts, and accept the Code of Conduct and security boundaries.
3. A reviewer candidate should normally show at least two substantive public reviews or contributions in the requested scope. A scoped-maintainer candidate should normally show at least three merged contributions over at least 60 days, including one review of another contributor's work.
4. An unconflicted maintainer checks technical judgment, respectful collaboration, provenance discipline, security behavior, and ability to apply the project's evidence boundaries. Popularity, employer, or commercial relationship is not sufficient.
5. The decision is recorded on the nomination issue with the role, scope, GitHub permission, probation dates, decision maker, conflicts and recusals, and reasons. Rejection may be reconsidered after 90 days unless the decision identifies a security or conduct bar.
6. External roles begin with a 90-day probation. The bootstrap maintainer applies the minimum GitHub permission only after the public decision is recorded, then updates `governance/roles.json` in a reviewed pull request.

A candidate cannot approve their own nomination. If the sole bootstrap maintainer is conflicted, the appointment waits for an unconflicted decision maker; bootstrap status is not permission to waive recusal.

## Pull-request and decision rules

- Non-admin changes to `main` use pull requests. Force pushes and branch deletion are disabled.
- A contributor cannot supply the approval for their own change. Stale approvals are dismissed after material changes, and conversations must be resolved before merge.
- CODEOWNERS identifies the current accountable maintainer. It is not a list of community members or evidence that a committee exists.
- Registry domain review, security triage, release authority, and repository administration are separate decisions. One role does not silently grant another.
- Emergency administrator bypass is limited to security containment or repository recovery. The bootstrap maintainer must open a public follow-up record when disclosure is safe.

## Review, inactivity, and exit

Probation is reviewed at 90 days. Active external roles are reviewed at least every 180 days against public activity, scope, unresolved conflicts, conduct, and continued need for access.

Access ends through any of these paths:

- **Voluntary exit:** the role holder requests removal; access is removed promptly and the roster records `retired`.
- **Term or inactivity:** a role with no qualifying activity for 180 days is reviewed and normally downgraded or retired unless a public leave period is recorded.
- **Scope change:** obsolete access is removed before replacement access is granted.
- **Conduct or security breach:** access may be suspended immediately to contain risk. Non-sensitive reasons and the final decision are recorded within 14 days when legally and operationally possible.
- **Repository compromise:** the owner may revoke access first, rotate affected credentials, preserve audit evidence, and publish a safe incident record later.

A removed role holder may appeal once through a new public issue after 30 days, except while a security investigation, legal hold, or Code of Conduct confidentiality requirement prevents public review. Departing maintainers must not retain credentials, private evidence, signing material, or privileged copies.

## Future TSC threshold

No TSC has been formed. Creating one requires a separate governance change that names at least three active maintainers, represents at least two independent affiliations, defines quorum and voting, documents conflicts and recusals, and is accepted through a public pull request. Until that happens, the project must describe itself as bootstrap-maintained.

## Authoritative records

1. GitHub repository settings are authoritative for effective access.
2. [`governance/roles.json`](governance/roles.json) is the public role and status record.
3. This document defines the lifecycle and boundaries.
4. Nomination issues and merged roster changes provide the decision audit trail.

Run `npm run governance:validate` to verify that the roster is internally consistent and does not invent external maintainers or a TSC.
