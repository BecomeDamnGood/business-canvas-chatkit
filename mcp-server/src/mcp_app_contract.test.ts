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

test("MCP app contract: open_canvas and run_step are registered with title\/description\/inputSchema", () => {
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*title:[\s\S]*description:[\s\S]*inputSchema:/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*title:[\s\S]*description:[\s\S]*inputSchema:/);
});

test("MCP app contract: open_canvas owns outputTemplate and run_step does not", () => {
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*"openai\/outputTemplate": uiResourceUri/);
  assert.doesNotMatch(source, /server\.registerTool\(\s*"run_step"[\s\S]*"openai\/outputTemplate": uiResourceUri/);
});

test("MCP app contract: compat-first visibility remains model+app for both tools", () => {
  assert.match(source, /server\.registerTool\(\s*"open_canvas"[\s\S]*visibility:\s*\["model",\s*"app"\]/);
  assert.match(source, /server\.registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\]/);
});
