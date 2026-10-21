# CT-AIComm

[中文](README.zh-CN.md)

CT-AIComm is CloudTelecom's open, evidence-first operating system initiative for communication across AI training and inference environments. This repository is the canonical public home for CT-AIComm documentation and future open-source components.

## Public resources

- [Documentation index](docs/README.md)
- [CT-AIComm whitepaper](docs/whitepaper/README.md)
- [CT-Bench reproduction and evidence contract](docs/bench-reproduction/README.md)
- [TTFT sample v1 JSON Schema](docs/bench-reproduction/ttft-sample.schema.json)
- [CT-Bench reproduction CLI](packages/bench-reproduce/)
- [vLLM connector compatibility v1](docs/connectors/vllm.md)
- [Public SDK boundary](sdk/README.md)
- [Open-source release manifest](docs/governance/open-source-release-manifest.md)
- [Agent control and telemetry schemas](specs/agent/)
- [POC environment freeze contract](docs/poc/environment-freeze.md)
- [Measured baseline collection gate](docs/poc/baseline-collection.md)
- [Measured instance scheduling experiment](docs/poc/instance-scheduling-experiment.md)
- [CT-DSL v1 JSON Schema](specs/ct-dsl/ct-dsl-v1.schema.json)
- [CT-DSL examples](examples/ct-dsl/)
- [CT-DSL reference package](packages/ct-dsl/) and [versioning policy](docs/ct-dsl/versioning.md)
- [OpenAPI 3.1 contract](api/openapi.yaml)
- [Whitepaper PDFs](assets/whitepaper/)

## Public boundary

Catalog records are not benchmark results. Synthetic demonstrations are not measured runs. Recommendations are not execution authorization. Readiness artifacts are not external certification. Synthetic data in this repository is always labeled and must not be presented as measured production performance.

The public SDK, Agent protocol, telemetry schemas, CT-Bench collector, CT-DSL, examples, and validation tools are source-released under the repository licenses. Registry components and other modules will be added progressively after public review. Website deployment configuration, credentials, signing private keys, customer data, private topology, restricted raw POC samples, and internal operational material are outside the public release boundary.

## Project links

- Website: [cloudtelecom.cn](https://cloudtelecom.cn/)
- English site: [cloudtelecom.cn/en/](https://cloudtelecom.cn/en/)
- Chinese documentation: [README.zh-CN.md](README.zh-CN.md)
- Security reports: see [SECURITY.md](SECURITY.md)
- Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

Source code is licensed under the [Apache License 2.0](LICENSE). Documentation and media are licensed under [CC BY 4.0](LICENSE-DOCUMENTATION.md), unless a file states otherwise.
