# Evidence authenticity gate

This gate is the mandatory boundary for CT-Bench import, aggregation, export, API responses, and UI labels.

- `synthetic`: generated demonstration data; performance claims prohibited.
- `hybrid`: partially measured data with synthetic or substituted components; limitations required and performance claims prohibited.
- `measured`: measured evidence with an environment fingerprint, raw-record hash, collector and methodology versions, and at least one measured timing.

`assertSingleOrigin` rejects cross-origin aggregation. `createExportManifest` emits fixed English and Chinese labels and a `performance_claim_allowed` flag. Consumers must not replace these labels or promote `synthetic` or `hybrid` results to measured results.
