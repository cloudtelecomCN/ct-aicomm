# CT-Advisor multi-objective analysis v1

CT-664 turns candidates that passed the CT-663 Data Gate into reproducible decision support. It compares cost, estimated performance, network, delivery, compliance, evidence confidence, and risk without changing the frozen candidate set between scenarios.

## Order of operations

1. Verify the digest-bound CT-663 result and require `analysis_allowed=true`.
2. Accept observations only for candidates marked `eligible` by the Data Gate.
3. Validate canonical units, ranges, timestamps, references, and source digests.
4. Preserve every missing metric as `unknown`; the engine never imputes a value.
5. Normalize complete candidates with direction-aware min-max normalization.
6. Calculate the Pareto frontier before scenario scoring.
7. Run the frozen cost-first, performance-first, balanced, and compliance-first scenarios against the same input.
8. Perturb one metric weight at a time by 1,000 basis points and report recommendation stability ranges.

## Recommendation semantics

The balanced scenario supplies the primary read-only recommendation. Every scenario retains its ranking, per-metric contribution, alternatives, exclusions, unknowns, and sensitivity outcome. Equal top scores are reported as a tie; a lexical identifier never becomes a hidden tie-break recommendation.

The result is decision support, not a human decision or execution authorization. It does not authorize procurement, deployment, scheduling, traffic switching, or rollback. It makes no global-optimum, certification, guaranteed-savings, or measured-performance claim.

## Public method and fixtures

- `examples/advisor/multi-objective-method-v1.json` freezes ten metrics, four scenario weight sets, and sensitivity parameters.
- `examples/advisor/multi-objective-fixed-input-v1.json` composes the CT-663 synthetic fixture with digest-bound synthetic observations.
- `packages/advisor/multi-objective-analysis.mjs` is the deterministic reference implementation.
- JSON Schemas define the method, composed input, and result.

The base analysis, Pareto calculation, sensitivity analysis, and ordinary recommendation remain free. Formal paid evidence packages are a later, separate workflow and cannot change these calculations.
