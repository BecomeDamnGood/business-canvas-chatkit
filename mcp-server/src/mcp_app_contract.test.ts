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

test("MCP app contract: run_step owns outputTemplate + widgetAccessible", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/outputTemplate": uiResourceUri/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/widgetAccessible": true/);
});

test("MCP app contract: run_step visibility remains model+app", () => {
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\]/);
});
