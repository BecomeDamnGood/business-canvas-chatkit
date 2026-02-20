import test from "node:test";
import assert from "node:assert/strict";
import { STRATEGY_INSTRUCTIONS } from "./strategy.js";

test("Strategy instructions keep button/menu routing contract-driven (no fixed button labels)", () => {
  const text = STRATEGY_INSTRUCTIONS;
  assert.ok(
    text.includes("Button labels and navigation are contract-driven in runtime via contract_id + action_codes."),
    "instructions must explicitly keep button/menu routing contract-driven"
  );
  assert.ok(
    !text.includes('Always include: "1) Explain why a Strategy matters"'),
    "instructions must not force fixed button labels"
  );
});
