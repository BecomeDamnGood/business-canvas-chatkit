import test from "node:test";
import assert from "node:assert/strict";
import { DREAM_INSTRUCTIONS } from "./dream.js";
import { DREAM_EXPLAINER_INSTRUCTIONS } from "./dream_explainer.js";
import { PURPOSE_INSTRUCTIONS } from "./purpose.js";
import { BIGWHY_INSTRUCTIONS } from "./bigwhy.js";
import { ROLE_INSTRUCTIONS } from "./role.js";
import { ENTITY_INSTRUCTIONS } from "./entity.js";
import { STRATEGY_INSTRUCTIONS } from "./strategy.js";
import { TARGETGROUP_INSTRUCTIONS } from "./targetgroup.js";
import { PRODUCTSSERVICES_INSTRUCTIONS } from "./productsservices.js";
import { RULESOFTHEGAME_INSTRUCTIONS } from "./rulesofthegame.js";
import { PRESENTATION_INSTRUCTIONS } from "./presentation.js";

const NON_STEP0_INSTRUCTIONS: Array<[string, string]> = [
  ["dream", DREAM_INSTRUCTIONS],
  ["dream_explainer", DREAM_EXPLAINER_INSTRUCTIONS],
  ["purpose", PURPOSE_INSTRUCTIONS],
  ["bigwhy", BIGWHY_INSTRUCTIONS],
  ["role", ROLE_INSTRUCTIONS],
  ["entity", ENTITY_INSTRUCTIONS],
  ["strategy", STRATEGY_INSTRUCTIONS],
  ["targetgroup", TARGETGROUP_INSTRUCTIONS],
  ["productsservices", PRODUCTSSERVICES_INSTRUCTIONS],
  ["rulesofthegame", RULESOFTHEGAME_INSTRUCTIONS],
  ["presentation", PRESENTATION_INSTRUCTIONS],
];

test("global instruction sweep removes legacy proceed-signal and contradictory field-discipline patterns", () => {
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [
      /Never output action="ASK" with [a-z_]+="" unless it is the proceed signal case/i,
      "legacy proceed-signal rule must be removed",
    ],
    [
      /message\+question non-empty;[^\n]*question=""/i,
      "message+question non-empty combined with question empty is contradictory",
    ],
    [
      /question non-empty;[^\n]*question empty/i,
      "question non-empty and question empty in same rule is contradictory",
    ],
    [
      /question non-empty;[^\n]*question=""/i,
      "question non-empty and question=\"\" in same rule is contradictory",
    ],
    [
      /- question:\s*""\s*\(empty\)\s*\n\s*-\s*question:\s*""\s*\(empty\)/i,
      "duplicate empty question lines in one output block are forbidden",
    ],
    [
      /- question=""\s*\n\s*-\s*question=""/i,
      "duplicate question=\"\" lines in one output block are forbidden",
    ],
    [
      /\bif off-topic,\s*output ask\b/i,
      "off-topic handling must not instruct ASK; use ESCAPE contract",
    ],
    [
      /\bstandard escape output[\s\S]{0,260}-\s*action="ask"/i,
      "standard ESCAPE block must not use action=ASK",
    ],
    [
      /\bquestion:\s*ask whether to continue to the next step\b/i,
      "legacy keep-as-written continue-question rule must be removed",
    ],
  ];

  for (const [stepId, text] of NON_STEP0_INSTRUCTIONS) {
    for (const [pattern, reason] of forbiddenPatterns) {
      assert.equal(
        pattern.test(text),
        false,
        `${stepId} violates global instruction contract: ${reason}`
      );
    }
  }
});

test("core steps explicitly declare runtime contract-driven menu/button routing", () => {
  const mustDeclare: Array<[string, string]> = [
    ["bigwhy", BIGWHY_INSTRUCTIONS],
    ["role", ROLE_INSTRUCTIONS],
    ["entity", ENTITY_INSTRUCTIONS],
    ["strategy", STRATEGY_INSTRUCTIONS],
    ["rulesofthegame", RULESOFTHEGAME_INSTRUCTIONS],
  ];
  for (const [stepId, text] of mustDeclare) {
    assert.ok(
      text.includes("Menu/buttons are runtime contract-driven via contract_id + action_codes."),
      `${stepId} must explicitly declare runtime contract-driven routing`
    );
  }
});
