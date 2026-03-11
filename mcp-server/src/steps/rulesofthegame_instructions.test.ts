import test from "node:test";
import assert from "node:assert/strict";
import { RULESOFTHEGAME_INSTRUCTIONS } from "./rulesofthegame.js";

test("Rules of the Game instructions include full required output schema fields", () => {
  const text = RULESOFTHEGAME_INSTRUCTIONS;
  assert.match(text, /"action"\s*:\s*"INTRO"\s*\|\s*"ASK"\s*\|\s*"REFINE"\s*\|\s*"ESCAPE"/);
  assert.match(text, /"message"\s*:\s*"string"/);
  assert.match(text, /"question"\s*:\s*"string"/);
  assert.match(text, /"refined_formulation"\s*:\s*"string"/);
  assert.match(text, /"rulesofthegame"\s*:\s*"string"/);
  assert.match(text, /"statements"\s*:\s*\["array of strings"\]/);
});

test("Rules of the Game instructions use canonical contract block and deterministic escape semantics", () => {
  const text = RULESOFTHEGAME_INSTRUCTIONS;
  assert.ok(
    text.includes("CANONICAL OUTPUT CONTRACT (HARD)"),
    "instructions must include canonical contract block"
  );
  assert.ok(
    text.includes('Standard ESCAPE output (use the user’s language)\n- action="ESCAPE"'),
    "ESCAPE section must be explicit and deterministic"
  );
});

test("Rules of the Game instructions do not contain contradictory field-discipline legacy lines", () => {
  const text = RULESOFTHEGAME_INSTRUCTIONS;
  assert.equal(
    text.includes('Never output action="ASK" with rulesofthegame="" unless it is the proceed signal case.'),
    false,
    "legacy proceed-signal conflict must not remain in instructions"
  );
  assert.equal(
    text.includes('INTRO: message+question non-empty; refined_formulation=""; question=""; rulesofthegame=""; statements=[]'),
    false,
    "legacy contradictory INTRO line must not remain"
  );
  assert.equal(
    text.includes('ASK: question non-empty; message may be non-empty; refined_formulation=""; question=""; rulesofthegame=""; statements=full list (PREVIOUS_STATEMENTS + new if accepted)'),
    false,
    "legacy contradictory ASK line must not remain"
  );
  assert.equal(
    text.includes('ASK (normal): refined_formulation and rulesofthegame contain bullets; question non-empty; question empty; statements=unchanged (all collected statements)'),
    false,
    "legacy contradictory ASK(normal) line must not remain"
  );
});

test("Rules of the Game instructions keep local proposals pending instead of rewriting the whole set", () => {
  const text = RULESOFTHEGAME_INSTRUCTIONS;
  assert.ok(
    text.includes("Rules of the Game are incremental and conservative by default."),
    "instructions must explicitly prefer local incremental rules handling"
  );
  assert.ok(
    text.includes("Do NOT silently commit an interpreted proposal as if it were already final."),
    "instructions must keep free-text rules proposals in suggestion flow"
  );
  assert.ok(
    text.includes("A full 3 to 5 rule rewrite is the exception, not the default."),
    "instructions must explicitly demote full-set rules rewrites to fallback behavior"
  );
  assert.equal(
    text.includes("When you abstract an operational rule into a broader Rule of the Game, the abstracted rule is automatically accepted"),
    false,
    "instructions must no longer auto-accept rewritten rules"
  );
});
