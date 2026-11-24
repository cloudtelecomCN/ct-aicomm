# CT-AIComm Open Interfaces

[中文](README.zh-CN.md)

> CT-AIComm is an evidence-first operating model for cross-domain AI communication decisions: it binds declared inputs, policy decisions, named human approval, and resulting evidence without treating a recommendation as execution.

This repository is the public interoperability layer of CT-AIComm from CloudTelecom. It publishes stable contracts and local verification tools while keeping the CT-AIComm Enterprise runtime and commercial decision logic private.

## The problem

Cross-domain communication and infrastructure decisions for large-model workloads are often difficult to inspect after the fact:

- candidate paths, resources, metrics, and exclusions are spread across different systems;
- a scheduling or routing recommendation may not preserve the evidence and policy version that produced it;
- automated tools can blur the boundary between a recommendation, a named human approval, and an executed change.

CT-AIComm separates those states so a buyer or reviewer can ask what was observed, what policy was applied, who approved the next step, what action was reported, and what remains unverified.

## Reference operating model

```text
CT-AIComm
  ↔ Telemetry and evidence sources (switches, Kubernetes, OpenTelemetry)
  ↔ Policy engine                         [CT-AIComm Enterprise / private]
  ↔ Named human approval gate             [CT-AIComm Enterprise / private]
  ↔ ODAP Gateway                          [MCP integration target / not included]
  ↔ Agent or customer tool                [customer-controlled execution]

Every transition may emit versioned decision or action evidence
  → public schemas → offline verifier → reviewable evidence package
```

The diagram is a reference integration model, not a statement that this repository ships a switch driver, Kubernetes controller, OpenTelemetry Collector, OPA policy service, ODAP Gateway, Agent runtime, or production execution plane.

## Capabilities

### Included in this public repository

- versioned evidence, Agent-call, and Registry JSON Schemas;
- an Agent-call protocol field supporting `mcp`, `a2a`, and `custom` evidence records;
- a read-only public OpenAPI contract;
- a narrow Connector interface for candidate discovery and metric collection;
- a zero-dependency offline evidence verifier;
- deterministic synthetic examples and default-deny public-boundary tests;
- bilingual architecture, integration, security, and contribution documentation.

### CT-AIComm Enterprise boundary

Decision, scoring, ranking, routing, policy execution, named approval orchestration, traffic control, rollback, commercial optimization, multi-tenant authorization, billing, deployment, and operations implementations are proprietary and are not included here. Availability in a commercial or POC scope must be confirmed against the current product status and written project scope.

## Run the synthetic demo (mock mode)

Requires Node.js 22 or newer. No cloud account, workspace token, production credential, or network service is required after the repository is downloaded.

```sh
git clone https://github.com/cloudtelecomCN/ct-aicomm.git
cd ct-aicomm
npm test
npm run verify:example
```

The demo validates the public allowlist, runs contract tests, and verifies a local synthetic evidence file. It does not generate network traffic, measure real performance, recommend a production route, or execute a change.

## Integration patterns

| Integration | Public starting point | Boundary |
| --- | --- | --- |
| Switch or network controller | Implement the Connector interface and normalize approved inventory or metric fields | No vendor driver, configuration write, credential handling, or traffic change is included |
| Kubernetes | Map selected resource and event fields into candidate or evidence records | No cluster credential, controller, admission action, workload deployment, or scheduler mutation is included |
| OpenTelemetry | Map approved metric, span, or log references into versioned evidence fields | No Collector distribution, raw payload retention, or production telemetry pipeline is included |
| OPA | Bind a policy identifier, version, input digest, and decision digest to a decision record | No private policy bundle, enforcement service, approval authority, or execution authorization is included |
| ODAP Gateway / MCP | Use the Agent-call evidence Schema to record MCP, A2A, or custom call metadata | The ODAP Gateway is a named integration target, not a component shipped by this repository; no tool call is executed or authorized here |

Start with [the Connector interface](adapters/connector-sdk/README.md), [the Agent-call evidence Schema](schemas/agent/agent-call-evidence-v1.schema.json), and [the public/private boundary](docs/public-boundary.md).

## Public and private source boundary

This repository is not the development source of truth for CT-AIComm Enterprise. Public content is exported through an explicit allowlist and independently reviewed before release.

The public repository must not contain proprietary algorithms, weights, thresholds, private rules, production bindings, customer or partner data, raw POC material, private topology, credentials, or restricted evidence. Public contracts may describe inputs and outputs, but they must not reveal how proprietary decisions are computed or executed.

Passing a schema or conformance check does not establish measurement validity, optimality, authorization, certification, or production readiness.

## Commercial and strategic collaboration

**We welcome discussions on joint POCs, technical partnerships, strategic investment, and IP acquisition.**

Potential work is scoped separately from this public repository and is subject to written authorization, confidentiality, security, data-rights, and intellectual-property review. Start through the [CloudTelecom English contact page](https://cloudtelecom.cn/en/about/) or the [Chinese contact page](https://cloudtelecom.cn/about).

## Public resources

- [Public/private product boundary](docs/public-boundary.md)
- [Public architecture](docs/architecture.md)
- [Read-only OpenAPI contract](openapi/public-api-v0.2.yaml)
- [Evidence object Schema](schemas/evidence/evidence-object-v1.schema.json)
- [Agent-call evidence Schema](schemas/agent/agent-call-evidence-v1.schema.json)
- [Registry contribution Schema](schemas/registry/registry-contribution-v2.schema.json)
- [Connector interface](adapters/connector-sdk/index.mjs)
- [Security policy](SECURITY.md)

## Project links

- Website: [cloudtelecom.cn](https://cloudtelecom.cn/)
- English website: [cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)

## License

Source files are licensed under Apache-2.0. Documentation is licensed under CC BY 4.0 unless a file states otherwise. These licenses apply only to files actually published in this repository and do not grant access to or rights in CT-AIComm Enterprise proprietary components.
