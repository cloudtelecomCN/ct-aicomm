# CT-Advisor 2.0 public product contract

[中文](product-contract-v2.zh-CN.md)

## Product category

CT-Advisor is an **AI infrastructure decision workspace**. It is one product with one account and workspace model.

## Free-access contract

Resource discovery, LLM sizing, public benchmarks, cost and TCO estimation, cross-GPU/cloud/region/network comparison, constraints and scenarios, Pareto and sensitivity analysis, standard recommendations, basic PDF/JSON/CSV exports, and every published task template are free to use.

`preview`, `beta`, and `stable` describe maturity. They do not change the free-access rule.

## Single paid-package boundary

The only capability that may require payment is:

```text
GPU Decision & Evidence Package
capability_key: gpu_preprocurement_decision_evidence_package
```

Comparing several GPUs, clouds, regions, or networks does not trigger payment. A commercial flow begins only when a user explicitly asks to convert a pre-procurement analysis into the formal package. Pricing, entitlement grants, customer records, and delivery operations are outside this public contract.

The initial package-eligible task is `ai-inference-infrastructure-selection/v1`. Every task template remains available for free self-service analysis.

## Responsibility boundary

CT-Advisor provides decision support. It does not guarantee an optimal result, certify compliance, provide legal advice, purchase infrastructure, deploy workloads, redirect traffic, or execute scheduling decisions.

## Normative files

- [JSON Schema](../../specs/advisor/advisor-product-contract-v2.schema.json)
- [Public contract example](../../examples/advisor/advisor-product-contract-v2.json)

Schema conformance confirms structure and frozen terminology only. It does not grant a paid entitlement or prove that a recommendation is correct.
