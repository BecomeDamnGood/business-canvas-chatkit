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
  assert.match(source, /const uiPayload = buildUiStructured\(modelResult\);/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient,\s*\}/);
});

test("app-first tool split is present: open_canvas tool plus run_step visibility switch", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\(\s*"open_canvas"/);
  assert.match(source, /const runStepVisibility = isMcpAppFirstToolsV1Enabled\(\) \? \["app"\] : \["model", "app"\];/);
  assert.match(source, /visibility: runStepVisibility,/);
});

test("buildModelSafeResult returns only the minimal six model-visible fields", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /return \{\s*ok: result\.ok === true,\s*tool: safeString\(result\.tool \|\| "run_step"\),\s*current_step_id: safeString\(result\.current_step_id \|\| state\.current_step \|\| "step_0"\),\s*ui_gate_status: safeString\(\(result as any\)\.ui_gate_status \|\| state\.ui_gate_status \|\| ""\),\s*language: safeString\(\(result as any\)\.language \|\| state\.language \|\| ""\),\s*interactive_fallback_active: flags\.interactive_fallback_active === true,\s*\};/
  );
});

test("run_step description enforces no business content in chat output", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /Do not generate business content in chat\./);
  assert.match(source, /Do not summarize or explain what the app shows\./);
  assert.match(source, /All questions and interaction happen inside the app UI\./);
});
