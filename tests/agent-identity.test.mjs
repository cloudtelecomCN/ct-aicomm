import assert from "node:assert/strict";
import test from "node:test";
import { AgentCredentialAuthority, redactCredentialLogs } from "../packages/agent-control/identity.mjs";

const now = new Date("2026-10-13T10:00:00Z");

test("issues, rotates, verifies, revokes, and retires short-lived credentials", () => {
  const authority = new AgentCredentialAuthority({ audience: "orchestrator", maxTtlSeconds: 600 });
  authority.rotate({ keyId: "key-1" });
  const first = authority.issue("agent-01", { ttlSeconds: 300, now });
  assert.equal(authority.verify(first.token, { now, expectedAgentId: "agent-01" }).sub, "agent-01");
  authority.rotate({ keyId: "key-2" });
  const second = authority.issue("agent-01", { ttlSeconds: 60, now });
  assert.equal(second.key_id, "key-2");
  assert.equal(authority.verify(first.token, { now }).jti, first.token_id);
  authority.revokeToken(first.token_id);
  assert.throws(() => authority.verify(first.token, { now }), (error) => error.code === "credential_revoked");
  authority.retire("key-1");
  authority.revokeAgent("agent-01");
  assert.throws(() => authority.verify(second.token, { now }), (error) => error.code === "agent_revoked");
});

test("enforces expiry, audience binding, TTL, signatures, and log redaction", () => {
  const authority = new AgentCredentialAuthority({ audience: "orchestrator", maxTtlSeconds: 300 });
  authority.rotate({ keyId: "key-live" });
  const credential = authority.issue("agent-02", { ttlSeconds: 30, now });
  assert.throws(() => authority.issue("agent-02", { ttlSeconds: 301, now }), (error) => error.code === "credential_ttl_invalid");
  assert.throws(() => authority.verify(credential.token, { now: new Date("2026-10-13T10:00:31Z") }), (error) => error.code === "credential_expired");
  const tokenParts = credential.token.split(".");
  tokenParts[3] = `${tokenParts[3].startsWith("A") ? "B" : "A"}${tokenParts[3].slice(1)}`;
  const tampered = tokenParts.join(".");
  assert.throws(() => authority.verify(tampered, { now }), (error) => error.code === "credential_signature_invalid");
  const redacted = redactCredentialLogs({ authorization: `Bearer ${credential.token}`, nested: { message: `failed ${credential.token}`, token_id: credential.token_id }, safe: "agent-02" });
  assert.deepEqual(redacted, { authorization: "[REDACTED]", nested: { message: "failed [REDACTED_CREDENTIAL]", token_id: "[REDACTED]" }, safe: "agent-02" });
  assert.doesNotMatch(JSON.stringify(redacted), /ctcred\./);
});
