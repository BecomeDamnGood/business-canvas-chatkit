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

test("run_step MCP handler derives locale hint from request metadata and forwards it", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /async \(args, extra\) =>[\s\S]*resolveLocaleHintFromExtra\(extra\)/,
    "tool callback must read request metadata to resolve locale hint"
  );
  assert.match(
    source,
    /runStepHandler\(\{[\s\S]*locale_hint: localeHint,[\s\S]*locale_hint_source: localeHintSource,/,
    "tool callback must forward resolved locale hint to runStepHandler"
  );
});

test("run_step handler logs locale + language readiness in request/response lines", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /\[run_step\] request[\s\S]*locale_hint[\s\S]*locale_hint_source/,
    "request log should include locale hint metadata for CloudWatch diagnostics"
  );
  assert.match(
    source,
    /\[run_step\] response[\s\S]*resolved_language[\s\S]*language_source[\s\S]*ui_strings_status[\s\S]*ui_bootstrap_status/,
    "response log should include resolved language and UI readiness fields"
  );
});
