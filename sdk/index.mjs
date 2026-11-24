export const CT_AICOMM_OPEN_CONTRACT_VERSION = "0.2.0-open.1";

export const PUBLIC_COMPONENTS = Object.freeze([
  "evidence-schema",
  "agent-call-evidence-schema",
  "registry-contribution-schema",
  "connector-interface",
  "read-only-api-contract",
  "conformance-tools",
  "synthetic-examples"
]);

export const PROPRIETARY_COMPONENTS_NOT_INCLUDED = Object.freeze([
  "decision-and-scoring-core",
  "routing-and-execution-plane",
  "agent-control-runtime",
  "commercial-optimization",
  "tenant-and-deployment-runtime",
  "private-data-and-calibration"
]);

export function getPublicBoundary() {
  return Object.freeze({
    contract_version: CT_AICOMM_OPEN_CONTRACT_VERSION,
    public_components: [...PUBLIC_COMPONENTS],
    proprietary_components_not_included: [...PROPRIETARY_COMPONENTS_NOT_INCLUDED],
    claims: Object.freeze({
      performance_result: false,
      optimality: false,
      execution_authorization: false,
      certification: false
    })
  });
}
