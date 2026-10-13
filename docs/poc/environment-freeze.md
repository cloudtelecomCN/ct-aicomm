# POC environment freeze

CT-521 freezes every variable that may change the TTFT comparison before baseline collection starts. Use [`environment-freeze-v1.schema.json`](../../specs/poc/environment-freeze-v1.schema.json) as the exchange contract and `freezeEnvironment` to validate and fingerprint the completed manifest.

The public example is synthetic. A measured POC must replace every value with collected evidence, retain the full manifest with the run package, and keep partner addresses, hostnames, credentials, and restricted topology details outside this repository. Hashes may be published without publishing restricted source material.

The freeze is accepted only when model revision and artifact, accelerator inventory, kernel/driver/runtime/vLLM versions, baseline and candidate routes, Prompt dataset, load profile, executable artifacts, experiment window, and named approval are all pinned. `latest`, `unknown`, `TBD`, and pending approval are rejected.

After approval, any changed field creates a new fingerprint and therefore a new experiment set. Baseline and treatment samples with different environment fingerprints must not be aggregated.
