import test from "node:test";
import assert from "node:assert/strict";
import { safeString } from "./server_safe_string.js";

test("safeString handles unstringifiable objects without throwing", () => {
  const bad = Object.create(null) as Record<string, unknown>;
  bad.x = 1;
  const value = safeString(bad);
  assert.equal(typeof value, "string");
  const meta = `step: ${value}`;
  assert.equal(typeof meta, "string");
});
