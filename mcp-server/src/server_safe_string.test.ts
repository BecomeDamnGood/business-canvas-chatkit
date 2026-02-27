import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { safeString } from "./server_safe_string.js";

const serverSourceFiles = [
  "./server/server_config.ts",
  "./server/idempotency_registry.ts",
  "./server/ordering_parity.ts",
  "./server/observability.ts",
  "./server/locale_resolution.ts",
  "./server/run_step_model_result.ts",
  "./server/run_step_transport.ts",
  "./server/run_step_transport_context.ts",
  "./server/run_step_transport_idempotency.ts",
  "./server/run_step_transport_stale.ts",
  "./server/mcp_registration.ts",
  "./server/http_routes.ts",
];

function readServerSource(): string {
  return serverSourceFiles
    .map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"))
    .join("\n");
}

test("safeString handles unstringifiable objects without throwing", () => {
  const bad = Object.create(null) as Record<string, unknown>;
  bad.x = 1;
  const value = safeString(bad);
  assert.equal(typeof value, "string");
});

test("local /run_step bridge forwards input_mode to runStepHandler", () => {
  const source = readServerSource();
  assert.match(source, /if \(req\.method === "POST" && url\.pathname === "\/run_step"\)/);
  assert.match(source, /input_mode\?: "widget" \| "chat";/);
  assert.match(source, /input_mode: args\.input_mode,/);
});

