# CT-AIComm Product and User Guide

Guide 1.0.0 · November 25, 2026

CT-AIComm is a communication and cross-domain coordination operating system for AI. It brings protocol selection, inference communication, infrastructure comparison, cross-domain constraints, and audit evidence into one workflow. Start with the public catalog and synthetic examples, use an authorized workspace for persistent reports, or try the offline evaluation kit.

## Choose a starting point

| Your task | Where to start | What you need |
| --- | --- | --- |
| Find and compare communication protocols | [Protocol Registry](https://cloudtelecom.cn/en/registry/) | No sign-in |
| Inspect, download, and reproduce benchmark evidence | [CT-Bench](https://cloudtelecom.cn/en/bench/) | Public browsing, with environment requirements for reproduction |
| Compare GPU, cloud, and region combinations before purchase | [CT-Advisor](https://cloudtelecom.cn/en/advisor/) | Workspace token to save projects and generate online reports |
| Try the workflow on your own machine | [Local Evaluation Kit](https://cloudtelecom.cn/en/resources/) | Windows or Linux and Node.js 22 or later |
| Verify evidence, trace citations, or simulate policy | [Evidence verification](https://cloudtelecom.cn/en/evidence/verify/), [Evidence Q&A](https://cloudtelecom.cn/en/evidence/query/), [Policy workspace](https://cloudtelecom.cn/en/playground/) | No sign-in for public examples |
| Scope integration, compliance handoff, or a pilot | [Product status](https://cloudtelecom.cn/en/product-status/), [Enterprise](https://cloudtelecom.cn/en/enterprise/) | Pilot and workspace access depend on scope and role |

Start with a concrete question, such as which GPU, region, and network combinations to compare for cross-region inference. Use a public example to learn the input and report formats. For a purchase decision, use traceable data that matches the intended workload.

## Protocol Registry

1. Open the catalog. Filter by category, maturity, and evidence trust level, or search for protocols such as gRPC, QUIC, and RoCE v2.
2. Inspect the protocol record, versions, sources, and scenario notes. Use the comparison page for a shortlist, or select a workload, network boundary, priority, and hardware in the recommendation wizard.
3. Use the recommendation as a shortlist and investigate relevant CT-Bench evidence. Catalog listing and rule-based recommendation provide selection context.
4. As a contributor, submit protocol metadata with its version, sources, and scenarios. Reviewed and published entries appear in the public catalog.

[Registry](https://cloudtelecom.cn/en/registry/) · [Compare protocols](https://cloudtelecom.cn/en/registry/compare/) · [Recommendation wizard](https://cloudtelecom.cn/en/registry/recommend/) · [Submit a record](https://cloudtelecom.cn/en/registry/submit/)

## CT-Bench

1. Open a scenario and check its method version, metric units, environment fingerprint, sampling policy, and failure handling. For inference comparisons, check that TTFT collection and workload definitions match.
2. Inspect a run's data origin. Synthetic runs demonstrate the reproduction workflow. Measured runs apply to the environment and method recorded with the run.
3. Follow the reproduction guide to obtain the method and samples. Run the supplied tool and check the report JSON, any raw CSV provided for the run, and its SHA-256.
4. To contribute a measurement, prepare its protocol and scenario, complete environment metadata, and raw samples. Submission enters a review queue. Publication and independent review follow their respective approval workflows.

[Bench](https://cloudtelecom.cn/en/bench/) · [Reproduction guide](https://cloudtelecom.cn/en/docs/bench-reproduction/) · [Submit a run](https://cloudtelecom.cn/en/bench/submit/)

## CT-Advisor

The browser workspace supports pre-purchase requirements, comparison, and reporting. Basic Mode guides the workflow. Expert Mode exposes more method, provenance, and configuration detail. Both display the same underlying results.

1. **Open a workspace.** Obtain a token through authorized workspace creation or a workspace administrator. Enter it in Advisor, select a task template, and set the project name, use case, and target decision date. Administrators issue and rotate credentials from the workspace access panel and store each new value in a secrets manager when it is displayed.
2. **Freeze the Requirement Passport.** Record the workload, budget, target regions, latency objectives, data residency, and compliance constraints.
3. **Prepare candidates and estimates.** Select or register resources with source information. Run sizing and costing, recording assumptions and effective dates. Create combinations by hand or import supported JSON or CSV.
4. **Run Data Gate.** Select the frozen passport and at least two combinations. Review hard constraints, blockers, and missing evidence, then correct inputs and rerun. Record a value and source for each of the ten analysis metrics or mark it unknown.
5. **Review multi-objective analysis.** Inspect cost, performance, compliance, and balanced rankings, reasons for exclusions, Pareto results, and sensitivity. Keep estimates distinct from measured values.
6. **Deliver a Basic Report.** Select a run and language. Generate the report with sources, assumptions, limits, and evidence fingerprints. Export JSON, CSV, or a browser-generated PDF. Use the project export and its offline verifier when you need a portable record.

Catalog access, estimates, analysis, and Basic Reports are free self-service features. The sole paid offering is the formal **GPU Decision & Evidence Package** for pre-purchase decisions spanning GPUs, clouds, regions, and networks. An explicit request starts manual quoting and authorization. The written scope may cover a numbered report, decision record, evidence package, and acceptance record.

[Open Advisor](https://cloudtelecom.cn/en/advisor/) · [Advisor user guide](https://cloudtelecom.cn/en/advisor/help/) · [Release status](https://cloudtelecom.cn/en/advisor/release-status/)

## Local Evaluation Kit 0.2.2

1. Download the ZIP, SHA-256 list, Sigstore bundle, and manual from Resource Center. Verify the download before extraction and prepare Node.js 22 or later.
2. From the kit directory run `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1` on Windows or `sh start.sh` on Linux. Open the terminal's loopback URL, which defaults to `http://127.0.0.1:43120/`.
3. Review deployment requirements, candidate exclusions, and the conclusion in the bilingual synthetic example.
4. Download the sample report as JSON or CSV and the sample evidence as a ZIP. Run `node verify-evidence.mjs <evidence-zip-path>` in the kit directory to match the evidence against the built-in sample offline.

The kit binds to loopback and runs offline without a workspace token or cloud account. Use the Advisor workspace to analyze your own deployment.

[Current download, verification files, and manual](https://cloudtelecom.cn/en/resources/)

## Evidence verification and Q&A

- **Evidence in CI.** Use the browser verifier with a synthetic example or a passport matching the CI evidence contract. Review the digest, status, and reviewability badge, then export the verification result. The badge describes the checks performed. Preserve run provenance and fingerprints when integrating CI. [Guide](https://cloudtelecom.cn/en/docs/evidence-in-ci/) · [Browser verifier](https://cloudtelecom.cn/en/evidence/verify/)
- **Evidence Q&A.** Choose a sample question and inspect facts, figures, citations, gaps, and conflicts. Expert Mode shows the query, method versions, evidence ledger, and digests. Export an explanation package in JSON, HTML, or PDF. [Evidence Q&A](https://cloudtelecom.cn/en/evidence/query/)
- **Copilot.** Select a knowledge scope such as Registry and Bench, ask a question, and follow its citations to the source. [Copilot workspace](https://cloudtelecom.cn/en/copilot/)
- **Public CLI.** Run `npm run verify:example` with Node.js 22 from the public repository. The CLI validates all nine Evidence Core object schemas and recomputes the document digest for a synthetic `evidence_version`. CI passports, kit ZIP exports, and Agent signatures have their own verification tools. [Public CLI](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/cli/verify-evidence.mjs)

## Policy Toolchain and CT-Orchestrator

1. Start from a CT-DSL example, select the workload, candidate routes, and constraints, then validate and simulate the policy.
2. Inspect exclusions, recommendation explanations, and blockers. Use the review, resilience, and release-gate workflows to document human approval and failure handling.
3. Export the simulation or review packet with policy version and scenario inputs. The public workspace simulates declared inputs. Live apply and rollback belong to named controlled pilots under agreed permissions and environment scope.

[CT-DSL](https://cloudtelecom.cn/en/docs/ct-dsl/) · [Policy workspace](https://cloudtelecom.cn/en/playground/) · [CT-Orchestrator](https://cloudtelecom.cn/en/orchestrator/) · [Operations console](https://cloudtelecom.cn/en/console/)

## DataPlane Agent and vLLM Connector

- **CT-DataPlane Agent.** Check host requirements and compatibility. Start with `observe_only` preflight on authorized infrastructure and retain host and event evidence. Policy apply and traffic switching fall under the named pilot scope. [Agent product page](https://cloudtelecom.cn/en/products/agent/)
- **vLLM Connector.** Check the version matrix, then probe endpoint health and capability in the authorized environment. Distinguish live results from fixture coverage and record versions, probe results, and failure behavior. [vLLM Connector](https://cloudtelecom.cn/en/products/connectors/vllm/)
- **Agent identity evidence.** Download the conformance kit and verify sample identity and action records, digests, and signatures locally. Capture the acting Agent, represented party, authorization scope, and credential fingerprint when integrating. Signature verification applies to the signed claim and its scope. [Conformance kit](https://cloudtelecom.cn/en/resources/)

## CT-Auditor and SLA reconciliation

- **Compliance declarations.** Enter the system, workload, source and destination regions, purpose, and transfer boundary. Bind authorized evidence, inspect gaps, and prepare declarations alongside readiness, isolation, and assessment handoff materials. Named assessors issue any external determination within their scope. [CT-Auditor](https://cloudtelecom.cn/en/compliance/auditor/) · [Readiness](https://cloudtelecom.cn/en/compliance/readiness/) · [Assessment handoff](https://cloudtelecom.cn/en/compliance/mlps-assessment-handoff/)
- **SLA evidence.** Bind the service period, applicable clauses, metric definitions, and measurements. Generate reviewable reconciliation materials or a draft. Formal invoices, payment, and decisions on liability follow the governing contract and approval process. [SLA evidence](https://cloudtelecom.cn/en/compliance/sla-billing-evidence/)

## Marketplace and enterprise workspaces

Browse reviewed communication components in Marketplace. Compare versions, compatibility, provenance, and verification materials before testing a component in your environment. Authorized contributors and reviewers use the workspace to manage submission and review. [Marketplace](https://cloudtelecom.cn/en/marketplace/) · [Component workspace](https://cloudtelecom.cn/en/marketplace/workspace/)

An enterprise pilot begins with objectives, data scope, named roles, and acceptance conditions. Once authorized, use the enterprise workspace for scope, acceptance, progress, evidence, risks, decisions, and closeout. Which identity and access settings are available depends on tenant configuration. [Enterprise pilots](https://cloudtelecom.cn/en/enterprise/) · [Enterprise identity](https://cloudtelecom.cn/en/enterprise/identity/)

## API integration and support

The public repository exposes a read-only OpenAPI contract, evidence and Registry schemas, a Connector interface, the CLI, and synthetic examples. Purchase ranking, production routing, execution, tenant controls, and deployment live in the private product. Validate against public specifications first, then request the appropriate workspace access or pilot scope. [API documentation](https://cloudtelecom.cn/en/api/) · [Public source boundary](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/docs/public-boundary.md)

For an authorization error, missing data, or a verification failure, check token lifetime and role, the source and version of inputs, download checksums, and the product's current status. Report the page, steps, time, error code, and shareable identifiers. Use the authorized enterprise channel for credentials and customer material. [Product status](https://cloudtelecom.cn/en/product-status/) · [Security reporting](https://github.com/cloudtelecomCN/ct-aicomm/blob/main/SECURITY.md)
