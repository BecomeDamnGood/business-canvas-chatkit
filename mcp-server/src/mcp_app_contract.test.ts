import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { finalizeResponseContractInternals } from "./handlers/turn_contract.js";
import { VIEW_CONTRACT_VERSION as LOCALE_START_VIEW_CONTRACT_VERSION } from "./core/bootstrap_runtime.js";
import {
  RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
  RunStepToolStructuredContentOutputSchema,
} from "./contracts/mcp_tool_contract.js";

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
const source = serverSourceFiles
  .map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"))
  .join("\n");
const bundledRuntimeSource = fs.readFileSync(
  new URL("../ui/step-card.bundled.html", import.meta.url),
  "utf8"
);
const runStepResponseSource = fs.readFileSync(
  new URL("./handlers/run_step_response.ts", import.meta.url),
  "utf8"
);
const turnContractSource = fs.readFileSync(
  new URL("./handlers/turn_contract.ts", import.meta.url),
  "utf8"
);
const canonicalWidgetStateSource = fs.readFileSync(
  new URL("./handlers/run_step_canonical_widget_state.ts", import.meta.url),
  "utf8"
);
const staleSource = fs.readFileSync(
  new URL("./server/run_step_transport_stale.ts", import.meta.url),
  "utf8"
);
const transportContextSource = fs.readFileSync(
  new URL("./server/run_step_transport_context.ts", import.meta.url),
  "utf8"
);

function buildContractBaseState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    current_step: "step_0",
    started: "false",
    bootstrap_phase: "ready",
    ui_gate_status: "ready",
    ui_gate_reason: "",
    ui_strings_status: "ready",
    ui_strings_requested_lang: "en",
    ui_strings_lang: "en",
    ui_strings: { btnStart: "Start" },
    locale: "en",
    language: "en",
    ui_strings_fallback_applied: "false",
    ui_strings_fallback_reason: "",
    view_contract_version: LOCALE_START_VIEW_CONTRACT_VERSION,
    ...overrides,
  };
}

function finalizeForContractActionSet(
  response: Record<string, unknown>
): Record<string, unknown> {
  return finalizeResponseContractInternals(response, {
    applyUiClientActionContract: () => {},
    parseMenuFromContractIdForStep: () => "",
    labelKeysForMenuActionCodes: () => [],
    onUiParityError: () => {},
    attachRegistryPayload: (payload) => payload,
  }) as Record<string, unknown>;
}

test("MCP app contract: server initializes MCP capabilities for tools/resources", () => {
  assert.match(source, /new McpServer\([\s\S]*capabilities:\s*\{[\s\S]*tools:\s*\{\}[\s\S]*resources:\s*\{\}/);
});

test("MCP app contract: UI resource is registered and versioned", () => {
  assert.match(source, /server\.registerResource\(/);
  assert.match(source, /UI_RESOURCE_NAME/);
  assert.match(source, /UI_RESOURCE_QUERY/);
  assert.match(source, /mimeType:\s*"text\/html;profile=mcp-app"/);
});

test("MCP app contract: run_step is registered with title/description/inputSchema", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*title:[\s\S]*description:[\s\S]*inputSchema:/);
  assert.doesNotMatch(source, /server\.registerTool\(\s*"open_canvas"/);
});

test("MCP app contract: run_step exposes explicit outputSchema", () => {
  assert.match(source, /RunStepToolStructuredContentOutputSchema/);
  assert.match(
    source,
    /server\.registerTool\(\s*"run_step"[\s\S]*outputSchema:\s*RunStepToolStructuredContentOutputSchema/
  );
});

test("MCP app contract parity: structuredContent schema accepts object meta with step/specialist", () => {
  const parsed = RunStepToolStructuredContentOutputSchema.parse({
    title: "The Business Strategy Canvas Builder",
    meta: {
      step: "step_0",
      specialist: "ValidationAndBusinessName",
    },
    result: {
      model_result_shape_version: RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
      ok: true,
      tool: "run_step",
      current_step_id: "step_0",
      state: {},
    },
  });
  assert.equal(parsed.meta?.step, "step_0");
  assert.equal(parsed.meta?.specialist, "ValidationAndBusinessName");
});

test("MCP app contract: runtime ingress is MCP-only and keeps direct run_step transport response", () => {
  assert.doesNotMatch(source, /if \(req\.method === "POST" && url\.pathname === "\/run_step"\)/);
  assert.doesNotMatch(source, /if \(req\.method === "GET" && \(url\.pathname === "\/test" \|\| url\.pathname === "\/test\/"\)\)/);
  assert.doesNotMatch(source, /const parsedStructuredContent = RunStepToolStructuredContentOutputSchema\.parse\(structuredContent\)/);
  assert.match(source, /return \{[\s\S]*structuredContent,[\s\S]*\.\.\.\(meta \? \{ _meta: meta \} : \{\}\),[\s\S]*\}/);
});

test("MCP app contract: /ui/step-card route and run_step transport keep bundled owner path", () => {
  assert.match(source, /readFileSync\(new URL\("\.\.\/\.\.\/ui\/step-card\.bundled\.html", import\.meta\.url\), "utf-8"\)/);
  assert.match(
    source,
    /if \((?:req\.method === "GET" && )?url\.pathname === "\/ui\/step-card" \|\| url\.pathname === "\/ui\/step-card\/"\) \{/
  );
  assert.match(source, /filePath = path\.join\(uiDir, "step-card\.bundled\.html"\);/);
  assert.match(source, /if \(fileName === "step-card\.bundled\.html"\) \{/);
});

test("MCP app contract: run_step is not idempotent-hinted", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*idempotentHint:\s*false/);
});

test("MCP app contract: run_step owns ui.resourceUri + outputTemplate alias + widgetAccessible", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*ui:\s*\{[\s\S]*resourceUri:\s*uiResourceUri/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/outputTemplate": uiResourceUri/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/widgetAccessible": true/);
});

test("MCP app contract: run_step visibility remains model+app", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\]/);
});

