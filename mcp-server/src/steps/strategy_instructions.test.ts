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
    text.includes('If helpful, add "For example:" followed by 2-3 DASH bullet examples in message only.'),
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

test("Strategy instructions keep local proposals pending instead of auto-committing full rewrites", () => {
  const text = STRATEGY_INSTRUCTIONS;
  assert.ok(
    text.includes("Strategy is incremental and conservative by default."),
    "instructions must explicitly prefer local incremental strategy handling"
  );
  assert.ok(
    text.includes("Do NOT silently commit an interpreted proposal as if it were already final."),
    "instructions must keep free-text strategy proposals in suggestion flow"
  );
  assert.ok(
    text.includes("A full 4 to 7 focus-point rewrite is the exception, not the default."),
    "instructions must explicitly demote full-set rewrites to fallback behavior"
  );
  assert.equal(
    text.includes("the reformulated statements are ALREADY added directly to statements in that same REFINE turn"),
    false,
    "instructions must no longer auto-accept refined strategy proposals"
  );
});
