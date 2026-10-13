# CT-DataPlane Agent threat model v1

## Trust boundary

The Agent runs on an inference host or an explicitly managed gateway. The control plane, artifact registry, telemetry sink, Linux kernel, and local operator are separate trust domains. A recommendation is not authorization; only a signed, revisioned, allowlisted policy that passes the later prepare/apply protocol may change a route.

## Privilege boundary

The service does not run as root and cannot elevate privileges. The initial Linux capability ceiling is `CAP_BPF`, `CAP_NET_ADMIN`, and `CAP_PERFMON`. `CAP_SYS_ADMIN`, module loading, process tracing, and discretionary-access-control bypass are forbidden. Deployments require seccomp and SELinux or AppArmor confinement plus a read-only root filesystem.

If a target kernel cannot support this boundary, the Agent remains in observe-only mode. Broadening privileges requires a new threat-model revision and security review; installation must not silently fall back to root or `CAP_SYS_ADMIN`.

## Supply chain and configuration

Agent artifacts require SHA-256 digests, signatures, SBOMs, and build provenance. Unsigned or mismatched artifacts fail startup. Configuration may come only from a root-owned bootstrap file or a mutually authenticated control plane. Revisions are monotonic, rollback targets must have been applied previously, and unknown sources are rejected.

## Data and network boundary

Payload, prompt, generated token, and credential capture are prohibited. Telemetry is restricted to approved identifiers and measurements, with mandatory redaction. Egress is deny-by-default and limited to the control plane, telemetry sink, and declared health probes. The Agent exposes no public listener.

## Failure invariant

On identity failure, stale policy, invalid destination, expired lease, control-plane partition, failed update, or local kill switch, the Agent preserves or restores the last known good route and emits an audit event. It must never invent a route or continue an unconfirmed transition.

The machine-readable boundary and threat register are in [`../../specs/agent/security-boundary-v1.json`](../../specs/agent/security-boundary-v1.json).
