function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validateSelectorPolicy(policy) {
  if (policy?.schema_version !== "1.0.0") fail("selector_schema_invalid", "selector policy v1 is required");
  if (!Array.isArray(policy.cgroup_ids) || policy.cgroup_ids.length === 0) fail("cgroup_allowlist_empty", "at least one cgroup id is required");
  if (!Array.isArray(policy.destination_ports) || policy.destination_ports.length === 0) fail("port_allowlist_empty", "at least one destination port is required");

  const cgroupIds = policy.cgroup_ids.map((value) => {
    const id = typeof value === "bigint" ? value : BigInt(value);
    if (id <= 0n || id > 0xffffffffffffffffn) fail("cgroup_id_invalid", `invalid cgroup id: ${value}`);
    return id;
  });
  const ports = policy.destination_ports.map((value) => {
    if (!Number.isInteger(value) || value < 1 || value > 65535) fail("destination_port_invalid", `invalid destination port: ${value}`);
    return value;
  });
  if (new Set(cgroupIds.map(String)).size !== cgroupIds.length) fail("cgroup_duplicate", "duplicate cgroup id");
  if (new Set(ports).size !== ports.length) fail("destination_port_duplicate", "duplicate destination port");

  return Object.freeze({
    schema_version: "1.0.0",
    cgroup_ids: Object.freeze(cgroupIds.sort((a, b) => (a < b ? -1 : 1))),
    destination_ports: Object.freeze(ports.sort((a, b) => a - b)),
    action: "identify_only",
    default_effect: "pass_unmodified"
  });
}

export function selectorMapEntries(policy) {
  const validated = validateSelectorPolicy(policy);
  return Object.freeze({
    allowed_cgroups: Object.freeze(validated.cgroup_ids.map((key) => Object.freeze({ key, value: 1 }))),
    allowed_destination_ports: Object.freeze(validated.destination_ports.map((key) => Object.freeze({ key, value: 1 })))
  });
}
