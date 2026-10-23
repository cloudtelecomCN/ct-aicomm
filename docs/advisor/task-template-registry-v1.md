# CT-Advisor task template registry v1

[中文](task-template-registry-v1.zh-CN.md)

## Purpose

The registry gives every CT-Advisor task a stable key, semantic version, maturity, enablement state, free-access declaration, and synthetic contract fixture. It is the public source of terminology; private services enforce tenant, workspace, and operational controls.

## Identity and versioning

- Template ID: `<template-key>/v<major>`
- Template version: full Semantic Versioning, such as `1.0.0`
- A breaking input or output meaning requires a new major template ID.
- Minor and patch changes must preserve the major contract.

## Maturity

- `preview`: evaluable, but fields or coverage may change.
- `beta`: the primary workflow is usable within explicit support limits.
- `stable`: the contract and baseline behavior are stable; outcomes are still not guaranteed.

Maturity does not change access. Every published template remains free.

## Enablement

`default_enabled` records the published default. `enabled` and `state_reason` describe a registry snapshot. A disabled template remains discoverable so existing projects can explain why a new run is unavailable. Unknown template IDs and unknown operator overrides must fail closed.

Disablement never creates a paywall and does not authorize deletion of existing project data.

## Fixtures and responsibility boundary

Every template binds one synthetic fixture. Fixtures verify identity, maturity, enablement, and `execution_authorized=false`; they are not performance results. All templates use `decision_support_only` and cannot purchase resources, deploy workloads, redirect traffic, or execute scheduling decisions.

## Normative files

- [Registry Schema](../../specs/advisor/task-template-registry-v1.schema.json)
- [Fixture Schema](../../specs/advisor/task-template-fixtures-v1.schema.json)
- [Registry example](../../examples/advisor/task-template-registry-v1.json)
- [Synthetic fixtures](../../examples/advisor/task-template-fixtures-v1.json)
