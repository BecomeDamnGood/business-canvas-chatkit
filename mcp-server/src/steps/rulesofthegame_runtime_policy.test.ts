import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRulesRuntimePolicy,
  evaluateRulesRuntimeGate,
  RULESOFTHEGAME_MAX_RULES,
} from "./rulesofthegame_runtime_policy.js";

test("rules runtime gate blocks confirm when accepted list has fewer than 3 rules", () => {
  const gate = evaluateRulesRuntimeGate({
    acceptedOutput: true,
    acceptedValue: "• We communiceren proactief.\n• We komen afspraken na.",
    visibleValue: "",
    statements: [
      "We communiceren proactief.",
      "We komen afspraken na.",
    ],
    wordingChoicePending: false,
  });

  assert.equal(gate.count, 2);
  assert.equal(gate.canConfirm, false);
});

test("rules runtime policy enforces explicit choice when list exceeds maximum", () => {
  const result = applyRulesRuntimePolicy({
    specialist: {
      action: "ASK",
      message: "So far we have these 6 Rules of the Game.",
      statements: [
        "We communiceren proactief.",
        "We leveren op tijd.",
        "We nemen eigenaarschap.",
        "We werken met duidelijke scope.",
        "We borgen kwaliteit onder druk.",
        "We leren van fouten.",
      ],
    },
  });

  assert.equal(result.requiresChoice, true);
  assert.equal(String(result.specialist.wording_choice_pending || ""), "true");
  assert.equal(Array.isArray(result.specialist.wording_choice_suggestion_items), true);
  assert.equal((result.specialist.wording_choice_suggestion_items as string[]).length <= RULESOFTHEGAME_MAX_RULES, true);
});

test("rules runtime policy enforces internal suggestion for external phrasing", () => {
  const result = applyRulesRuntimePolicy({
    specialist: {
      action: "ASK",
      message: "So far we have these rules.",
      statements: [
        "Gratis is gratis voor iedereen.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
    },
  });

  assert.equal(result.requiresChoice, true);
  const suggestions = Array.isArray(result.specialist.wording_choice_suggestion_items)
    ? (result.specialist.wording_choice_suggestion_items as string[])
    : [];
  assert.equal(suggestions.some((line) => /prijsafspraken|pricing rules/i.test(String(line || ""))), true);
});
