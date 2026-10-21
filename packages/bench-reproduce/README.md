# CT-Bench reproduction CLI

This zero-dependency Node.js CLI turns canonical TTFT JSONL samples and an environment record into a portable evidence package containing `report.json`, `raw-samples.csv`, and `SHA256SUMS`. Failed attempts are retained and synthetic, hybrid, and measured samples cannot be mixed.

```sh
node packages/bench-reproduce/cli.mjs --fingerprint-environment=./environment.json
node packages/bench-reproduce/cli.mjs --samples=./samples.jsonl --environment=./environment.json --output=./bench-package --data-origin=measured --scenario=inference-ttft --protocol=http
node packages/bench-reproduce/cli.mjs --verify=./bench-package
```

Every sample must use CT-Bench TTFT schema `1.0.0` and carry the SHA-256 fingerprint of the canonical environment JSON. The CLI refuses to overwrite an existing artifact. See the [English](../../docs/bench-reproduction/README.md) and [Chinese](../../docs/bench-reproduction/README.zh-CN.md) reproduction guides.
