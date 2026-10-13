import { generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function encode(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    fail("credential_malformed", "credential encoding is invalid");
  }
}

function validId(value, field) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value ?? "")) fail(`${field}_invalid`, `${field} is invalid`);
  return value;
}

export class AgentCredentialAuthority {
  #audience;
  #maxTtlSeconds;
  #keys = new Map();
  #activeKeyId = null;
  #revokedTokens = new Set();
  #revokedAgents = new Set();

  constructor({ audience, maxTtlSeconds = 900 }) {
    this.#audience = validId(audience, "audience");
    if (!Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 30 || maxTtlSeconds > 3600) fail("max_ttl_invalid", "maximum TTL must be between 30 and 3600 seconds");
    this.#maxTtlSeconds = maxTtlSeconds;
  }

  rotate({ keyId = `key-${randomUUID()}` } = {}) {
    validId(keyId, "key_id");
    if (this.#keys.has(keyId)) fail("key_id_duplicate", "key id already exists");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    this.#keys.set(keyId, { privateKey, publicKey });
    this.#activeKeyId = keyId;
    return Object.freeze({ key_id: keyId, public_jwk: Object.freeze(publicKey.export({ format: "jwk" })) });
  }

  retire(keyId) {
    if (keyId === this.#activeKeyId) fail("active_key_retire_forbidden", "rotate before retiring the active key");
    if (!this.#keys.delete(keyId)) fail("key_unknown", "key id is unknown");
  }

  issue(agentId, { ttlSeconds = 300, now = new Date() } = {}) {
    validId(agentId, "agent_id");
    if (!this.#activeKeyId) fail("signing_key_unavailable", "rotate a signing key before issuing credentials");
    if (this.#revokedAgents.has(agentId)) fail("agent_revoked", "agent identity is revoked");
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > this.#maxTtlSeconds) fail("credential_ttl_invalid", "credential TTL exceeds policy");
    const issuedAt = Math.floor(now.getTime() / 1000);
    if (!Number.isFinite(issuedAt)) fail("credential_time_invalid", "issue time is invalid");
    const tokenId = randomUUID();
    const header = { alg: "EdDSA", typ: "CT-Agent-Credential", kid: this.#activeKeyId };
    const claims = { iss: "ct-aicomm-control", sub: agentId, aud: this.#audience, iat: issuedAt, exp: issuedAt + ttlSeconds, jti: tokenId };
    const signingInput = `${encode(header)}.${encode(claims)}`;
    const signature = sign(null, Buffer.from(signingInput), this.#keys.get(this.#activeKeyId).privateKey).toString("base64url");
    return Object.freeze({ token: `ctcred.${signingInput}.${signature}`, token_id: tokenId, key_id: this.#activeKeyId, expires_at: new Date(claims.exp * 1000).toISOString() });
  }

  verify(token, { now = new Date(), expectedAgentId = null } = {}) {
    const parts = String(token).split(".");
    if (parts.length !== 4 || parts[0] !== "ctcred") fail("credential_malformed", "credential format is invalid");
    const header = decode(parts[1]);
    const claims = decode(parts[2]);
    if (header.alg !== "EdDSA" || header.typ !== "CT-Agent-Credential") fail("credential_header_invalid", "credential header is invalid");
    const key = this.#keys.get(header.kid);
    if (!key) fail("credential_key_unknown", "credential signing key is unavailable");
    if (!verify(null, Buffer.from(`${parts[1]}.${parts[2]}`), key.publicKey, Buffer.from(parts[3], "base64url"))) fail("credential_signature_invalid", "credential signature is invalid");
    const current = Math.floor(now.getTime() / 1000);
    if (claims.aud !== this.#audience) fail("credential_audience_invalid", "credential audience is invalid");
    if (claims.iat > current + 30) fail("credential_from_future", "credential issue time is in the future");
    if (claims.exp <= current) fail("credential_expired", "credential has expired");
    if (this.#revokedTokens.has(claims.jti)) fail("credential_revoked", "credential is revoked");
    if (this.#revokedAgents.has(claims.sub)) fail("agent_revoked", "agent identity is revoked");
    if (expectedAgentId !== null && claims.sub !== expectedAgentId) fail("credential_agent_mismatch", "credential belongs to another agent");
    return Object.freeze(structuredClone(claims));
  }

  revokeToken(tokenId) {
    this.#revokedTokens.add(validId(tokenId, "token_id"));
  }

  revokeAgent(agentId) {
    this.#revokedAgents.add(validId(agentId, "agent_id"));
  }
}

const SENSITIVE_KEY = /(^|_)(authorization|credential|password|private_key|secret|token)($|_)/i;
const CREDENTIAL_PATTERN = /ctcred\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function redactCredentialLogs(value) {
  if (typeof value === "string") return value.replace(CREDENTIAL_PATTERN, "[REDACTED_CREDENTIAL]");
  if (Array.isArray(value)) return value.map(redactCredentialLogs);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactCredentialLogs(entry)]));
  }
  return value;
}
