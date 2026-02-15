import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { safeString } from "./server_safe_string.js";

test("safeString handles unstringifiable objects without throwing", () => {
  const bad = Object.create(null) as Record<string, unknown>;
  bad.x = 1;
  const value = safeString(bad);
  assert.equal(typeof value, "string");
  const meta = `step: ${value}`;
  assert.equal(typeof meta, "string");
});

test("local /run_step bridge forwards input_mode to runStepHandler", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /if \(req\.method === "POST" && url\.pathname === "\/run_step"\)[\s\S]*input_mode\?: "widget" \| "chat";[\s\S]*input_mode: args\.input_mode,/,
    "local /run_step route must parse and pass input_mode so widget-specific behavior remains active"
  );
});
