import { fingerprint } from "./protocol.mjs";

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

export class AgentKillSwitch {
  #rollbackStack;
  #stopAutomation;
  #active = false;
  #event = null;

  constructor({ rollbackStack, stopAutomation }) {
    if (!rollbackStack || typeof rollbackStack.rollback !== "function" || typeof rollbackStack.snapshot !== "function") fail("kill_switch_rollback_stack_required", "rollback stack is required");
    if (typeof stopAutomation !== "function") fail("kill_switch_stop_callback_required", "stopAutomation callback is required");
    this.#rollbackStack = rollbackStack;
    this.#stopAutomation = stopAutomation;
  }

  activate({ source, actor, reason, occurredAt = new Date() }) {
    if (this.#active) return Object.freeze({ activated: false, event: this.#event });
    if (!["local", "control_plane"].includes(source)) fail("kill_switch_source_invalid", "source must be local or control_plane");
    if (!/^[A-Za-z0-9._:@-]{1,128}$/.test(actor ?? "")) fail("kill_switch_actor_invalid", "actor is invalid");
    if (typeof reason !== "string" || reason.trim().length < 3) fail("kill_switch_reason_invalid", "reason is required");
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) fail("kill_switch_time_invalid", "activation time is invalid");

    this.#active = true;
    this.#stopAutomation();
    const rollbacks = [];
    try {
      while (this.#rollbackStack.snapshot().depth > 1) {
        const activeRevision = this.#rollbackStack.snapshot().active.policy_revision;
        rollbacks.push(this.#rollbackStack.rollback({ expectedActiveRevision: activeRevision, reason: `kill_switch:${reason}`, occurredAt }));
      }
    } catch (cause) {
      const failed = {
        event_type: "kill_switch_restore_failed",
        source,
        actor,
        reason,
        occurred_at: occurredAt.toISOString(),
        completed_rollbacks: rollbacks,
        failure_code: cause.code ?? "restore_failed"
      };
      this.#event = Object.freeze({ ...failed, event_fingerprint: fingerprint(failed) });
      fail("kill_switch_restore_failed", "Kill Switch is active but baseline restoration failed", this.#event);
    }

    const restored = this.#rollbackStack.snapshot().active;
    const event = {
      event_type: "kill_switch_activated",
      source,
      actor,
      reason,
      occurred_at: occurredAt.toISOString(),
      baseline_revision: restored?.policy_revision ?? null,
      baseline_state_fingerprint: restored?.state_fingerprint ?? null,
      rollbacks
    };
    this.#event = Object.freeze({ ...event, event_fingerprint: fingerprint(event) });
    return Object.freeze({ activated: true, event: this.#event });
  }

  assertExecutionAllowed() {
    if (this.#active) fail("kill_switch_active", "automatic execution is disabled by the Kill Switch", this.#event);
  }

  snapshot() {
    return Object.freeze({ active: this.#active, event: this.#event });
  }
}
