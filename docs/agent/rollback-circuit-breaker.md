# Rollback circuit breaker

CT-513 evaluates a bounded window of measured request outcomes plus consecutive health failures. Timeout rate, error rate, and health-failure thresholds are configured independently. Rate thresholds require a minimum sample count; the health threshold can react earlier to a clearly failed target.

When any threshold is reached, the breaker invokes CT-512 with the expected active revision. That operation can restore only the immediately previous confirmed route state. The breaker then latches open and returns the same trip evidence on later observations, preventing repeated rollback and route flapping.

The trip event records measured rates, sample count, health-failure count, reason, timestamp, complete rollback evidence, and a deterministic fingerprint. Reset and controlled re-entry remain an explicit operator or higher-level orchestration action; the breaker never resumes execution on its own.