test("MCP app contract: run_step declares invocation status strings", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/toolInvocation\/invoking":\s*"Thinking\.\.\."/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/toolInvocation\/invoked":\s*"Updated"/);
});

test("MCP wrapper parity: model result stays safe and _meta.widget_result keeps full payload", () => {
  assert.match(
    source,
    /function buildStructuredContentResult\(widgetResult: Record<string, unknown>\): Record<string, unknown> \{[\s\S]*buildModelSafeResult\(widgetResult\)/
  );
  assert.match(source, /result:\s*buildStructuredContentResult\(enrichedWidgetResult\),/);
  assert.match(source, /result:\s*buildStructuredContentResult\(resultForClient\),/);
  assert.match(source, /result:\s*buildStructuredContentResult\(fallbackResult as Record<string, unknown>\),/);
  assert.match(source, /meta:\s*\{[\s\S]*widget_result:\s*enrichedWidgetResult,[\s\S]*\}/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient\s*,?\s*\}/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*fallbackResult\s*,?\s*\}/);
  assert.doesNotMatch(source, /const widgetResultForClient = \(meta as Record<string, unknown> \| undefined\)\?\.widget_result/);
  assert.doesNotMatch(source, /Object\.assign\(\{\}, parsedStructuredContent, \{ _widget_result: widgetResultForClient \}\)/);
});

