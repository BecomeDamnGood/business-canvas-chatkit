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

test("run_step handler enforces explicit ACTION_START before step_0 can mark started", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const shouldMarkStarted = isStart && isStartAction;/);
  assert.match(source, /const holdForExplicitStart = requiresExplicitStart && !isStartAction && !isBootstrapPollAction;/);
  assert.match(source, /if \(holdForExplicitStart\) user_message = "";/);
  assert.match(source, /if \(requiresExplicitStart && !shouldMarkStarted\) \{[\s\S]*started: "false"/);
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
  assert.match(source, /incoming_tuple/);
  assert.match(source, /latest_tuple/);
  assert.match(source, /if \(staleCheck\.stale\) \{[\s\S]*const staleResult = staleSource;/);
  assert.doesNotMatch(source, /if \(staleCheck\.stale\) \{[\s\S]{0,1000}const responseSeq = nextBootstrapResponseSeq\(\);/);
});

test("run_step handler logs locale + language readiness in request/response lines", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /\[run_step\] request[\s\S]*locale_hint[\s\S]*locale_hint_source/);
  assert.match(
    source,
    /\[run_step\] response[\s\S]*resolved_language[\s\S]*language_source[\s\S]*ui_strings_status[\s\S]*ui_bootstrap_status/
  );
  assert.match(source, /\[run_step\] response[\s\S]*ui_view_mode[\s\S]*ui_action_start_present/);
});

test("run_step contract emits server-authoritative ui.view payload", () => {
  const runStepSource = fs.readFileSync(new URL("./handlers/run_step.ts", import.meta.url), "utf8");
  const ingressSource = fs.readFileSync(new URL("./handlers/ingress.ts", import.meta.url), "utf8");
  const turnContractSource = fs.readFileSync(new URL("./handlers/turn_contract.ts", import.meta.url), "utf8");
  assert.match(runStepSource, /type UiViewPayload = \{[\s\S]*mode: UiViewModeRoute;[\s\S]*waiting_locale: boolean;/);
  assert.match(runStepSource, /function deriveUiViewPayload\(/);
  assert.match(ingressSource, /CONTRACT_UI_VIEW_MODES = new Set\(\[/);
  assert.match(
    turnContractSource,
    /if \(uiPayload && \(!uiView \|\| !CONTRACT_UI_VIEW_MODES\.has\(uiViewMode\)\)\) \{[\s\S]*invalid_ui_view_mode/
  );
  assert.match(turnContractSource, /if \(currentStep === STEP_0_ID && !started && uiGateStatus === "ready"\) \{/);
  assert.match(turnContractSource, /prestart_ready_requires_prestart_mode/);
  assert.match(turnContractSource, /prestart_ready_requires_ui_strings/);
  assert.match(turnContractSource, /prestart_ready_requires_start_action/);
});

test("ui actions do not optimistically mutate started or state.language before run_step response", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /widgetPatch\.started = "true"/);
  assert.doesNotMatch(
    source,
    /if \(!String\(\(nextState as Record<string, unknown>\)\.language \|\| ""\)\.trim\(\) && localeHint\)/
  );
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
