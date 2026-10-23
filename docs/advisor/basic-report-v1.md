# CT-Advisor Basic Report v1

CT-665 turns one verified CT-664 analysis into a portable, free self-service report. The report retains the complete analysis, the normalized source-observation ledger, formula identifiers, source fingerprints, limitations, and product boundaries.

## Export formats

- **JSON** is the authoritative structured report. It contains the complete four-scenario analysis and every source observation used by that analysis.
- **CSV** is a stable long-form projection. Record types cover report identity, source bindings, candidate coverage, normalization, Pareto membership, scenario weights and rankings, metric contributions, sensitivity, source observations, limitations, and boundaries.
- **PDF** is generated locally in the user's browser from the verified JSON. The PDF metadata includes `CT-Advisor Basic Report <content_sha256>` so the public verifier can bind it back to the report. No tenant data is sent to a third-party renderer.

## Verification

```bash
node scripts/verify-advisor-basic-report.mjs path/to/report.json path/to/report.csv path/to/report.pdf
```

The JSON digest covers the report content except its own digest field. The CSV must be byte-for-byte reproducible from the JSON. A PDF is presentation output: the verifier checks its PDF header and embedded report-digest marker rather than claiming identical pixels across browsers.

## Free-product boundary

- Base access is free and no paid entitlement is required.
- The recommendation is read-only and cannot create a human decision or execution state.
- Unknown values remain unknown; no value is imputed.
- Estimated values are not promoted into measured-performance claims.
- The report is not formal procurement evidence, an official numbered report, an independent review, a certification, legal advice, or a capacity commitment.

Formal evidence-package contracts, numbered reports, human approval records, and revocation workflows begin with CT-666 and later tasks. They are intentionally absent from this format.

