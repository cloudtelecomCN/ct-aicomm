import { fingerprint } from "../agent-control/protocol.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validatePhase2Decision(input) {
  if (input?.schema_version !== "1.0.0" || input.task !== "CT-534") fail("phase2_schema_invalid", "CT-534 decision v1 is required");
  const ranking = input.ranking ?? [];
  const expected = ["scale_testing", "kubernetes", "multi_cloud", "xdp_dpdk"];
  if (ranking.length !== 4 || ranking.some((item, index) => item.priority !== index + 1 || item.option !== expected[index])) fail("phase2_ranking_invalid", "all four options must appear in evidence order");
  if (input.selected !== "scale_testing" || ranking[0].disposition !== "start") fail("phase2_selection_invalid", "scale testing must be the selected immediate expansion");
  const networkEvidence = input.evidence?.find(({ task }) => task === "CT-524");
  const xdp = ranking.find(({ option }) => option === "xdp_dpdk");
  if (!networkEvidence?.finding.includes("not statistically supported") || xdp?.disposition !== "hold") fail("phase2_network_evidence_ignored", "XDP/DPDK must remain on hold while network-only benefit is unsupported");
  if (ranking.some(({ rationale, entry_gate: entry, exit_evidence: exit }) => rationale.length < 10 || !entry?.length || !exit?.length)) fail("phase2_gates_incomplete", "every option requires rationale, entry gates, and exit evidence");
  return Object.freeze({ decision: Object.freeze(structuredClone(input)), decision_fingerprint: fingerprint(input) });
}
