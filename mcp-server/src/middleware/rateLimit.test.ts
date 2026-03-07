import test from "node:test";
import assert from "node:assert/strict";

import { resolveClientIpWithPolicy } from "./rateLimit.js";

test("resolveClientIpWithPolicy uses socket IP when proxy trust is disabled", () => {
  const req = {
    headers: {
      "x-forwarded-for": "198.51.100.12, 203.0.113.9",
      "x-real-ip": "198.51.100.99",
    },
    socket: { remoteAddress: "10.0.0.5" },
  };

  const resolved = resolveClientIpWithPolicy(req, { trustProxy: false, trustedProxyHops: 1 });
  assert.equal(resolved.ip, "10.0.0.5");
  assert.equal(resolved.source, "socket");
});

test("resolveClientIpWithPolicy uses forwarded chain only when trusted", () => {
  const req = {
    headers: {
      "x-forwarded-for": "198.51.100.12, 203.0.113.9",
    },
    socket: { remoteAddress: "10.0.0.5" },
  };

  const resolved = resolveClientIpWithPolicy(req, { trustProxy: true, trustedProxyHops: 1 });
  assert.equal(resolved.ip, "198.51.100.12");
  assert.equal(resolved.source, "x-forwarded-for");
});
