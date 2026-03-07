import test from "node:test";
import assert from "node:assert/strict";

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
