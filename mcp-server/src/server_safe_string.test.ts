import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { safeString } from "./server_safe_string.js";

test("safeString handles unstringifiable objects without throwing", () => {
  const bad = Object.create(null) as Record<string, unknown>;
  bad.x = 1;
  const value = safeString(bad);
  assert.equal(typeof value, "string");
});

test("local /run_step bridge forwards input_mode to runStepHandler", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /if \(req\.method === "POST" && url\.pathname === "\/run_step"\)[\s\S]*input_mode\?: "widget" \| "chat";[\s\S]*input_mode: args\.input_mode,/
  );
});

test("run_step MCP handler derives locale hint from request metadata and forwards it", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /resolveLocaleHintFromExtra\(extra\)/);
  assert.match(
    source,
    /runStepHandler\(\{[\s\S]*locale_hint: mergedLocale\.locale_hint,[\s\S]*locale_hint_source: mergedLocale\.locale_hint_source,/
  );
});

test("tool input schema canonicalizes legacy state.language_source before zod enum validation", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /function canonicalizeStateForToolInput\(/);
  assert.match(source, /next\.language_source = normalizeStateLanguageSource\(next\.language_source\);/);
});

test("bootstrap session/epoch guards drop stale payloads and keep monotone sequencing", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const bootstrapSessionRegistry = new Map/);
  assert.match(source, /function isStaleBootstrapPayload\(/);
  assert.match(source, /function registerBootstrapSnapshot\(/);
  assert.match(source, /const responseSeq = nextBootstrapResponseSeq\(\);/);
  assert.match(source, /\[stale_bootstrap_payload_dropped\]/);
  assert.match(source, /bootstrap_session_id/);
  assert.match(source, /bootstrap_epoch/);
  assert.match(source, /response_seq/);
});

test("run_step handler logs locale + language readiness in request/response lines", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /\[run_step\] request[\s\S]*locale_hint[\s\S]*locale_hint_source/);
  assert.match(
    source,
    /\[run_step\] response[\s\S]*resolved_language[\s\S]*language_source[\s\S]*ui_strings_status[\s\S]*ui_bootstrap_status/
  );
});

test("buildUiStructured emits server-authoritative view payload", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /function buildUiStructured\(/);
  assert.match(source, /view:\s*\{[\s\S]*mode,[\s\S]*waiting_locale:[\s\S]*bootstrap_phase:/);
});

test("run_step handler always emits model-safe result and keeps full payload widget-only", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const modelResult = buildModelSafeResult\(resultForClient\);/);
  assert.match(source, /result: modelResult,/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient,\s*\}/);
});

test("single tool contract: run_step owns output template and model+app visibility", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\(\s*"run_step"/);
  assert.doesNotMatch(source, /server\.registerTool\(\s*"open_canvas"/);
  assert.match(source, /visibility:\s*\["model",\s*"app"\]/);
  assert.match(source, /"openai\/outputTemplate": uiResourceUri/);
});
