const TERMINAL = new Set(["completed", "failed"]);
const EVENT_ORDER = Object.freeze({ request_started: 0, response_headers: 1, first_token: 2, completed: 3, failed: 3 });

function reject(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export class RequestCorrelationLedger {
  #records = new Map();

  append(event) {
    if (!event?.request_id || !event?.trace_id || !event?.inference_instance) reject("correlation_fields_missing", "request_id, trace_id, and inference_instance are required");
    if (!(event.type in EVENT_ORDER)) reject("event_type_invalid", `unsupported event type: ${event.type}`);
    if (!Number.isFinite(event.monotonic_ms) || event.monotonic_ms < 0) reject("event_time_invalid", "monotonic_ms must be non-negative");

    const existing = this.#records.get(event.request_id);
    if (!existing) {
      if (event.type !== "request_started") reject("start_event_missing", "first event must be request_started");
      const record = {
        request_id: event.request_id,
        trace_id: event.trace_id,
        inference_instance: event.inference_instance,
        events: [structuredClone(event)]
      };
      this.#records.set(event.request_id, record);
      return structuredClone(record);
    }

    if (existing.trace_id !== event.trace_id || existing.inference_instance !== event.inference_instance) reject("correlation_mismatch", "trace or inference instance changed during a request");
    const previous = existing.events.at(-1);
    if (TERMINAL.has(previous.type)) reject("event_after_terminal", "events cannot follow a terminal event");
    if (event.monotonic_ms < previous.monotonic_ms) reject("event_time_regression", "event time cannot move backwards");
    if (EVENT_ORDER[event.type] < EVENT_ORDER[previous.type]) reject("event_order_invalid", `${event.type} cannot follow ${previous.type}`);
    if (existing.events.some(({ type }) => type === event.type) && event.type !== "response_headers") reject("duplicate_event", `${event.type} may occur only once`);

    existing.events.push(structuredClone(event));
    return structuredClone(existing);
  }

  get(requestId) {
    const record = this.#records.get(requestId);
    return record ? structuredClone(record) : null;
  }

  finalize(requestId) {
    const record = this.#records.get(requestId);
    if (!record) reject("request_unknown", "request has no correlation record");
    const terminal = record.events.at(-1);
    if (!TERMINAL.has(terminal.type)) reject("request_not_terminal", "request has no terminal event");
    return {
      ...structuredClone(record),
      success: terminal.type === "completed",
      failure_code: terminal.type === "failed" ? terminal.failure_code : null,
      first_token_monotonic_ms: record.events.find(({ type }) => type === "first_token")?.monotonic_ms ?? null
    };
  }
}
