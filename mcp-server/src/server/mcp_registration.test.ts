import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RUN_STEP_TOOL_ANNOTATIONS,
  RUN_STEP_TOOL_SECURITY_SCHEMES,
} from "./mcp_registration.js";

test("run_step tool metadata matches non-readonly stateful behavior", () => {
  assert.equal(RUN_STEP_TOOL_ANNOTATIONS.readOnlyHint, false);
  assert.equal(RUN_STEP_TOOL_ANNOTATIONS.openWorldHint, false);
  assert.equal(RUN_STEP_TOOL_ANNOTATIONS.destructiveHint, false);
  assert.equal(RUN_STEP_TOOL_ANNOTATIONS.idempotentHint, false);

  assert.equal(Array.isArray(RUN_STEP_TOOL_SECURITY_SCHEMES), true);
  assert.equal(RUN_STEP_TOOL_SECURITY_SCHEMES.length, 1);
  assert.equal(RUN_STEP_TOOL_SECURITY_SCHEMES[0]?.type, "noauth");
});

test("resource metadata includes OpenAI standard ui.csp/domain plus compatibility aliases", () => {
  const source = readFileSync(new URL("./mcp_registration.ts", import.meta.url), "utf8");

  assert.match(source, /const widgetUiCsp = \{/);
  assert.match(source, /connectDomains:/);
  assert.match(source, /resourceDomains:/);
  assert.match(source, /frameDomains,/);
  assert.match(source, /ui:\s*\{\s*csp:\s*widgetUiCsp,/);
  assert.match(source, /widgetOrigin \? \{ domain: widgetOrigin \} : \{\}/);
  assert.match(source, /"openai\/widgetCSP": widgetCompatCsp/);
  assert.match(source, /"openai\/widgetDomain": widgetOrigin/);
});
