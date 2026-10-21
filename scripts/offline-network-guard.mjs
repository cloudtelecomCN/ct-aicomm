import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

const DENIED_CODE = "CT_CONTRIBUTOR_NETWORK_DENIED";

function normalizeHost(host) {
  const value = String(host ?? "localhost").trim().toLowerCase();
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    return closingBracket >= 0 ? value.slice(1, closingBracket) : value;
  }
  return /^[^:]+:\d+$/.test(value) ? value.replace(/:\d+$/, "") : value;
}

function isLoopbackHost(host) {
  const normalized = normalizeHost(host);
  return normalized === "localhost"
    || normalized === "::1"
    || normalized.startsWith("127.");
}

function deny(target) {
  const error = new Error(`Contributor tests deny non-loopback network access: ${target}`);
  error.code = DENIED_CODE;
  throw error;
}

function assertLoopbackHost(host) {
  if (!isLoopbackHost(host)) {
    deny(host);
  }
}

function assertUrlTarget(input, fallbackProtocol = "http:") {
  const value = input?.url ?? input;
  if (value instanceof URL) {
    assertLoopbackHost(value.hostname);
    return;
  }
  if (typeof value === "string") {
    const url = new URL(value, `${fallbackProtocol}//localhost`);
    assertLoopbackHost(url.hostname);
    return;
  }
  if (value && typeof value === "object") {
    assertLoopbackHost(value.hostname ?? value.host ?? "localhost");
  }
}

function netTarget(args) {
  const first = args[0];
  if (typeof first === "number") {
    return typeof args[1] === "string" ? args[1] : "localhost";
  }
  if (typeof first === "string") {
    return null;
  }
  if (first && typeof first === "object") {
    if (first.path) {
      return null;
    }
    return first.host ?? "localhost";
  }
  return "localhost";
}

function installGuard() {
  const originalFetch = globalThis.fetch;
  if (originalFetch) {
    globalThis.fetch = function guardedFetch(input, init) {
      assertUrlTarget(input, "http:");
      return originalFetch.call(this, input, init);
    };
  }

  for (const [module, protocol] of [[http, "http:"], [https, "https:"]]) {
    for (const method of ["request", "get"]) {
      const original = module[method];
      module[method] = function guardedRequest(...args) {
        assertUrlTarget(args[0], protocol);
        return original.apply(this, args);
      };
    }
  }

  for (const method of ["connect", "createConnection"]) {
    const original = net[method];
    net[method] = function guardedConnection(...args) {
      const host = netTarget(args);
      if (host !== null) {
        assertLoopbackHost(host);
      }
      return original.apply(this, args);
    };
  }

  const originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedSocketConnect(...args) {
    const host = netTarget(args);
    if (host !== null) {
      assertLoopbackHost(host);
    }
    return originalSocketConnect.apply(this, args);
  };

  const originalTlsConnect = tls.connect;
  tls.connect = function guardedTlsConnect(...args) {
    const host = netTarget(args);
    if (host !== null) {
      assertLoopbackHost(host);
    }
    return originalTlsConnect.apply(this, args);
  };

  for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
    if (typeof dns[method] !== "function") {
      continue;
    }
    const original = dns[method];
    dns[method] = function guardedDns(host, ...args) {
      assertLoopbackHost(host);
      return original.call(this, host, ...args);
    };
  }

  if (dns.promises) {
    for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
      if (typeof dns.promises[method] !== "function") {
        continue;
      }
      const original = dns.promises[method];
      dns.promises[method] = function guardedDnsPromise(host, ...args) {
        assertLoopbackHost(host);
        return original.call(this, host, ...args);
      };
    }
  }

  syncBuiltinESMExports();
}

if (process.env.CT_CONTRIBUTOR_OFFLINE === "1") {
  installGuard();
}

export { DENIED_CODE, isLoopbackHost };
