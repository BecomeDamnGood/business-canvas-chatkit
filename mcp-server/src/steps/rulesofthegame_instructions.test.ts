import test from "node:test";
import assert from "node:assert/strict";
import { RULESOFTHEGAME_INSTRUCTIONS } from "./rulesofthegame.js";

test("Rules of the Game instructions include full required output schema fields", () => {
  const text = RULESOFTHEGAME_INSTRUCTIONS;
  assert.ok(text.includes('"action": "INTRO" | "ASK" | "REFINE"  | "ESCAPE"'));
  assert.ok(text.includes('"message": "string"'));
  assert.ok(text.includes('"question": "string"'));
  assert.ok(text.includes('"refined_formulation": "string"'));
  assert.ok(text.includes('"rulesofthegame": "string"'));
  assert.ok(text.includes('"wants_recap": "boolean"'));
  assert.ok(text.includes('"is_offtopic": "boolean"'));
  assert.ok(text.includes('"statements": ["array of strings"]'));
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