test("run_step MCP handler derives locale hint from request metadata and forwards it", () => {
  const source = readServerSource();
  assert.match(source, /resolveLocaleHintFromExtra\(extra\)/);
  assert.match(
    source,
    /runStepHandler\(\{[\s\S]*locale_hint: mergedLocale\.locale_hint,[\s\S]*locale_hint_source: mergedLocale\.locale_hint_source,/
  );
});

test("run_step handler enforces explicit ACTION_START before step_0 can mark started", () => {
  const source = readServerSource();
  assert.match(source, /const shouldMarkStarted = isStart && isStartAction;/);
  assert.match(source, /const holdForExplicitStart = requiresExplicitStart && !isStartAction && !isBootstrapPollAction;/);
  assert.match(source, /const userMessage =[\s\S]*holdForExplicitStart[\s\S]*\? ""/);
  assert.match(source, /if \(requiresExplicitStart && !shouldMarkStarted\) \{[\s\S]*started: "false"/);
});

test("tool input schema canonicalizes legacy state.language_source before zod enum validation", () => {
  const source = readServerSource();
  assert.match(source, /canonicalizeStateForRunStepArgs as canonicalizeStateForToolInput/);
  assert.match(source, /state: canonicalizeStateForToolInput\(args\.state\),/);
});

test("bootstrap session/epoch guards drop stale payloads and keep monotone sequencing", () => {
  const source = readServerSource();
  assert.match(source, /const bootstrapSessionRegistry = new Map/);
  assert.match(source, /function isStaleBootstrapPayload\(/);
  assert.match(source, /function registerBootstrapSnapshot\(/);
  assert.match(source, /const responseSeq = nextBootstrapResponseSeq\(\);/);
  assert.match(source, /"stale_bootstrap_payload_dropped"/);
  assert.match(source, /bootstrap_session_id/);
  assert.match(source, /bootstrap_epoch/);
  assert.match(source, /response_seq/);
  assert.match(source, /payload_epoch/);
  assert.match(source, /payload_response_seq/);
  assert.match(source, /latest_epoch/);
  assert.match(source, /latest_response_seq/);
  assert.match(source, /if \(staleCheck\.stale\) \{[\s\S]*const staleSource =/);
  assert.doesNotMatch(source, /if \(staleCheck\.stale\) \{[\s\S]{0,1000}const responseSeq = nextBootstrapResponseSeq\(\);/);
});

test("run_step handler logs locale + language readiness in request/response lines", () => {
  const source = readServerSource();
  assert.match(source, /"run_step_request"[\s\S]*locale_hint[\s\S]*locale_hint_source/);
  assert.match(
    source,
    /"run_step_response"[\s\S]*resolved_language[\s\S]*language_source[\s\S]*ui_strings_status[\s\S]*ui_bootstrap_status/
  );
  assert.match(source, /"run_step_response"[\s\S]*ui_view_mode[\s\S]*ui_action_start_present/);
});

test("run_step contract emits server-authoritative ui.view payload", () => {
  const runStepSource = fs.readFileSync(new URL("./handlers/run_step_runtime.ts", import.meta.url), "utf8");
  const actionHelpersSource = fs.readFileSync(
    new URL("./handlers/run_step_runtime_action_helpers.ts", import.meta.url),
    "utf8"
  );
  const ingressSource = fs.readFileSync(new URL("./handlers/ingress.ts", import.meta.url), "utf8");
  const turnContractSource = fs.readFileSync(new URL("./handlers/turn_contract.ts", import.meta.url), "utf8");
  assert.match(
    actionHelpersSource,
    /export type UiViewPayload = \{[\s\S]*mode\?: "prestart" \| "interactive" \| "blocked";[\s\S]*waiting_locale\?: false;/
  );
  assert.match(actionHelpersSource, /function deriveUiViewPayload\(variant: UiViewVariant\): UiViewPayload \| null/);
  assert.match(runStepSource, /createRunStepRuntimeActionHelpers\(/);
  assert.match(ingressSource, /CONTRACT_UI_VIEW_MODES = new Set\(\[/);
  assert.match(
    turnContractSource,
    /if \(uiPayload && \(!uiView \|\| !CONTRACT_UI_VIEW_MODES\.has\(uiViewMode\)\)\) \{[\s\S]*invalid_ui_view_mode/
  );
  assert.match(turnContractSource, /export function enforceRunStepViewContractGuard\(/);
  assert.match(turnContractSource, /if \(currentStep === STEP_0_ID && !started\) \{/);
  assert.match(turnContractSource, /step0_not_started_requires_prestart_mode/);
  assert.match(turnContractSource, /prestart_ready_requires_ui_strings/);
  assert.match(turnContractSource, /step0_not_started_requires_start_action/);
  assert.match(turnContractSource, /interactive_requires_renderable_content/);
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
  const source = readServerSource();
  assert.match(source, /const modelResult = buildModelSafeResult\(resultForClient\);/);
  assert.match(source, /result: modelResult,/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient,\s*\}/);
});

test("single tool contract: run_step owns output template and model+app visibility", () => {
  const source = readServerSource();
  assert.match(source, /server\.registerTool\(\s*"run_step"/);
  assert.doesNotMatch(source, /server\.registerTool\(\s*"open_canvas"/);
  assert.match(source, /visibility:\s*\["model",\s*"app"\]/);
  assert.match(source, /"openai\/outputTemplate": uiResourceUri/);
});

test("run_step facade delegates to runtime owner and keeps thin forwarding contract", () => {
  const facadeSource = fs.readFileSync(new URL("./handlers/run_step.ts", import.meta.url), "utf8");
  const runtimeSource = fs.readFileSync(new URL("./handlers/run_step_runtime.ts", import.meta.url), "utf8");
  assert.match(facadeSource, /import \{ run_step as runStepRuntime \} from "\.\/run_step_runtime\.js";/);
  assert.match(
    facadeSource,
    /export async function run_step\(rawArgs: unknown\)\s*\{\s*return runStepRuntime\(rawArgs\);\s*\}/
  );
  assert.match(runtimeSource, /export async function run_step\(rawArgs: unknown\): Promise<RunStepSuccess \| RunStepError>/);
});

test("runtime golden fixtures exist for prestart/waiting_locale/interactive/blocked/failed contracts", () => {
  const required = ["prestart.json", "waiting_locale.json", "interactive.json", "blocked.json", "failed.json"];
  for (const filename of required) {
    const fixturePath = new URL(`./handlers/__golden__/runtime/${filename}`, import.meta.url);
    assert.equal(fs.existsSync(fixturePath), true, `missing runtime golden fixture ${filename}`);
  }
});

test("structured logging redacts token-like values in both server and runtime layers", () => {
  const serverSource = readServerSource();
  const runtimeResponseSource = fs.readFileSync(new URL("./handlers/run_step_response.ts", import.meta.url), "utf8");
  assert.match(serverSource, /const LOG_REDACT_VALUE_RE =/);
  assert.match(runtimeResponseSource, /const LOG_REDACT_VALUE_RE =/);
});

test("presentation write-side runs through a dedicated adapter and deterministic artifact names", () => {
  const routeSource = fs.readFileSync(new URL("./handlers/run_step_routes.ts", import.meta.url), "utf8");
  const presentationSource = fs.readFileSync(new URL("./handlers/run_step_presentation.ts", import.meta.url), "utf8");
  assert.match(routeSource, /const assets = deps\.generatePresentationAssets\(context\.state\);/);
  assert.doesNotMatch(routeSource, /deps\.convertPptxToPdf\(/);
  assert.doesNotMatch(routeSource, /deps\.convertPdfToPng\(/);
  assert.match(presentationSource, /const fileName = `presentation-\$\{assetFingerprint\}\.pptx`;/);
  assert.match(presentationSource, /if \(fs\.existsSync\(filePath\) && fs\.statSync\(filePath\)\.isFile\(\)\)/);
});
