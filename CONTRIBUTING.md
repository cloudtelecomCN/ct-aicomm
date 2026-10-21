# Contributing

Thank you for helping improve CT-AIComm.

## Before opening a change

1. Open an issue describing the problem, evidence, and intended scope.
2. Keep documentation, schemas, examples, and code changes independently reviewable.
3. Never include credentials, customer data, private endpoints, or proprietary test data.
4. Label synthetic data explicitly. Do not present synthetic or estimated values as measured results.
5. Include provenance, units, methodology, environment information, and failure samples with benchmark evidence.

## Pull requests

- Use a focused title and explain the compatibility impact.
- Add or update validation for schema and code changes.
- Keep Chinese and English documentation aligned when both editions exist.
- Confirm that you have the right to contribute every submitted file.

## Test environment

Run the credential-free contract tests and executable synthetic scenarios before opening a pull request:

```sh
npm test
```

No dependency installation, GPU node, or private endpoint is required. The runner removes credential and deployment variables from child processes and denies non-loopback network access. See the [contributor test environment](docs/contributor/test-environment.md) for profiles and the optional container command.

## Registry contributions

Protocol metadata follows [Registry contribution specification v2](docs/registry/contributing.md) ([中文](docs/registry/contributing.zh-CN.md)). Copy the synthetic example into `registry/contributions/<contribution_id>.json`, keep its review status pending, and run:

```sh
node scripts/validate-registry-contribution.mjs --files registry/contributions/<contribution_id>.json
```

The external pull-request preflight checks metadata, public provenance, rights attestations, conflicts of interest, and review requirements. Passing preflight is not approval or publication.

Signed entry histories are maintainer-generated release artifacts. Contributors must not add signing private keys or self-sign a contribution as proof of approval. Public verification keys, signed records, and declared artifacts must follow the [Registry entry integrity contract](docs/registry/entry-integrity.md).

By contributing, you agree that code contributions are licensed under Apache-2.0 and documentation contributions under CC BY 4.0, unless explicitly stated otherwise.
