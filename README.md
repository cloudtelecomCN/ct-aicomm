# CT-AIComm

[中文](README.zh-CN.md)

CT-AIComm is CloudTelecom's open, evidence-first operating system initiative for communication across AI training and inference environments. This repository is the canonical public home for CT-AIComm documentation and future open-source components.

## Public resources

- [Documentation index](docs/README.md)
- [Offline contributor test environment](docs/contributor/test-environment.md)
- [CT-AIComm whitepaper](docs/whitepaper/README.md)
- [CT-Bench reproduction and evidence contract](docs/bench-reproduction/README.md)
- [TTFT sample v1 JSON Schema](docs/bench-reproduction/ttft-sample.schema.json)
- [CT-Bench reproduction CLI](packages/bench-reproduce/)
- [vLLM connector compatibility v1](docs/connectors/vllm.md)
- [Connector SDK contract v1](docs/connectors/sdk.md)
- [Agent protocol SDK v1](docs/agent/protocol-sdk.md)
- [Registry contribution specification v2](docs/registry/contributing.md)
- [Registry entry signatures and version history](docs/registry/entry-integrity.md)
- [Public SDK boundary](sdk/README.md)
- [Open-source release manifest](docs/governance/open-source-release-manifest.md)
- [Project governance and external maintainer process](GOVERNANCE.md)
- [Current machine-readable role roster](governance/roles.json)
- [Execution evidence binding v1](docs/compliance/execution-evidence-binding.md)
- [Data path declaration v1](docs/compliance/data-path-declaration.md)
- [Offline-verifiable audit package v1](docs/compliance/audit-package.md)
- [Fail-closed evidence gap detection v1](docs/compliance/evidence-gap-detection.md)
- [Versioned compliance rule packs v1](docs/compliance/rule-packs.md)
- [Release verification and SBOM](docs/release/verification.md)
- [Changelog](CHANGELOG.md)
- [Agent control and telemetry schemas](specs/agent/)
- [POC environment freeze contract](docs/poc/environment-freeze.md)
- [Measured baseline collection gate](docs/poc/baseline-collection.md)
- [Measured instance scheduling experiment](docs/poc/instance-scheduling-experiment.md)
- [Measured multi-endpoint scale testing](docs/poc/scale-testing.md)
- [Agent kernel compatibility matrix](docs/agent/kernel-compatibility.md)
- [Long-run stability gate](docs/qa/long-run-testing.md)
- [CT-DSL v1 JSON Schema](specs/ct-dsl/ct-dsl-v1.schema.json)
- [CT-DSL examples](examples/ct-dsl/)
- [CT-DSL reference package](packages/ct-dsl/) and [versioning policy](docs/ct-dsl/versioning.md)
- [OpenAPI 3.1 contract](api/openapi.yaml)
- [Whitepaper PDFs](assets/whitepaper/)

## Public boundary

Catalog records are not benchmark results. Synthetic demonstrations are not measured runs. Recommendations are not execution authorization. Readiness artifacts are not external certification. Synthetic data in this repository is always labeled and must not be presented as measured production performance.

The public SDK, Agent protocol, telemetry schemas, CT-Bench collector, CT-DSL, Registry contribution and signed-history verification, examples, and validation tools are source-released under the repository licenses. Other modules will be added progressively after public review. Website deployment configuration, credentials, signing private keys, customer data, private topology, restricted raw POC samples, and internal operational material are outside the public release boundary.

## Project links

- Website: [cloudtelecom.cn](https://cloudtelecom.cn/)
- English site: [cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)
- Chinese documentation: [README.zh-CN.md](README.zh-CN.md)
- Security reports: see [SECURITY.md](SECURITY.md)
- Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md)
- Governance: see [GOVERNANCE.md](GOVERNANCE.md)
- Releases: [signed GitHub releases](https://github.com/cloudtelecomCN/ct-aicomm/releases)

## License

Source code is licensed under the [Apache License 2.0](LICENSE). Documentation and media are licensed under [CC BY 4.0](LICENSE-DOCUMENTATION.md), unless a file states otherwise.
