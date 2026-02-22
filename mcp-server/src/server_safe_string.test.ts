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
    /runStepHandler\(\{[\s\S]*locale_hint: mergedLocale\.locale_hint,[\s\S]*locale_hint_source: mergedLocale\.locale_hint_source,/,
    "tool callback must forward resolved locale hint to runStepHandler"
  );
});

test("locale header resolver supports Headers.get and returns request_header source", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /if \(typeof \(headersRaw as any\)\.get === "function"\)/);
  assert.match(source, /return \{ locale_hint: headerLocale, locale_hint_source: "request_header" \};/);
});

test("open_canvas and run_step merge args locale with extra metadata source", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /function mergeLocaleHintInputs\(/);
  assert.match(source, /const mergedLocale = mergeLocaleHintInputs\(\s*args\.locale_hint,\s*args\.locale_hint_source,\s*localeFromExtra\s*\);/);
  assert.match(
    source,
    /server\.registerTool\(\s*"open_canvas"[\s\S]*buildOpenCanvasBootstrapResponse\(\{[\s\S]*locale_hint: mergedLocale\.locale_hint,[\s\S]*locale_hint_source: mergedLocale\.locale_hint_source,/,
    "open_canvas should route locale metadata into bootstrap response builder"
  );
  const openCanvasStart = source.indexOf('server.registerTool(\n    "open_canvas"');
  const runStepStart = source.indexOf('server.registerTool(\n    "run_step"');
  assert.ok(openCanvasStart >= 0 && runStepStart > openCanvasStart, "open_canvas block should appear before run_step block");
  const openCanvasBlock = source.slice(openCanvasStart, runStepStart);
  assert.doesNotMatch(openCanvasBlock, /runStepHandler\(/, "open_canvas must not execute run_step business logic");
});

test("open_canvas has idempotent dedupe cache guard", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const openCanvasDedupeCache = new Map/);
  assert.match(source, /const dedupeToken = openCanvasDedupeToken\(/);
  assert.match(source, /open_canvas_deduped: true/);
  assert.match(source, /open_canvas_deduped: false/);
  assert.match(source, /open_canvas_dedupe_key_hash/);
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
  assert.match(
    source,
    /\[run_step\] response[\s\S]*bootstrap_waiting_locale[\s\S]*bootstrap_retry_scheduled/,
    "response log should include bootstrap locale wait diagnostics"
  );
});

test("buildUiStructured suppresses prompt/options while bootstrap locale is waiting", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const waitingLocale = flags\.bootstrap_waiting_locale === true;/);
  assert.match(source, /const promptBody = waitingLocale \? "" : \(prompt \|\| text \|\| ""\);/);
  assert.match(source, /const actionCodes = waitingLocale \? \[\] :/);
});

test("run_step handler always emits model-safe result and keeps full payload widget-only", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const shouldUseModelSafeResult =/);
  assert.match(source, /const modelResult = buildModelSafeResult\(resultForClient\);/);
  assert.match(source, /result: modelResult,/);
  assert.match(source, /const uiPayload = buildUiStructured\(resultForClient\);/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient,\s*\}/);
});

test("compat-first contract: open_canvas owns template and run_step stays model+app without template", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\(\s*"open_canvas"/);
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*"openai\/outputTemplate": uiResourceUri,/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\],/);
  assert.doesNotMatch(
    source,
    /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/outputTemplate": uiResourceUri,/,
    "run_step must not own openai/outputTemplate in compat-first architecture"
  );
  assert.match(
    source,
    /console\.log\("\[mcp_tool_contract\]",[\s\S]*run_step_visibility:\s*\["model",\s*"app"\][\s\S]*run_step_output_template:\s*false/,
    "startup log must expose effective tool descriptor contract for production diagnostics"
  );
});

test("buildModelSafeResult returns minimal v2 model-visible fields", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /return \{\s*model_result_shape_version: "v2_minimal",\s*ok: result\.ok === true,\s*tool: safeString\(result\.tool \|\| "run_step"\),\s*current_step_id: safeString\(result\.current_step_id \|\| state\.current_step \|\| "step_0"\),\s*ui_gate_status: safeString\(\(result as any\)\.ui_gate_status \|\| state\.ui_gate_status \|\| ""\),\s*language: safeString\(\(result as any\)\.language \|\| state\.language \|\| ""\),\s*interactive_fallback_active: flags\.interactive_fallback_active === true,\s*\};/
  );
});

test("run_step description enforces no business content in chat output", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /Do not generate business content in chat\./);
  assert.match(source, /Do not summarize or explain what the app shows\./);
  assert.match(source, /All questions and interaction happen inside the app UI\./);
});

test("open_canvas description enforces no business content in chat output", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*Do not generate business content in chat after this call\./);
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*Do not summarize app content\./);
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*Output nothing or at most one short neutral sentence that the app is open\./);
});

test("model-visible structuredContent no longer includes seed_user_message", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /structuredContent\.seed_user_message\s*=/);
  assert.match(source, /bootstrapState\.initial_user_message\s*=\s*seedMessage;/);
});
