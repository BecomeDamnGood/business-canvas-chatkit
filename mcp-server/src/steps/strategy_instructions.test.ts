import test from "node:test";
import assert from "node:assert/strict";
import { STRATEGY_INSTRUCTIONS } from "./strategy.js";

test("Strategy instructions mention Target Group for next-step labels", () => {
  const text = STRATEGY_INSTRUCTIONS;
  assert.ok(
    text.includes("I'm satisfied with my Strategy. Let's go to Target Group"),
    "instructions must use Target Group in the satisfied label"
  );
  assert.ok(
    text.includes("Continue to next step Target Group"),
    "instructions must use Target Group in the continue label"
  );
});
