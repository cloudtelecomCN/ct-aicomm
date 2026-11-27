# Enterprise adapter coverage plan

[中文](enterprise-adapter-coverage.zh-CN.md)

## Purpose and claims

This plan covers the organizations named in the CT-AIComm ecosystem target list. “Covered” means a defined integration path or evidence mapping target; it does **not** mean a vendor-certified connector, live API integration, customer deployment, or verified compatibility. No vendor credentials, proprietary APIs, customer topology, or production control logic belong in the public repository.

The public [vendor-neutral ingestion mapper](../adapters/vendor-ingestion/README.md) now supplies a strict read-only normalized snapshot contract and a profile entry for every target below. Profiles define accepted input formats and outstanding validation evidence. They do not implement vendor authentication or assert that a vendor emits those formats.

The first commercial integration boundary is read-only discovery and evidence ingestion. Resource provisioning, configuration writes, traffic changes, automatic rollback, billing actions, and compliance certification are out of scope for these adapters.

## Shared integration tracks

| Track | Common interface | Data to normalize | Current state |
| --- | --- | --- | --- |
| Agent and MCP runtimes | MCP call lifecycle plus OpenTelemetry GenAI spans | Tool/agent identity as declared, call ID, protocol/transport, timestamps, outcome, payload fingerprints, provenance | Public mapping bridges exist for Co-Sight, AgentScope 2.0 OTel, and Dify MCP; Eino and WeKnora have deployment-owned bridge contracts. These are not live vendor integrations. |
| GPU telemetry | Prometheus exposition; vendor exporter or approved metrics API | Accelerator model/ordinal, utilization, memory, temperature/power where exposed, timestamp, source/version | NVIDIA DCGM is a documented source path. Other accelerator exporters and metric semantics need vendor/version validation. |
| Network telemetry | OpenConfig/gNMI, NETCONF/RESTCONF, SNMP, or vendor telemetry export | Device/interface identity, link state, counters, queue/drop/error metrics, optics only when exposed, timestamps and units | Standard interface paths are defined; no named switch-vendor implementation has been verified. Read-only subscriptions/queries only. |
| Cloud resource and cost inventory | Provider OpenAPI/SDK with customer-owned read-only credentials | Regions/zones, instance/accelerator SKU, availability as declared, pricing/cost source, usage/monitoring samples | Provider-specific field maps require API/version, region, entitlement, and account fixtures. No credential collection or provisioning. |
| Cluster and scheduler | Kubernetes API and scheduler-specific read-only status/queue interfaces | Nodes, accelerator allocations, workload/queue state, placement and event references | Contract-level mapping only; validate each scheduler release and RBAC scope before claiming support. |
| Observability | Prometheus API and OTLP | Metric/span/log references and source provenance | Public evidence mapping exists; collector deployment and production data access remain customer-owned. |
| Integrator / operator OSS-BSS | Customer or product API, webhook, export, or MCP facade | Approved inventory, service status, SLA-period references, incident/change records | No common vendor-neutral API can be assumed; define per-project mappings after interface documentation and authorization. |

## Organization coverage matrix

