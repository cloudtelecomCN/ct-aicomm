# CT-Advisor 2.0 user guide

[中文](user-guide-v2.zh-CN.md)

> Manual version: 1.0.0  
> Product contract: CT-Advisor 2.0 / schema 2.0.0  
> Updated: 2026-10-24  
> Release status: pre-RC implementation guide

CT-Advisor is an AI infrastructure decision workspace. It keeps requirements, candidate resources, sizing, infrastructure combinations, source status, hard constraints, multi-objective analysis, reports, and human decisions in one traceable workflow. It provides read-only decision support. It does not buy resources, deploy workloads, redirect traffic, execute scheduling decisions, or issue performance or compliance certification.

## 1. Product and access boundary

CT-Advisor is one product with one workspace model. Published task templates, resource discovery, sizing, cost estimation, cross-GPU/cloud/region/network comparison, constraint analysis, ordinary recommendations, and Basic Report exports are free.

The only paid capability is the **GPU Decision & Evidence Package**. A commercial prompt appears only after an eligible user explicitly asks for that formal package. Opening or closing the prompt does not charge, grant access, or delete free work. A quote and server-side entitlement are required before formal-package production.

Current hosted entry points:

- English Basic Report workspace: `https://cloudtelecom.cn/en/advisor/`
- Chinese Basic Report workspace: `https://cloudtelecom.cn/advisor`
- English help center: `https://cloudtelecom.cn/en/advisor/help/`
- Chinese help center: `https://cloudtelecom.cn/advisor/help/`
- OpenAPI contract: `https://cloudtelecom.cn/openapi.yaml`

The hosted browser workspace currently covers authenticated Basic Report generation, immutable report history, JSON/CSV/local-PDF export, and the in-place formal-package prompt. Upstream project, Passport, catalog, sizing, combination, Data Gate, and analysis operations are available through the versioned API. This guide does not claim a complete browser UI for those upstream steps.

## 2. Before you start

Prepare as many of these facts as you have. Missing facts remain explicit unknowns.

- model name and version, parameter count, precision, context, and output length;
- serving or training framework;
- average and peak QPS, concurrency, or token volume;
- TTFT, TPOT, throughput, availability, or completion targets;
- budget, currency, term, discounts, tax, and network-egress assumptions;
- allowed and excluded GPUs, providers, regions, and network paths;
- data-residency and internal policy constraints;
- vendor quotations, internal measurements, or published sources; and
- decision deadline and named reviewers.

Never paste passwords, private keys, bearer tokens, or production credentials into a project field, source record, or support message.

## 3. Authentication and roles

A hosted workspace credential is a high-entropy bearer token. It is shown once and retained by the service only as a SHA-256 digest. Store it in an approved secret manager. Do not put it in source control or browser bookmarks.

```bash
export CT_ADVISOR_TOKEN='ctw_replace_with_your_one_time_token'
```

Workspace scope is derived from the token on the server. Supplying another `org_id` does not change the tenant.

| Role | Current server-side authority |
|---|---|
| Owner | Workspace administration, project writes, formal review, retention changes, archive, delete, and permitted downloads |
| Admin | Project writes, formal review, retention changes, archive, and permitted downloads |
| Operator | Project writes and permitted downloads |
| Viewer | Read access and permitted downloads |

Platform legal holds and commercial authorization use separate administrator credentials; they are not workspace-token powers.

## 4. End-to-end workflow

Use the same immutable project ID throughout the workflow.

1. Select a published task template.
2. Create a free project.
3. draft and freeze a Requirement Passport;
4. select public resources or add tenant-private sourced facts;
5. create sizing calculations and infrastructure combinations;
6. run the Data Readiness Gate;
7. run deterministic multi-objective analysis;
8. generate and export a free Basic Report; and
9. optionally request the formal GPU Decision & Evidence Package.

### 4.1 Discover templates and public resources

These endpoints are public and do not expose tenant data:

```bash
curl -sS https://cloudtelecom.cn/api/v1/advisor/task-templates
curl -sS https://cloudtelecom.cn/api/v1/advisor/catalog/resources
```

Template maturity (`preview`, `beta`, or `stable`) describes implementation evidence, not a pricing tier. Public catalog records may include synthetic fixtures. Read every source status before using a value.

### 4.2 Create a project

```bash
curl -sS -X POST https://cloudtelecom.cn/api/v1/workspace/advisor/projects \
  -H "Authorization: Bearer $CT_ADVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Inference platform selection",
    "template_id": "ai-inference-infrastructure-selection/v1",
    "locale": "en"
  }'
```

The project is free. Formal-package eligibility remains a property of the same project; CT-Advisor does not create a hidden paid copy.

### 4.3 Requirement Passport

The Passport records values, units, hard constraints, source status, confidence, and explicit unknowns. Draft edits do not rewrite a frozen version. Freeze the Passport before Data Gate and analysis so later results remain reproducible.

Use the published [Requirement Passport 2.0 contract](requirement-passport-v2.md) for the request shape and field profiles.

### 4.4 Catalog, sizing, and combinations

Public catalog records are separate from tenant-private quotations and internal measurements. Supported resource types are GPU, cloud instance, region, network path, software stack, and pricing offer.

Sizing and cost calculations preserve formulas, units, assumptions, source bindings, and unknowns. A result is an estimate, not an inventory or performance commitment.

An infrastructure combination binds the selected GPU, provider/instance, region, network path, software stack, pricing, and configuration. JSON and CSV imports are validated atomically. Comparison remains free across any supported GPU, cloud, region, or network dimensions.

