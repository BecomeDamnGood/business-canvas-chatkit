import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../server.ts", import.meta.url), "utf8");

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

test("MCP app contract: trace id is propagated into run_step flow and logs", () => {
  assert.match(source, /trace_id\?: string/);
  assert.match(source, /__trace_id/);
  assert.match(source, /trace_id: traceId/);
});