| Organization(s) | Track | Adapter approach | Readiness / evidence required |
| --- | --- | --- | --- |
| ZTE | Network telemetry, cluster/network inventory | Prefer OpenConfig/gNMI or documented northbound telemetry/API; add a ZTE profile only after model/API and device firmware are supplied | Target only; no ZTE device or API validation yet |
| Huawei Enterprise BG / Ascend | Network telemetry and accelerator telemetry | OpenConfig/gNMI or Huawei-approved read-only northbound API; Ascend metrics through the vendor-supported exporter/API | Target only; confirm product family, software release, metric names/units, permissions, and test environment |
| Fiberhome | Transport/DCI telemetry | Standard telemetry or documented read-only NMS northbound API; map optical metrics only if the source exposes them | Target only; no OTN/DCI adapter verified |
| Ruijie Networks | Switch telemetry | OpenConfig/gNMI where supported, otherwise documented read-only API/SNMP export | Target only; model/firmware and supported telemetry paths needed |
| H3C / Unisplendour | Switch and cluster telemetry | OpenConfig/gNMI or documented read-only NMS/device API | Target only; model/firmware and data dictionary needed |
| Alibaba Cloud | Cloud GPU inventory, cost, and monitoring | Alibaba Cloud OpenAPI/SDK via a customer-operated read-only credential adapter | Planned provider-specific mapping; verify product APIs, regions, metric dimensions, and price source |
| Tencent Cloud | Cloud GPU inventory, cost, and monitoring | Tencent Cloud API/SDK via a customer-operated read-only credential adapter | Planned provider-specific mapping; official CVM monitoring documents GPU metrics, but CT-AIComm has not tested an account integration |
| ByteDance Volcano Engine | Cloud GPU inventory, cost, and monitoring | Volcano Engine OpenAPI/SDK through the cloud connector contract | Planned; API/version and permitted metric coverage must be supplied and verified |
| Baidu AI Cloud | BCC/GPU inventory and monitoring | BCC/BCM APIs and documented GPU/RDMA metric sources through the cloud connector contract | Candidate path documented; no CT-AIComm live account integration validated |
| China Telecom / TeleAI / Tianyi Cloud | Cloud, network, and operator OSS/BSS evidence | Combine the cloud-provider track with authorized OSS/BSS exports or APIs; avoid assuming one unified interface | Project-specific; need service/API owner, data dictionary, scope, and test tenant |
| China Unicom / Unicom Cloud / Yuanjing | Cloud, network, and agent platform | Cloud APIs plus documented MCP/OSS interfaces; map agent calls through the shared MCP evidence contract | Project-specific; product/version-specific API and authorized sandbox required |
| China Mobile / Mobile Cloud / research units | Cloud, DCI, and operator OSS/BSS evidence | Cloud APIs plus authorized NMS/OSS/BSS exports using the common telemetry contract | Project-specific; no vendor-specific compatibility claim |
| iSoftStone, Chinasoft International, Digital China, Topway | System-integrator delivery environments | Integrator-owned API/MCP/webhook/export profile on top of the shared connector contract | Partnership/integration target; no single product API can be assumed |
| Hengwei Technology, Yunshan Networks, DeepFlow ecosystem | Network observability | Prefer OTLP or Prometheus; use vendor API/export only when documented and authorized | Standard telemetry path; product-level exporters and schemas need verification |
| Dify | Agent/MCP calls | Public Dify MCP bridge; deployment must correlate the actual MCP tool-call ID | Bridge contract in PR; not a native plugin or live deployment certification |
| FastGPT | Agent/MCP calls | MCP or OpenTelemetry bridge if the deployed release exports the required lifecycle fields | Candidate; verify current event hooks and call-ID semantics before implementation |
| LobeHub commercial ecosystem | Agent/MCP calls | MCP/OTel bridge or customer-owned event exporter | Candidate; identify exact product/repository and version first |
| ODAP Gateway and comparable gateways | MCP gateway lifecycle | MCP protocol transcript or OTel bridge; include gateway identity and provenance only when explicitly observed | Shared MCP evidence contract; gateway-specific adapters require a pinned implementation and fixtures |
| Cambricon, Hygon, Moore Threads, Enflame | Accelerator telemetry | Vendor-supported exporter/SDK or customer-promoted Prometheus metrics; map with an explicit model/driver/firmware profile | Target only; metric semantics, units, version compatibility, and rights to redistribute mappings need validation |
| NVIDIA | GPU telemetry and cluster | DCGM Exporter / Prometheus; correlate with cluster workload metadata where authorized | Documented upstream path; CT-AIComm still needs pinned fixtures and a supported-version policy |
| AWS / Azure China ecosystems | Cloud inventory, cost, monitoring | Regional cloud APIs via provider-specific read-only profiles; honor account/region availability and data residency | Candidate; verify the exact China-region product/API and tenant access; no cross-region availability assumption |
| AXON Networks | Network telemetry/control-plane evidence | Standard gNMI/OpenConfig or documented read-only northbound API | Target only; identify exact product/API and supported release before adapter work |

## Delivery sequence

1. **Common contracts:** publish the vendor coverage matrix, field/unit rules, provenance requirements, and read-only boundary.
2. **Standards-first collectors:** implement and validate OTLP, Prometheus, OpenConfig/gNMI, and Kubernetes mappings against synthetic fixtures; do not ship network-write methods.
3. **Provider profiles:** add cloud and accelerator field maps one provider at a time after official API references and customer-authorized fixtures are available.
4. **Named-vendor validation:** test each profile against a pinned product/firmware/software release and document unsupported fields, permissions, and failure behavior.
5. **Commercial connectors:** keep credentials and proprietary orchestration in private deployments; publish only approved schema mappings and conformance fixtures.

## Acceptance gates per named adapter

- Exact product, version, region, device model, and API/exporter version recorded.
- Data-source owner grants least-privilege, read-only access; secrets remain outside Git and evidence artifacts.
- Every mapped metric has a documented unit, timestamp semantics, aggregation, and missing-value behavior.
- Raw payloads are minimized; fingerprints are not described as proof that source measurements are true.
- Synthetic fixtures pass before authorized live fixtures are considered; measured data remains clearly labeled.
- Unsupported fields, rate limits, stale data, and API errors produce explicit degraded/unavailable states.
- No adapter provisions resources, writes device configuration, changes traffic, runs rollback, charges accounts, or certifies compliance.

## Primary references

- [OpenConfig gNMI specification](https://github.com/openconfig/reference/blob/master/rpc/gnmi/gnmi-specification.md)
- [NVIDIA DCGM Exporter documentation](https://docs.nvidia.com/datacenter/dcgm/latest/reference/command-line-reference/dcgm-exporter.html)
- [Tencent Cloud CVM monitoring metrics](https://intl.cloud.tencent.com/document/product/248/6843)
- [Baidu Cloud GPU monitoring](https://cloud.baidu.com/doc/GPU/s/Tllgafkyy)
- [AgentScope tracing middleware](https://github.com/agentscope-ai/docs/blob/main/en/versions/2.0.8/building-blocks/middleware.mdx)
- [Dify MCP tool provider](https://github.com/langgenius/dify/blob/main/api/core/tools/mcp_tool/provider.py)
- [Tencent WeKnora MCP documentation](https://github.com/Tencent/WeKnora/blob/main/website-docs/03-features/08-mcp.md)

