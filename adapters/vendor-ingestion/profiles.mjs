const networkProtocols = ["gnmi-json-ietf", "prometheus", "vendor-normalized-json"];
const cloudProtocols = ["cloud-resource-normalized-json", "prometheus", "vendor-normalized-json"];
const acceleratorProtocols = ["prometheus", "vendor-normalized-json"];
const agentProtocols = ["agent-call-evidence-v1", "mcp", "otlp-json"];
const integrationProtocols = ["otlp-json", "prometheus", "vendor-normalized-json"];

function profile(id, organizations, track, acceptedInputs, readiness, nextEvidence) {
  return Object.freeze({
    id,
    organizations: Object.freeze(organizations),
    track,
    kind: track === "agent-runtime" || track === "mcp-gateway" ? "agent-runtime" : "infrastructure",
    accepted_inputs: Object.freeze(acceptedInputs),
    readiness,
    read_only: true,
    next_evidence: nextEvidence,
  });
}

/**
 * These profiles identify safe ingestion paths, not vendor product support.
 * `accepted_inputs` describes formats this mapper can consume; it does not
 * assert that a named vendor product emits or supports those formats.
 */
export const VENDOR_INGESTION_PROFILES = Object.freeze([
  profile("zte", ["ZTE"], "network", networkProtocols, "requires-vendor-fixture", "Model, firmware, supported telemetry/API, and authorized read-only fixture"),
  profile("huawei-ascend", ["Huawei Enterprise BG", "Ascend"], "network-accelerator", [...new Set([...networkProtocols, ...acceleratorProtocols])], "requires-vendor-fixture", "Product/firmware, exporter/API, metric dictionary, and authorized fixture"),
  profile("fiberhome", ["Fiberhome"], "transport-network", networkProtocols, "requires-vendor-fixture", "OTN/DCI product, NMS API or telemetry export, optical metric units, and fixture"),
  profile("ruijie", ["Ruijie Networks"], "network", networkProtocols, "requires-vendor-fixture", "Switch model, firmware, supported telemetry/API, and fixture"),
  profile("h3c", ["H3C", "Unisplendour"], "network-cluster", networkProtocols, "requires-vendor-fixture", "Device/NMS version, data dictionary, supported telemetry/API, and fixture"),
  profile("alibaba-cloud", ["Alibaba Cloud"], "cloud", cloudProtocols, "requires-cloud-fixture", "Product API/version, region, read-only role, metric dimensions, and synthetic/authorized fixture"),
  profile("tencent-cloud", ["Tencent Cloud"], "cloud", cloudProtocols, "requires-cloud-fixture", "Product API/version, region, read-only role, metric dimensions, and synthetic/authorized fixture"),
  profile("volcano-engine", ["Volcano Engine"], "cloud", cloudProtocols, "requires-cloud-fixture", "Product API/version, region, read-only role, metric dimensions, and synthetic/authorized fixture"),
  profile("baidu-ai-cloud", ["Baidu AI Cloud", "BCC", "BCM"], "cloud-accelerator", [...new Set([...cloudProtocols, ...acceleratorProtocols])], "requires-cloud-fixture", "BCC/BCM API version, region, read-only role, GPU/RDMA metrics, and fixture"),
  profile("china-telecom", ["China Telecom", "TeleAI", "Tianyi Cloud"], "operator-cloud-oss-bss", [...new Set([...cloudProtocols, ...networkProtocols, ...integrationProtocols])], "requires-project-interface", "Named OSS/BSS/cloud API owner, interface contract, test tenant, and data authorization"),
  profile("china-unicom", ["China Unicom", "Unicom Cloud", "Yuanjing"], "operator-cloud-agent", [...new Set([...cloudProtocols, ...networkProtocols, ...integrationProtocols, ...agentProtocols])], "requires-project-interface", "Named product/version, cloud/OSS/MCP interface, test tenant, and authorization"),
  profile("china-mobile", ["China Mobile", "Mobile Cloud"], "operator-cloud-oss-bss", [...new Set([...cloudProtocols, ...networkProtocols, ...integrationProtocols])], "requires-project-interface", "Named OSS/BSS/NMS/cloud API owner, test environment, and data authorization"),
  profile("isoftstone", ["iSoftStone"], "system-integrator", integrationProtocols, "requires-project-interface", "Customer-authorized delivery API/export contract and synthetic fixture"),
  profile("chinasoft-international", ["Chinasoft International"], "system-integrator", integrationProtocols, "requires-project-interface", "Customer-authorized delivery API/export contract and synthetic fixture"),
  profile("digital-china", ["Digital China"], "system-integrator", integrationProtocols, "requires-project-interface", "Customer-authorized delivery API/export contract and synthetic fixture"),
  profile("topway", ["Topway Information"], "system-integrator", integrationProtocols, "requires-project-interface", "Customer-authorized delivery API/export contract and synthetic fixture"),
  profile("hengwei", ["Hengwei Technology"], "network-observability", integrationProtocols, "requires-vendor-fixture", "Product/version, supported OTLP/Prometheus/API export, and metric dictionary"),
  profile("yunshan", ["Yunshan Networks"], "network-observability", integrationProtocols, "requires-vendor-fixture", "Product/version, supported OTLP/Prometheus/API export, and metric dictionary"),
  profile("deepflow", ["DeepFlow ecosystem"], "network-observability", integrationProtocols, "standards-mappable", "Pinned exporter/API version and synthetic fixture; validate labels and metric units"),
  profile("dify", ["Dify"], "agent-runtime", agentProtocols, "bridge-in-pr", "Correlated MCP tool-call ID and pinned Dify/MCP deployment event"),
  profile("fastgpt", ["FastGPT"], "agent-runtime", agentProtocols, "requires-runtime-fixture", "Pinned runtime version, lifecycle fields, call-ID semantics, and synthetic trace"),
  profile("lobehub", ["LobeHub ecosystem"], "agent-runtime", agentProtocols, "requires-product-identification", "Exact commercial product/repository, pinned release, and authorized event fixture"),
  profile("odap-gateway", ["ODAP Gateway and comparable gateways"], "mcp-gateway", agentProtocols, "contract-mappable", "Pinned gateway build, MCP call transcript/OTel fixture, and provenance fields"),
  profile("cambricon", ["Cambricon"], "accelerator", acceleratorProtocols, "requires-vendor-fixture", "MLU model, driver/runtime, exporter/API, metric dictionary, and authorized fixture"),
  profile("hygon", ["Hygon"], "accelerator", acceleratorProtocols, "requires-vendor-fixture", "Accelerator model, driver/runtime, exporter/API, metric dictionary, and authorized fixture"),
  profile("moore-threads", ["Moore Threads"], "accelerator", acceleratorProtocols, "requires-vendor-fixture", "GPU model, driver/runtime, exporter/API, metric dictionary, and authorized fixture"),
  profile("enflame", ["Enflame"], "accelerator", acceleratorProtocols, "requires-vendor-fixture", "Accelerator model, driver/runtime, exporter/API, metric dictionary, and authorized fixture"),
  profile("nvidia", ["NVIDIA"], "accelerator", acceleratorProtocols, "standards-mappable", "Pinned DCGM Exporter/DCGM versions and synthetic Prometheus fixture; live hardware still required for compatibility claims"),
  profile("aws-china", ["AWS China ecosystem"], "cloud", cloudProtocols, "requires-cloud-fixture", "Exact China-region product/API, account permissions, SKU/price dimensions, and fixture"),
  profile("azure-china", ["Azure China ecosystem"], "cloud", cloudProtocols, "requires-cloud-fixture", "Exact China-region product/API, account permissions, SKU/price dimensions, and fixture"),
  profile("axon-networks", ["AXON Networks"], "network", networkProtocols, "requires-product-identification", "Exact product/API, supported release, telemetry fields, and authorized fixture"),
  profile("agentscope", ["AgentScope 2.0"], "agent-runtime", agentProtocols, "bridge-in-pr", "Pinned runtime and OTel/MCP span fixture with required bridge attributes"),
  profile("eino", ["CloudWeGo Eino"], "agent-runtime", agentProtocols, "bridge-contract-in-pr", "Pinned Eino/MCP client build and deployment-owned callback fixture"),
  profile("weknora", ["Tencent WeKnora"], "agent-runtime", agentProtocols, "bridge-contract-in-pr", "Pinned WeKnora build and approved MCP/OTel exporter fixture"),
  profile("qwen-agent", ["Qwen-Agent"], "agent-runtime", agentProtocols, "deferred", "Stable versioned lifecycle/export contract before a reusable adapter is added"),
]);

const profileIndex = new Map(VENDOR_INGESTION_PROFILES.map((item) => [item.id, item]));

export function getVendorIngestionProfile(profileId) {
  if (typeof profileId !== "string" || !profileIndex.has(profileId)) throw new TypeError(`unknown vendor ingestion profile: ${profileId}`);
  return profileIndex.get(profileId);
}

