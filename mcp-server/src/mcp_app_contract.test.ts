import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const widgetRuntimeSource = fs.readFileSync(
  new URL("../ui/lib/locale_bootstrap_runtime.ts", import.meta.url),
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

test("MCP app contract: local /run_step bridge enforces ToolStructuredContentOutputSchema", () => {
  assert.match(source, /if \(req\.method === "POST" && url\.pathname === "\/run_step"\)/);
  assert.match(source, /const parsedStructuredContent = RunStepToolStructuredContentOutputSchema\.parse\(structuredContent\)/);
  assert.match(source, /JSON\.stringify\(\{ structuredContent: parsedStructuredContent, \.\.\.\(meta \? \{ _meta: meta \} : \{\}\) \}\)/);
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

test("MCP wrapper parity: structuredContent.result is always model-safe and _meta.widget_result keeps full payload", () => {
  assert.match(source, /const modelResult = buildModelSafeResult\(staleResult\)/);
  assert.match(source, /const modelResult = buildModelSafeResult\(resultForClient\)/);
  assert.match(source, /const modelResult = buildModelSafeResult\(fallbackResult as Record<string, unknown>\)/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*staleResult\s*\}/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*resultForClient\s*,?\s*\}/);
  assert.match(source, /meta:\s*\{\s*widget_result:\s*fallbackResult\s*,?\s*\}/);
});

test("MCP app contract: widget render-state resolves _meta.widget_result first with compatible fallback paths", () => {
  assert.match(widgetRuntimeSource, /export function canonicalizeWidgetPayload\(/);
  assert.match(widgetRuntimeSource, /const candidate = meta\.widget_result/);
  assert.match(widgetRuntimeSource, /const mergedToolOutput = mergeToolOutputWithResponseMetadata\(/);
  assert.match(widgetRuntimeSource, /bootstrap_session_id/);
  assert.match(widgetRuntimeSource, /bootstrap_epoch/);
  assert.match(widgetRuntimeSource, /response_seq/);
  assert.match(widgetRuntimeSource, /host_widget_session_id/);
  assert.match(widgetRuntimeSource, /const rootResult = toRecord\(root\.result\)/);
  assert.match(widgetRuntimeSource, /source:\s*"meta\.widget_result"/);
  assert.match(widgetRuntimeSource, /source:\s*"root\.result"/);
  assert.match(widgetRuntimeSource, /source:\s*"structuredContent\.result"/);
  assert.match(widgetRuntimeSource, /reason_code:\s*selected\.reason_code/);
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

test("MCP app contract: lifecycle logs expose explicit accept/drop/rebase reason-codes", () => {
  assert.match(source, /accept_reason_code:\s*staleRebaseApplied \? "accepted_after_stale_rebase" : "accepted_fresh_dispatch"/);
  assert.match(source, /drop_reason_code:\s*"host_session_mismatch"/);
  assert.match(source, /rebase_reason_code:\s*"stale_interactive_action_rebased"/);
});

test("MCP app contract: stale interactive rebase policy is explicitly limited to ACTION_START", () => {
  assert.match(source, /const REBASE_ELIGIBLE_INTERACTIVE_ACTIONS = new Set<string>\(\["ACTION_START"\]\);/);
  assert.match(source, /staleInteractiveActionPolicy\.rebaseEligible/);
  assert.match(source, /stale_policy_reason_code:\s*staleInteractiveActionPolicy\.reasonCode/);
});

test("MCP app contract: stale ingest/rebase rollout flags are explicit and default-safe", () => {
  assert.match(source, /const RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED = envFlagEnabled\("RUN_STEP_STALE_INGEST_GUARD_V1", false\);/);
  assert.match(source, /const RUN_STEP_STALE_REBASE_V1_ENABLED = envFlagEnabled\("RUN_STEP_STALE_REBASE_V1", false\);/);
  assert.match(source, /if \(incomingOrdering\.sessionId && incomingOrdering\.epoch > 0 && staleIngestGuardEnabled\)/);
  assert.match(source, /staleCheck\.reason !== "host_session" &&[\s\S]*staleRebaseEnabled[\s\S]*staleInteractiveActionPolicy\.rebaseEligible/);
  assert.match(source, /drop_reason_code:\s*dropReasonCode/);
  assert.match(source, /stale_rebase_flag_disabled/);
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
  assert.match(source, /render_source_tuple_complete:\s*hasCompleteOrderingTuple\(renderSourceOrdering\)/);
  assert.match(source, /host_widget_session_id_present:\s*renderSourceOrdering\.hostWidgetSessionId \? "true" : "false"/);
  assert.match(source, /meta_widget_result_authoritative/);
});

test("MCP app contract: run_step wrapper enforces and logs top-level vs meta ordering tuple parity", () => {
  assert.match(source, /ensureRunStepOutputTupleParity\(/);
  assert.match(source, /"run_step_output_tuple_parity_patched"/);
  assert.match(source, /"run_step_ordering_tuple_parity"/);
  assert.match(source, /top_level_tuple_complete:/);
  assert.match(source, /meta_widget_result_tuple_complete:/);
  assert.match(source, /tuple_parity_match:/);
  assert.match(source, /parity_reason_code:/);
});

test("MCP app contract: run_step response logs view-contract guard observability event", () => {
  assert.match(runStepResponseSource, /"run_step_view_contract_guard"/);
  assert.match(runStepResponseSource, /started,/);
  assert.match(runStepResponseSource, /ui_view_mode:/);
  assert.match(runStepResponseSource, /has_renderable_content:/);
  assert.match(runStepResponseSource, /has_start_action:/);
  assert.match(runStepResponseSource, /invariant_ok:/);
  assert.match(runStepResponseSource, /violation_reason_code:/);
  assert.match(runStepResponseSource, /guard_patch_applied:/);
});

test("MCP app contract: turn contract enforces and repairs step_0\/interactive view invariants", () => {
  assert.match(turnContractSource, /export function enforceRunStepViewContractGuard\(/);
  assert.match(turnContractSource, /step0_not_started_forced_prestart/);
  assert.match(turnContractSource, /interactive_missing_content_forced_prestart/);
  assert.match(turnContractSource, /interactive_missing_content_forced_blocked/);
  assert.match(turnContractSource, /interactive_requires_renderable_content/);
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
