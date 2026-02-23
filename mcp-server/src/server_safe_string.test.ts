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

test("tool input schemas canonicalize legacy state.language_source before zod enum validation", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /function canonicalizeStateForToolInput\(/);
  assert.match(source, /next\.language_source = normalizeStateLanguageSource\(next\.language_source\);/);
  assert.match(source, /state:\s*z\.preprocess\(canonicalizeStateForToolInput,\s*CanvasStateZod\.partial\(\)\.passthrough\(\)\.optional\(\)\)/);
});

test("open_canvas bootstrap writes canonical state.language_source (never transport source)", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const persistedLanguageSource = normalizeStateLanguageSource\(sourceState\.language_source\);/);
  assert.match(
    source,
    /const finalLanguageSource =[\s\S]*resolvedLanguage[\s\S]*"locale_hint"[\s\S]*persistedLanguageSource/,
    "final language source must canonicalize transport locale into locale_hint and otherwise use persisted canonical source"
  );
  assert.match(source, /function uiStringsRenderableForLang\(/);
  assert.match(source, /const baseReady = stringsRenderable \|\| finalLanguage === "en";/);
  assert.match(source, /\[open_canvas_ready_claim_inconsistent\]/);
  assert.match(source, /const strictReadinessV1 = envFlagEnabled\("UI_OPEN_CANVAS_STRICT_READINESS_V1", true\);/);
  assert.match(source, /const gatedBootstrapState = sanitized\.state as Record<string, unknown>;/);
  assert.match(source, /sanitizeBootstrapIngressState\(/);
  assert.match(source, /\[ingress_ready_claim_rejected\]/);
  assert.doesNotMatch(source, /const bootstrapState: Record<string, unknown> = \{\s*\.\.\.sourceState,/);
  assert.match(source, /intro_shown_session: "false"/);
  assert.match(source, /last_specialist_result: \{\}/);
  assert.match(source, /bootstrap_state_language_source/);
  assert.match(source, /const waitingLocale = safeString\(gatedBootstrapState\.ui_gate_status \?\? ""\) === "waiting_locale";/);
  assert.match(source, /const interactiveFallbackActive = safeString\(gatedBootstrapState\.bootstrap_phase \?\? ""\) === "interactive_fallback";/);
  assert.match(source, /bootstrap_waiting_locale: waitingLocale,/);
  assert.match(source, /bootstrap_interactive_ready: bootstrapInteractiveReady,/);
  assert.match(source, /interactive_fallback_active: interactiveFallbackActive,/);
});

test("run_step wrapper never treats bootstrap poll or technical actions as start intent", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const isBootstrapPollAction = upperMessage === "ACTION_BOOTSTRAP_POLL";/);
  assert.match(source, /const isStartAction = upperMessage === "ACTION_START";/);
  assert.match(source, /const shouldSeedInitialUserMessage =[\s\S]*!isActionMessage[\s\S]*!isBootstrapPollAction[\s\S]*!isTechnicalRouteMessage/);
  assert.match(source, /\.\.\.\(hasInitiator \|\| !shouldSeedInitialUserMessage \? \{\} : \{ initial_user_message: normalizedMessage \}\)/);
  assert.match(source, /const shouldMarkStarted =[\s\S]*!isBootstrapPollAction[\s\S]*\(isStartAction \|\| !isActionMessage\)/);
});

test("bootstrap session\/epoch guards drop stale payloads and keep monotone sequencing", () => {
  const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /const bootstrapSessionRegistry = new Map/);
  assert.match(source, /function isStaleBootstrapPayload\(/);
  assert.match(source, /function registerBootstrapSnapshot\(/);
  assert.match(source, /function attachBootstrapDiagnostics\(/);
  assert.match(source, /const responseSeq = nextBootstrapResponseSeq\(\);/);
  assert.match(source, /\[stale_bootstrap_payload_dropped\]/);
  assert.match(source, /bootstrap_session_id/);
  assert.match(source, /bootstrap_epoch/);
  assert.match(source, /response_seq/);
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
  assert.match(source, /const started = safeString\(state\.started \|\| ""\)\.toLowerCase\(\) === "true";/);
  assert.match(source, /let mode: "waiting_locale" \| "prestart" \| "interactive" \| "recovery" = "interactive";/);
  assert.match(source, /const prestartModeV1 = envFlagEnabled\("UI_PRESTART_VIEW_MODE_V1", true\);/);
  assert.match(source, /else if \(prestartModeV1 && !started\) mode = "prestart";/);
  assert.match(source, /else if \(!hasInteractivePayload\) mode = "recovery";/);
  assert.match(source, /const promptBody = mode === "interactive" \? promptBodyRaw : "";/);
  assert.match(source, /const options = mode === "interactive" \? optionsRaw : \[\];/);
  assert.match(source, /waiting_locale: waitingLocale,/);
  assert.match(source, /mode,/);
  assert.match(source, /recovery_action:[\s\S]*mode === "recovery" \? "retry_poll" : ""/);
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
  assert.match(source, /model_result_shape_version: "v2_minimal"/);
  assert.match(source, /current_step_id: currentStep/);
  assert.match(source, /state: safeState,/);
  assert.match(source, /safeState: Record<string, unknown> = \{\s*current_step: currentStep \|\| "step_0",/);
  assert.match(source, /if \(started\) safeState\.started = started;/);
  assert.match(source, /if \(uiStringsStatus\) safeState\.ui_strings_status = uiStringsStatus;/);
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
