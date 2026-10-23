# CT-Advisor sizing and cost formulas v1

Version `1.0.0` defines the public, deterministic calculation layer for CT-Advisor sizing and cost analysis. It estimates a declared AI inference workload against one declared candidate shape. It does not discover live inventory, measure performance, reserve capacity, or execute a purchase.

## Input discipline

Every numeric input is an interval with a canonical unit, source references, and one explicit status:

- `provided`: calculate from the supplied interval.
- `unknown`: propagate the missing path; never insert an industry default.
- `not_applicable`: accepted only for defined optional cost fields and converted to zero only because the caller explicitly excluded that cost.

The engine rejects extra fields, wrong units, non-finite ranges, mixed network-cost applicability, and impossible usable-memory inputs. A cost model may be `null` when cost analysis was not requested.

## Sizing formulas

| Metric | Formula |
| --- | --- |
| `weight_memory_gib` | parameters x bytes per parameter x (1 + overhead) / 2^30 |
| `kv_cache_memory_gib` | active context x concurrency x KV bytes per token / 2^30 |
| `workload_memory_gib` | (weight memory + KV memory) x (1 + headroom) |
| `usable_memory_per_gpu_gib` | GPU memory x utilization ratio - runtime reserve |
| `memory_gpu_count` | ceil(workload memory / usable memory per GPU) |
| `required_output_tokens_per_second` | request rate x output tokens per request x (1 + headroom) |
| `throughput_gpu_count` | ceil(required output rate / declared output rate per GPU) |
| `recommended_gpu_count` | max(memory GPU count, throughput GPU count) |

Range arithmetic is conservative: lower and upper bounds are carried through every non-negative operation. The declared per-GPU throughput is an input with provenance, not a CT-AIComm performance claim.

## Cost formulas

The cost calculation includes instance, network egress, storage, support, other declared cost, discount, tax, and monthly token volume. `blended_cost_per_million_tokens` divides the total monthly cost by combined input and output tokens. It is not presented as separate input-token or output-token pricing because no allocation rule is supplied in v1.

Every result metric contains its formula identifier, canonical unit, complete input-path list, and any missing input paths. The normalized input and calculation result each receive a deterministic SHA-256 fingerprint.

## Reproducible sample

`examples/advisor/sizing-cost-fixed-input-v1.json` is explicitly synthetic. Its expected hashes and key values are frozen in `examples/advisor/sizing-cost-fixed-expected-v1.json`. Run:

```bash
node --test tests/advisor-sizing-cost.test.mjs
```

## Product boundaries

- All outputs are estimates, not quotes or capacity reservations.
- No result is a live inventory, benchmark, availability, or performance claim.
- No calculation authorizes deployment, purchase, routing, or execution.
- Unknown data remains unknown; only explicit `not_applicable` cost inputs become zero.
- Separate input/output token economics require an explicit, reviewable allocation method in a later version.
