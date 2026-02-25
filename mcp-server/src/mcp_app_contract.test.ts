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
  assert.match(source, /const ToolStructuredContentOutputSchema = z\.object\(/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*outputSchema:\s*ToolStructuredContentOutputSchema/);
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
  assert.match(fnBody, /model_result_shape_version:\s*"v2_minimal"/);
  assert.match(fnBody, /\bok:\s*result\.ok === true/);
  assert.match(fnBody, /\btool:\s*safeString\(result\.tool \|\| "run_step"\)/);
  assert.match(fnBody, /\bcurrent_step_id:\s*currentStep/);
  assert.match(fnBody, /\bstate:\s*safeState/);
  assert.doesNotMatch(fnBody, /\bprompt\s*:/);
  assert.doesNotMatch(fnBody, /\bspecialist\s*:/);
  assert.doesNotMatch(fnBody, /\berror\s*:/);
});
