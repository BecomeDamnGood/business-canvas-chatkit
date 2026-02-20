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

test("Strategy instructions require bullet examples and avoid duplicate reformulation prose", () => {
  const text = STRATEGY_INSTRUCTIONS;
  assert.ok(
    text.includes('followed by 2-3 example focus points as DASH bullets, each on its own new line and each starting with "- "'),
    "instructions must require dash bullets in the For example block"
  );
  assert.ok(
    !text.includes('I\'ve reformulated this as a positive focus choice: [positive version]. This makes it clearer what the company will focus on, rather than what it avoids.'),
    "instructions must not force duplicated reformulation prose"
  );
});

test("Strategy instructions enforce 4-7 focus points and include consolidate route", () => {
  const text = STRATEGY_INSTRUCTIONS;
  assert.ok(
    text.includes("Minimum 4, maximum 7."),
    "instructions must enforce 4-7 strategy focus points"
  );
  assert.ok(
    text.includes('"__ROUTE__STRATEGY_CONSOLIDATE__"'),
    "instructions must define a dedicated consolidate route token"
  );
  assert.equal(
    text.includes("Minimum 3, maximum 5."),
    false,
    "instructions must no longer contain old 3-5 hard rule"
  );
});