### 4.5 Data Gate and analysis

The Data Gate returns one of:

- `ready`: required inputs are comparable;
- `ready_with_gaps`: analysis may continue, but gaps must stay visible; or
- `blocked`: no recommendation is produced until blocking conditions are corrected.

Hard constraints exclude a candidate before scoring. Multi-objective analysis then evaluates eligible combinations under versioned cost, performance, balanced, and compliance-oriented scenarios. Pareto and sensitivity outputs remain tied to the same frozen observations. Unknown metrics are not silently imputed.

### 4.6 Basic Report

Open the hosted Basic Report workspace, enter the workspace token, choose a project and analysis run, then generate a report. JSON and CSV are generated by the server. PDF is rendered locally in the browser and is not sent to an external conversion service.

A Basic Report is self-service analysis. It is not formal procurement evidence, an independent review, a certification, an approval, or execution authorization.

## 5. Data source status

Keep source kind and confidence attached to every material value.

| Status | Meaning |
|---|---|
| `measured` | Measurement with recorded method and environment |
| `vendor_published` | Vendor-published fact |
| `customer_quoted` | Customer-held quotation or contract condition |
| `customer_declared` | Customer declaration not independently verified |
| `modeled` | Formula- or model-derived value |
| `inferred` | Indirect inference |
| `synthetic` | Test or demonstration data; not a real-world claim |
| `unknown` | No reliable value is available |

Do not relabel modeled, inferred, or synthetic data as measured.

## 6. Formal GPU Decision & Evidence Package

For the eligible inference-infrastructure-selection task, a complete Basic Report can expose the formal-package action. The in-place prompt shows the formal scope and quote state. A quote request creates a pending record only; it does not charge or grant entitlement.

After commercial authorization, the formal workflow freezes scope and sources, records review and human resolution separately from the recommendation, and produces a numbered report plus a deterministic Evidence Package. Recommendations, human decisions, and any future execution receipts are different facts.

The package does not guarantee optimality, source truth, performance improvement, certification, legal compliance, purchase, deployment, or execution.

## 7. Verify an Evidence Package

Download both the ZIP and its `.zip.sha256` sidecar. Use the public zero-dependency verifier from this repository:

```bash
node scripts/verify-advisor-evidence-package.mjs \
  advisor_evidence_package_<uuid>.zip \
  --sha256 advisor_evidence_package_<uuid>.zip.sha256
```

Optional `--package-id` and `--contract-id` values bind the check to an expected context. A passing result verifies structure, checksums, compatible versions, and packaged state. It does not verify source truth, signer identity, entitlement, certification, performance, or current online revocation state. See the [formal package verification guide](formal-evidence-package-verification-v1.md).

## 8. Security, retention, and deletion

- Protected reads and downloads require workspace authentication and use `Cache-Control: no-store`.
- Basic Report and Evidence Package downloads append bounded audit events without credentials, query strings, request bodies, or artifact bytes.
- Archive requires owner or admin authority. Delete requires the owner role.
- Deletion remains blocked while archive retention, formal-evidence retention, an active commercial lifecycle, or a legal hold applies.
- The platform defaults are 30 days for archived projects and 2,555 days for formal evidence and audit records; an organization policy may select only supported, ordered ranges.
- A legal or contractual retention obligation can prevent immediate deletion. The disposition endpoint returns the blocker and applicable date when known.

These controls are an engineering baseline. They are not a claim of independent penetration testing, certification, or legal advice.

## 9. Troubleshooting

| Symptom or code | Meaning | Action |
|---|---|---|
| `unauthorized_workspace` | Missing or invalid workspace token | Use the current one-time-issued token; request rotation if lost |
| Project not found | Missing object or different tenant | Check the project ID and token; the API intentionally hides cross-tenant existence |
| `ready_with_gaps` | Analysis is possible with explicit limitations | Review source, unit, and validity gaps before relying on rank order |
| `blocked` | A hard constraint or required mapping is unresolved | Fix the listed blocker; CT-Advisor will not invent a recommendation |
| No analysis in the report page | The selected project has no valid analysis run | Complete Passport, combinations, Data Gate, and analysis through the API |
| Formal package action absent | The project/template/report is not eligible or complete | Continue with the free Basic Report or use the eligible task scope |
| `upgrade_required` | Formal production lacks an active entitlement | Request a quote or keep using free outputs |
| Package verification fails | Bytes, structure, version, or context do not match | Do not use the package formally; obtain a complete replacement |
| Delete is blocked | Retention, evidence, commercial state, or legal hold applies | Read the disposition evaluation and wait or resolve the named blocker |

## 10. Version mapping and support

The hosted help center publishes a machine-readable version map. At the time of this manual:

| Surface | Version |
|---|---|
| Product | CT-Advisor 2.0 |
| Product contract schema | 2.0.0 |
| Manual | 1.0.0 |
| Requirement Passport schema | 2.0.0 |
| Task registry, project, catalog, sizing, combination, Data Gate, analysis, Basic Report, Evidence Package, commercial, and security schemas | 1.0.0 |

Use the hosted `/release.json` as the authority for the deployed source revision. Product version, manual version, API/schema versions, and website deployment revision are separate identifiers.

When reporting a problem, include the product/manual version, project ID, page or endpoint, timestamp, steps, and error code. Do not include passwords, tokens, private keys, or unredacted customer data. Security reports should use the private process in [SECURITY.md](../../SECURITY.md).

