# Link Evidence Passport delivery package and offline verification v1

[中文](delivery-package-and-offline-verification-v1.zh-CN.md)

CT-614 turns one sealed CT-612 Passport version into a portable, checksum-bound
delivery. Another environment can recompute the specified statistics and the
human-readable summary from the delivered JSON and CSV without contacting a
CT-AIComm service.

## Delivered files

| File | Purpose |
|---|---|
| `manifest.json` | Exact Passport, run, freeze, origins, statistics profile, artifact hashes, and claim boundary |
| `passport-version.json` | Sealed immutable Passport version |
| `previous-version.json` | Exact predecessor when the delivered version is a replacement |
| `run.json` | Started run binding used by the Passport version |
| `freeze.json` | Frozen scenario and method |
| `observations.json` | Exact normalized observations referenced by the version |
| `samples.csv` | Included, excluded, and failed source rows used for recomputation |
| `SUMMARY.md` | Deterministically rendered human-readable statistics and limitations |
| `VERIFY.md` | Local verification requirements and command |
| `SHA256SUMS` | SHA-256 for every other file in the delivery |

The optional predecessor file is required when the sealed Passport version has a
`previous_version_ref`. No path in the delivery may be nested, symbolic, or
outside the selected delivery directory.

## Statistics profile

`ct-passport-statistics-v1` fixes the following behavior:

- rows are ordered by observation id, sequence, and sample id;
- every attempted sample is exactly one of `included`, `excluded`, or `failed`;
- failure code and stage counts, exclusion-rule counts, and the five CT-611
  sample counters must close exactly;
- included rows use the observation's source unit and the CT-611 conversion
  catalog;
- `mean` uses the ordered included values, while `p50`, `p95`, and `p99` use the
  nearest-rank method;
- numeric results are stabilized to 15 significant digits in IEEE-754 binary64;
- `raw`, `count`, `mean`, `min`, `max`, `p50`, `p95`, and `p99` are the only
  accepted aggregations;
- the recomputed source and normalized values must exactly match the sealed
  normalized observation.

The verifier then renders `SUMMARY.md` again and requires byte-for-byte equality.
Editing the prose, dropping a failed sample, changing a value, or adding an
undeclared file fails closed.

## Offline verification

Use Node.js 22 or newer from a checkout of this public repository:

```bash
node scripts/verify-passport-delivery.mjs <delivery-directory>
```

The command needs no credential, private endpoint, or external network access.
The synthetic scenario exercises two statistics in one package:

```bash
node examples/passport/delivery-package-synthetic.mjs
```

The public SDK is available from
`packages/link-evidence-passport/delivery.mjs`. `createPassportDeliveryPackage()`
produces deterministic in-memory files;
`verifyPassportDeliveryPackage()` independently rebuilds the manifest,
statistics, summary, and checksum set.

## Security and evidence boundary

A successful result proves that the delivered bytes are internally consistent
and that the declared statistics and summary can be reproduced under the frozen
algorithm. It does not authenticate a principal, verify that export was
authorized, prove independent review, establish measured production performance,
settle an SLA dispute, or issue certification. CT-606 authorization and a future
CT-615 sharing decision remain separate records.

All repository fixtures are synthetic and may not be presented as measured
performance.
