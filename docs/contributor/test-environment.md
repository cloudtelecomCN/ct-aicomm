# Contributor test environment

[中文](test-environment.zh-CN.md)

The public contributor environment provides a repeatable way to validate CT-AIComm contracts without credentials, private infrastructure, GPU nodes, or production endpoints. It uses only Node.js built-ins and repository fixtures, so no package installation is required.

## Requirements

- Node.js 22 or newer; public CI uses Node.js 24.
- Git only when running the complete repository suite.
- Docker is optional.

## Run locally

```sh
npm test
```

Available profiles:

```sh
npm run test:contracts
npm run test:scenarios
npm run test:full
node scripts/run-contributor-tests.mjs --list
```

The runner forwards a small environment allowlist, drops credential and deployment variables, and preloads an external-network guard. Loopback access remains available for local fixtures; all non-loopback DNS, HTTP, HTTPS, TCP, and TLS attempts fail before a connection is made.

## Run in a container

```sh
docker build -f containers/contributor/Dockerfile -t ct-aicomm-contributor .
docker run --rm --network none --read-only --tmpfs /tmp ct-aicomm-contributor --profile all
```

The image installs no repository dependencies and runs as the unprivileged `node` user. The runtime flags provide a second network boundary in addition to the in-process guard.

## Evidence boundary

Every bundled scenario uses synthetic fixtures. A passing report proves only that the public contracts, examples, and declared safety boundaries are internally consistent. It is not measured production evidence and does not authorize a performance claim. Real POC evidence follows the separate environment-freeze, provenance, privacy, and independent-review gates.

The machine-readable environment contract is [`specs/contributor/test-environment-v1.json`](../../specs/contributor/test-environment-v1.json).
