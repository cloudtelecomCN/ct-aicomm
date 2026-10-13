import { createHash } from "node:crypto";

function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stableId(parts) {
  return `vllm-${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16)}`;
}

function validate(instance) {
  if (!instance.id || !instance.endpoint || !instance.metrics_endpoint || !instance.region || !instance.models?.length) {
    invalid("instance_incomplete", "id, endpoint, metrics_endpoint, region, and at least one model are required");
  }
  for (const field of ["endpoint", "metrics_endpoint"]) {
    const url = new URL(instance[field]);
    if (!new Set(["http:", "https:"]).has(url.protocol)) invalid("instance_protocol_invalid", `${field} must use http or https`);
  }
  return Object.freeze({ ...instance, models: Object.freeze([...new Set(instance.models)].sort()) });
}

export function discoverStatic(manifest) {
  if (manifest?.schema_version !== "1.0.0" || !Array.isArray(manifest.instances)) invalid("manifest_invalid", "static manifest v1 is required");
  const seen = new Set();
  return manifest.instances.map((raw) => {
    const instance = validate({
      id: raw.id,
      source: "static",
      endpoint: raw.endpoint,
      metrics_endpoint: raw.metrics_endpoint,
      region: raw.region,
      zone: raw.zone ?? null,
      models: raw.models,
      ready: raw.enabled !== false,
      discovered_at: manifest.generated_at ?? null,
      source_revision: manifest.revision ?? null
    });
    if (seen.has(instance.id)) invalid("instance_duplicate", `duplicate instance id: ${instance.id}`);
    seen.add(instance.id);
    return instance;
  });
}

export function discoverEndpointSlices(list, options = {}) {
  if (list?.kind !== "EndpointSliceList" || !Array.isArray(list.items)) invalid("endpointslice_list_invalid", "Kubernetes EndpointSliceList is required");
  const scheme = options.scheme ?? "http";
  const discoveredAt = options.discoveredAt ?? new Date().toISOString();
  const instances = [];

  for (const slice of list.items) {
    const labels = slice.metadata?.labels ?? {};
    if (labels["ct-aicomm.cloudtelecom.cn/discovery"] !== "vllm") continue;
    const annotations = slice.metadata?.annotations ?? {};
    const models = (annotations["ct-aicomm.cloudtelecom.cn/models"] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const region = annotations["ct-aicomm.cloudtelecom.cn/region"] ?? labels["topology.kubernetes.io/region"];
    const service = labels["kubernetes.io/service-name"] ?? "vllm";
    const namespace = slice.metadata?.namespace ?? "default";
    const httpPort = slice.ports?.find(({ name }) => name === "http")?.port;
    const metricsPort = slice.ports?.find(({ name }) => name === "metrics")?.port ?? httpPort;
    if (!httpPort || !metricsPort || !region || models.length === 0) invalid("endpointslice_metadata_incomplete", `EndpointSlice ${slice.metadata?.name ?? "unknown"} lacks ports, region, or models`);

    for (const endpoint of slice.endpoints ?? []) {
      if (endpoint.conditions?.ready !== true) continue;
      for (const address of endpoint.addresses ?? []) {
        const host = address.includes(":") ? `[${address}]` : address;
        const identity = endpoint.targetRef?.uid ?? `${namespace}/${service}/${address}`;
        instances.push(validate({
          id: stableId([namespace, service, identity, String(httpPort)]),
          source: "kubernetes-endpointslice",
          endpoint: `${scheme}://${host}:${httpPort}`,
          metrics_endpoint: `${scheme}://${host}:${metricsPort}/metrics`,
          region,
          zone: endpoint.zone ?? annotations["ct-aicomm.cloudtelecom.cn/zone"] ?? null,
          models,
          ready: true,
          discovered_at: discoveredAt,
          source_revision: slice.metadata?.resourceVersion ?? null
        }));
      }
    }
  }

  const ids = new Set();
  for (const instance of instances) {
    if (ids.has(instance.id)) invalid("instance_duplicate", `duplicate discovered instance id: ${instance.id}`);
    ids.add(instance.id);
  }
  return instances.sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeDiscoverySources(...sources) {
  const merged = new Map();
  for (const instances of sources) {
    for (const instance of instances) {
      const existing = merged.get(instance.id);
      if (existing && (existing.endpoint !== instance.endpoint || existing.metrics_endpoint !== instance.metrics_endpoint)) {
        invalid("instance_conflict", `instance ${instance.id} resolves to conflicting endpoints`);
      }
      merged.set(instance.id, instance);
    }
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}