test("MCP app contract parity: bundled render-state prefers _meta.widget_result with standard result fallback", () => {
  assert.match(bundledRuntimeSource, /function extractWidgetResult\(raw\) \{/);
  assert.match(bundledRuntimeSource, /toRecord\(toRecord\(root\._meta\)\.widget_result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(root\.toolResponseMetadata\)/);
  assert.match(bundledRuntimeSource, /toRecord\(toolResponseMetadata\.widget_result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(toRecord\(structured\._meta\)\.widget_result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(toRecord\(toolOutput\._meta\)\.widget_result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(root\.result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(structured\.result\)/);
  assert.match(bundledRuntimeSource, /toRecord\(toolOutput\.result\)/);
  assert.match(bundledRuntimeSource, /var candidates = \[[\s\S]*root,[\s\S]*structured,[\s\S]*toolOutput,[\s\S]*\];/);
  assert.doesNotMatch(bundledRuntimeSource, /toolOutput\._widget_result/);
  assert.doesNotMatch(bundledRuntimeSource, /root\._widget_result/);
  assert.doesNotMatch(bundledRuntimeSource, /structuredContent\._widget_result/);
  assert.match(bundledRuntimeSource, /var toolResponseMetadata = toRecord\(openai\.toolResponseMetadata\);/);
  assert.match(
    bundledRuntimeSource,
    /return\s*\{\s*toolOutput:\s*toolOutput,\s*toolResponseMetadata:\s*toolResponseMetadata,\s*\};/
  );
  assert.match(bundledRuntimeSource, /window\.addEventListener\("openai:set_globals"/);
  assert.match(bundledRuntimeSource, /window\.addEventListener\("openai:notification"/);
  assert.match(bundledRuntimeSource, /var hasResultInParams = Object\.keys\(extractWidgetResult\(payload\)\)\.length > 0;/);
  assert.match(bundledRuntimeSource, /notification_params_payload/);
  assert.match(bundledRuntimeSource, /notification_detail_payload/);
});

test("MCP wrapper parity: model-safe result contract remains minimal in buildModelSafeResult", () => {
  const fnMatch = source.match(/function buildModelSafeResult\(result: Record<string, unknown>\): Record<string, unknown> \{[\s\S]*?\n\}/);
  assert.ok(fnMatch && fnMatch[0], "buildModelSafeResult function must exist");
  const fnBody = String(fnMatch?.[0] || "");
  assert.match(fnBody, /model_result_shape_version:\s*RUN_STEP_MODEL_RESULT_SHAPE_VERSION/);
  assert.match(fnBody, /\bok:\s*result\.ok === true/);
  assert.match(fnBody, /\btool:\s*safeString\(result\.tool \|\| "run_step"\)/);
  assert.match(fnBody, /\bcurrent_step_id:\s*currentStep/);
  assert.match(fnBody, /\bstate:\s*safeState/);
  assert.doesNotMatch(fnBody, /\bprompt\s*:/);
  assert.doesNotMatch(fnBody, /\bspecialist\s*:/);
  assert.doesNotMatch(fnBody, /\berror\s*:/);
});

test("MCP app contract: run_step input accepteert idempotency_key en extra-header fallback", () => {
  assert.match(source, /RunStepToolInputSchema/);
  assert.match(source, /function resolveIdempotencyKeyFromExtra\(extra: unknown\): string/);
  assert.match(source, /getHeaderFromRequestInfo\(requestInfo, "idempotency-key"\)/);
  assert.match(source, /getHeaderFromRequestInfo\(requestInfo, "x-idempotency-key"\)/);
});

test("MCP app contract: server definieert replay\/conflict foutcodes voor idempotency", () => {
  assert.match(source, /const IDEMPOTENCY_ERROR_CODES = \{[\s\S]*REPLAY:\s*"idempotency_replay"/);
  assert.match(source, /CONFLICT:\s*"idempotency_key_conflict"/);
  assert.match(source, /INFLIGHT:\s*"idempotency_replay_inflight"/);
  assert.match(source, /"idempotency_conflict"/);
  assert.match(source, /"idempotency_replay_served"/);
});

test("MCP app contract: run_step publishes contract metadata and version fields", () => {
  assert.match(source, /"openai\/toolInvocation\/invoked": "Updated"/);
  assert.match(source, /contract: RUN_STEP_TOOL_CONTRACT_META/);
  assert.match(source, /TOOL_CONTRACT_FAMILY_VERSION=/);
  assert.match(source, /RUN_STEP_INPUT_SCHEMA_VERSION=/);
  assert.match(source, /RUN_STEP_OUTPUT_SCHEMA_VERSION=/);
});

test("MCP app contract: diagnostics endpoint is exposed with operational registry stats", () => {
  assert.match(source, /const isDiagnosticsEndpoint = url\.pathname === "\/diagnostics"/);
  assert.match(source, /"diagnostics_endpoint_read"/);
  assert.match(source, /bootstrap_sessions:/);
  assert.match(source, /idempotency,/);
});

test("MCP app contract: lifecycle logs expose accepted dispatch reason-code", () => {
  assert.match(source, /accept_reason_code:\s*staleRebaseApplied \? "accepted_after_stale_rebase" : "accepted_fresh_dispatch"/);
  assert.match(source, /accepted_fresh_dispatch/);
});

test("MCP app contract: action liveness contract fields are emitted and logged", () => {
  assert.match(source, /run_step_action_liveness_dispatch/);
  assert.match(source, /run_step_action_liveness_ack/);
  assert.match(source, /run_step_action_liveness_advance/);
  assert.match(source, /run_step_action_liveness_explicit_error/);
  assert.match(source, /dispatch_count:\s*1/);
  assert.match(source, /ack_count:\s*1/);
  assert.match(source, /advance_count:\s*1/);
  assert.match(source, /explicit_error_count:\s*1/);
  assert.match(source, /ack_status:/);
  assert.match(source, /state_advanced:/);
  assert.match(source, /reason_code:/);
  assert.match(source, /action_code_echo:/);
  assert.match(source, /client_action_id_echo:/);
});

test("MCP app contract: stale payload preflight is neutralized for robust startup flow", () => {
  assert.match(source, /const stalePreflight = preflightStalePayload\(/);
  assert.match(source, /stalePreflight\.earlyResponse/);
  assert.match(staleSource, /return \{[\s\S]*staleRebaseApplied:\s*false,[\s\S]*earlyResponse:\s*null,[\s\S]*\};/);
});

test("MCP app contract: stale ingest/rebase flags are hard-disabled in transport context", () => {
  assert.match(transportContextSource, /const staleIngestGuardEnabled = false;/);
  assert.match(transportContextSource, /const staleRebaseEnabled = false;/);
});

test("MCP app contract: diagnostics publishes rollout flag states for canary checks", () => {
  assert.match(source, /rollout_flags:\s*\{/);
  assert.match(source, /run_step_stale_ingest_guard_v1:\s*RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED/);
  assert.match(source, /run_step_stale_rebase_v1:\s*RUN_STEP_STALE_REBASE_V1_ENABLED/);
  assert.match(
    source,
    /run_step_stale_rebase_v1_effective:\s*RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED && RUN_STEP_STALE_REBASE_V1_ENABLED/
  );
});

test("MCP app contract: run_step wrapper logs render-source lifecycle", () => {
  assert.match(source, /"run_step_render_source_selected"/);
  assert.match(source, /render_source:\s*renderSource/);
  assert.match(source, /render_source_reason_code:\s*renderSourceReasonCode/);
  assert.match(source, /render_source_tuple_complete:\s*!!\(renderSourceOrdering\.sessionId && renderSourceOrdering\.epoch > 0\)/);
  assert.match(source, /host_widget_session_id_present:\s*renderSourceOrdering\.hostWidgetSessionId \? "true" : "false"/);
  assert.match(source, /meta_widget_result_authoritative/);
});

test("MCP app contract: run_step wrapper has no tuple parity patch/backfill layer", () => {
  assert.doesNotMatch(source, /ensureRunStepOutputTupleParity\(/);
  assert.doesNotMatch(source, /"run_step_output_tuple_parity_patched"/);
  assert.doesNotMatch(source, /"run_step_ordering_tuple_parity"/);
  assert.doesNotMatch(source, /throw new Error\("meta_widget_result_missing"\)/);
  assert.match(
    source,
    /const contentSource = metaWidgetResult \|\| structuredResult;/
  );
  assert.match(
    source,
    /const renderSourceReasonCode = metaWidgetResult[\s\S]*\?\s*"meta_widget_result_authoritative"[\s\S]*:\s*\(Object\.keys\(structuredResult\)\.length > 0 \? "structured_content_result_fallback" : "render_source_missing"\);/
  );
  assert.match(source, /Object\.keys\(contentSource\)\.length > 0 \? "info" : "error"/);
});

test("MCP app contract: run_step response logs canonical-view observability event", () => {
  assert.match(runStepResponseSource, /"run_step_canonical_view_emitted"/);
  assert.match(runStepResponseSource, /started,/);
  assert.match(runStepResponseSource, /ui_view_mode:/);
  assert.match(runStepResponseSource, /has_renderable_content:/);
  assert.match(runStepResponseSource, /has_start_action:/);
  assert.match(runStepResponseSource, /invariant_ok:/);
  assert.match(runStepResponseSource, /reason_code:/);
});

test("MCP app contract: turn contract keeps canonical non-blocking view invariants", () => {
  assert.match(turnContractSource, /export function enforceRunStepViewContractGuard\(/);
  assert.match(turnContractSource, /buildCanonicalWidgetState/);
  assert.match(turnContractSource, /ensureUnifiedUiActionContract/);
  assert.match(turnContractSource, /action_contract/);
  assert.match(canonicalWidgetStateSource, /step0_start_action_missing/);
  assert.doesNotMatch(canonicalWidgetStateSource, /interactive_content_absent/);
  assert.doesNotMatch(turnContractSource, /interactive_requires_renderable_content/);
  assert.match(turnContractSource, /export function assertRunStepContractOrThrow/);
});

test("MCP app contract: prestart action contract is deterministic start-only", () => {
  const finalized = finalizeForContractActionSet({
    ok: true,
    tool: "run_step",
    current_step_id: "step_0",
    active_specialist: "ValidationAndBusinessName",
    text: "Welcome",
    prompt: "Click Start",
    specialist: {},
    state: buildContractBaseState({
      ui_action_start: "ACTION_START",
      ui_action_text_submit: "ACTION_TEXT_SUBMIT",
      ui_action_text_submit_payload_mode: "text",
    }),
    ui: {
      view: { mode: "prestart", waiting_locale: false },
      actions: [
        { id: "menu", action_code: "ACTION_STEP0_MENU", label: "Menu", label_key: "menu.step0" },
      ],
    },
  });

  const actionContract = ((finalized.ui as Record<string, unknown> | undefined)?.action_contract ||
    {}) as Record<string, unknown>;
  const actions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>)
    : [];
  assert.equal(actions.length, 1);
  assert.equal(String(actions[0]?.role || ""), "start");
  assert.equal(String(actions[0]?.action_code || ""), "ACTION_START");
});

test("MCP app contract: interactive contract keeps choices+text_submit and drops mixed state-only button roles", () => {
  const finalized = finalizeForContractActionSet({
    ok: true,
    tool: "run_step",
    current_step_id: "purpose",
    active_specialist: "Purpose",
    text: "Let's define your purpose.",
    prompt: "Choose or type your own answer.",
    specialist: {},
    state: buildContractBaseState({
      current_step: "purpose",
      started: "true",
      ui_action_start: "ACTION_START",
      ui_action_text_submit: "ACTION_TEXT_SUBMIT",
      ui_action_text_submit_payload_mode: "text",
      ui_action_dream_switch_to_self: "ACTION_DREAM_SWITCH_TO_SELF",
    }),
    ui: {
      view: { mode: "interactive", waiting_locale: false },
      actions: [
        {
          id: "choice_1",
          action_code: "ACTION_PURPOSE_INTRO_DEFINE",
          label: "Define purpose",
          label_key: "purpose.define",
        },
        {
          id: "choice_2",
          action_code: "ACTION_PURPOSE_INTRO_EXAMPLE",
          label: "Show example",
          label_key: "purpose.example",
        },
      ],
    },
  });

  const actionContract = ((finalized.ui as Record<string, unknown> | undefined)?.action_contract ||
    {}) as Record<string, unknown>;
  const actions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>)
    : [];
  const actionCodes = new Set(actions.map((entry) => String(entry.action_code || "").trim()));
  const roleSet = new Set(actions.map((entry) => String(entry.role || "").trim()));
  assert.equal(actionCodes.has("ACTION_PURPOSE_INTRO_DEFINE"), true);
  assert.equal(actionCodes.has("ACTION_PURPOSE_INTRO_EXAMPLE"), true);
  assert.equal(actionCodes.has("ACTION_TEXT_SUBMIT"), true);
  assert.equal(actionCodes.has("ACTION_START"), false);
  assert.equal(actionCodes.has("ACTION_DREAM_SWITCH_TO_SELF"), false);
  assert.equal(roleSet.has("choice"), true);
  assert.equal(roleSet.has("text_submit"), true);
});

test("MCP app contract: interactive actions get non-empty client_action_id echo server-side", () => {
  assert.match(source, /function buildServerClientActionId\(/);
  assert.match(source, /!existingClientActionId[\s\S]*buildServerClientActionId\(\{ action, correlationId \}\)/);
  assert.match(source, /__client_action_id:\s*clientActionId/);
  assert.match(source, /client_action_id_present:\s*clientActionId \? "true" : "false"/);
});

test("MCP app contract: transport context realigns internal host session id to bootstrap tuple", () => {
  assert.match(source, /function alignInternalHostWidgetSessionId\(/);
  assert.match(source, /host_session_id_realigned_to_bootstrap/);
  assert.match(source, /realign_reason:\s*"internal_host_mismatch"/);
});

test("MCP app contract: ready endpoint includes correlation tracing + diagnostics reference", () => {
  assert.match(source, /"ready_endpoint_read"/);
  assert.match(source, /run_step_compatibility:\s*RUN_STEP_TOOL_COMPAT_POLICY,/);
  assert.match(source, /diagnostics_endpoint:\s*"\/diagnostics"/);
});

test("MCP app contract: trace id is propagated into run_step flow and logs", () => {
  assert.match(source, /trace_id\?: string/);
  assert.match(source, /__trace_id/);
  assert.match(source, /trace_id: traceId/);
});
