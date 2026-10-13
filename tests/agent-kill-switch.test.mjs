import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../packages/agent-control/protocol.mjs";
import { AgentKillSwitch } from "../packages/agent-control/kill-switch.mjs";
import { RollbackStack } from "../packages/agent-control/rollback-stack.mjs";

function confirmed(revision) {
  const routeState = { target: `inference-${revision}`, policy_revision: revision };
  return { policy_id: "policy-east", policy_revision: revision, policy_fingerprint: fingerprint({ revision }), route_state: routeState, state_fingerprint: fingerprint(routeState), receipt_id: `receipt-${revision}`, receipt_status: "applied" };
}
function fixture() {
  const restored = [];
  const stack = new RollbackStack({ execute: (state) => { restored.push(state); return { restored: true }; } });
  stack.confirmApplied(confirmed(7));
  stack.confirmApplied(confirmed(8));
  stack.confirmApplied(confirmed(9));
  let stops = 0;
  const killSwitch = new AgentKillSwitch({ rollbackStack: stack, stopAutomation: () => { stops += 1; } });
  return { killSwitch, stack, restored, get stops() { return stops; } };
}

test("local activation stops execution and restores the confirmed baseline", () => {
  const state = fixture();
  const result = state.killSwitch.activate({ source: "local", actor: "root@edge-01", reason: "operator emergency stop", occurredAt: new Date("2026-10-13T13:00:00Z") });
  assert.equal(result.activated, true);
  assert.equal(result.event.baseline_revision, 7);
  assert.equal(result.event.rollbacks.length, 2);
  assert.equal(state.stops, 1);
  assert.deepEqual(state.restored, [confirmed(8).route_state, confirmed(7).route_state]);
  assert.throws(() => state.killSwitch.assertExecutionAllowed(), (error) => error.code === "kill_switch_active");
  assert.equal(state.killSwitch.activate({ source: "local", actor: "root@edge-01", reason: "duplicate" }).activated, false);
  assert.equal(state.stops, 1);
});

test("control-plane activation is supported and restoration failure remains fail-closed", () => {
  const controlled = fixture();
  const result = controlled.killSwitch.activate({ source: "control_plane", actor: "orchestrator-prod", reason: "fleet emergency stop" });
  assert.equal(result.event.source, "control_plane");
  const failingStack = { snapshot: () => ({ depth: 2, active: { policy_revision: 9 } }), rollback: () => { const error = new Error("write failed"); error.code = "map_write_failed"; throw error; } };
  const failing = new AgentKillSwitch({ rollbackStack: failingStack, stopAutomation: () => {} });
  assert.throws(() => failing.activate({ source: "local", actor: "root@edge-02", reason: "emergency" }), (error) => error.code === "kill_switch_restore_failed" && error.details.failure_code === "map_write_failed");
  assert.throws(() => failing.assertExecutionAllowed(), (error) => error.code === "kill_switch_active");
});
