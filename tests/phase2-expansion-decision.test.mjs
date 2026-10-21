import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePhase2Decision } from "../packages/architecture/phase2-decision.mjs";

const decision = JSON.parse(await readFile(new URL("../evidence/architecture/ct-534-phase2-expansion-decision-20261021.json", import.meta.url), "utf8"));

test("selects scale testing and keeps every expansion behind evidence gates", () => {
  const result = validatePhase2Decision(decision);
  assert.match(result.decision_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.decision.selected, "scale_testing");
  assert.deepEqual(result.decision.ranking.map(({ option }) => option), ["scale_testing", "kubernetes", "multi_cloud", "xdp_dpdk"]);
});

test("does not allow XDP or DPDK to bypass the negative network-only gate", () => {
  const promoted = structuredClone(decision);
  promoted.ranking[3].disposition = "start";
  assert.throws(() => validatePhase2Decision(promoted), (error) => error.code === "phase2_network_evidence_ignored");
  const rewritten = structuredClone(decision);
  rewritten.evidence.find(({ task }) => task === "CT-524").finding = "execution passed";
  assert.throws(() => validatePhase2Decision(rewritten), (error) => error.code === "phase2_network_evidence_ignored");
});

test("rejects reordered or incomplete priorities", () => {
  const reordered = structuredClone(decision);
  [reordered.ranking[0], reordered.ranking[1]] = [reordered.ranking[1], reordered.ranking[0]];
  assert.throws(() => validatePhase2Decision(reordered), (error) => error.code === "phase2_ranking_invalid");
  const incomplete = structuredClone(decision);
  incomplete.ranking[1].exit_evidence = [];
  assert.throws(() => validatePhase2Decision(incomplete), (error) => error.code === "phase2_gates_incomplete");
});
