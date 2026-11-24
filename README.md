# CT-AIComm Open Interfaces

[中文](README.zh-CN.md)

CT-AIComm is an AI communication and cross-domain coordination operating system from CloudTelecom. This repository contains only its public interoperability layer:

- versioned evidence, Agent-call, and Registry schemas;
- read-only public API contracts;
- connector interface and conformance tooling;
- deterministic synthetic examples;
- public architecture and integration documentation.

## What is not included

The CT-AIComm Enterprise decision, scoring, routing, execution, rollback, commercial optimization, multi-tenant runtime, deployment configuration, customer data, calibration data, weights, and thresholds are proprietary components and are not included in this repository.

This repository is not the development source of truth for CT-AIComm Enterprise. Public content is exported through an explicit allowlist and independently reviewed before release.

## Quick verification

Requires Node.js 22 or newer.

```sh
npm test
npm run verify:example
```

The included examples are synthetic. Passing a schema or conformance check does not establish measurement validity, optimality, authorization, certification, or production readiness.

## Public resources

- [Public/private product boundary](docs/public-boundary.md)
- [Public architecture](docs/architecture.md)
- [Read-only OpenAPI contract](openapi/public-api-v0.2.yaml)
- [Evidence object schema](schemas/evidence/evidence-object-v1.schema.json)
- [Agent-call evidence schema](schemas/agent/agent-call-evidence-v1.schema.json)
- [Registry contribution schema](schemas/registry/registry-contribution-v2.schema.json)
- [Connector interface](adapters/connector-sdk/index.mjs)

## Project links

- Website: [cloudtelecom.cn](https://cloudtelecom.cn/)
- English website: [cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)
- Security reports: [SECURITY.md](SECURITY.md)

## License

Source files are licensed under Apache-2.0. Documentation is licensed under CC BY 4.0 unless a file states otherwise. These licenses apply only to files actually published in this repository and do not grant access to or rights in CT-AIComm Enterprise proprietary components.
