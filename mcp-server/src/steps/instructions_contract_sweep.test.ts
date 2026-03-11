import test from "node:test";
import assert from "node:assert/strict";
import { DREAM_INSTRUCTIONS } from "./dream.js";
import { DREAM_EXPLAINER_INSTRUCTIONS } from "./dream_explainer.js";
import { PURPOSE_INSTRUCTIONS } from "./purpose.js";
import { BIGWHY_INSTRUCTIONS } from "./bigwhy.js";
import { ROLE_INSTRUCTIONS } from "./role.js";
import { ENTITY_INSTRUCTIONS } from "./entity.js";
import { STRATEGY_INSTRUCTIONS } from "./strategy.js";
import { TARGETGROUP_INSTRUCTIONS, buildTargetGroupSpecialistInput } from "./targetgroup.js";
import { PRODUCTSSERVICES_INSTRUCTIONS, buildProductsServicesSpecialistInput } from "./productsservices.js";
import { RULESOFTHEGAME_INSTRUCTIONS } from "./rulesofthegame.js";
import { PRESENTATION_INSTRUCTIONS } from "./presentation.js";
import { buildExplainLightInstructions } from "./explain_profile.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";

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
    [
      /\bthis is a multi-agent canvas workflow running on openai language models\b/i,
      "non-step0 instructions must not hardcode model meta answers",
    ],
    [
      /\btopic-specific answers:\b/i,
      "non-step0 instructions must not contain hardcoded meta topic answer blocks",
    ],
    [
      /\bnow,\s*back to\s+(dream|dream exercise|purpose|big why|role|entity|strategy)\b/i,
      "non-step0 instructions must not contain hardcoded step-specific meta redirects",
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

test("menu-exposed content routes are explicitly documented in step instructions", () => {
  const instructionTextsByStep = new Map<string, string>([
    ["dream", `${DREAM_INSTRUCTIONS}\n${DREAM_EXPLAINER_INSTRUCTIONS}`],
    ["purpose", PURPOSE_INSTRUCTIONS],
    ["bigwhy", BIGWHY_INSTRUCTIONS],
    ["role", ROLE_INSTRUCTIONS],
    ["entity", ENTITY_INSTRUCTIONS],
    ["strategy", STRATEGY_INSTRUCTIONS],
    ["targetgroup", TARGETGROUP_INSTRUCTIONS],
    ["productsservices", PRODUCTSSERVICES_INSTRUCTIONS],
    ["rulesofthegame", RULESOFTHEGAME_INSTRUCTIONS],
    ["presentation", PRESENTATION_INSTRUCTIONS],
  ]);
  const menuActionCodes = new Set(
    Object.values(ACTIONCODE_REGISTRY.menus).flatMap((codes) =>
      Array.isArray(codes) ? codes.map((code) => String(code || "").trim()).filter(Boolean) : []
    )
  );
  const shouldEnforceRouteDocumentation = (route: string): boolean => {
    if (!route.startsWith("__ROUTE__")) return false;
    if (/_CONTINUE__$/.test(route)) return false;
    if (/_FINAL_CONTINUE__$/.test(route)) return false;
    if (/_CONFIRM_SATISFIED__$/.test(route)) return false;
    return true;
  };

  for (const [actionCode, entry] of Object.entries(ACTIONCODE_REGISTRY.actions)) {
    if (!menuActionCodes.has(actionCode)) continue;
    const stepId = String(entry.step || "").trim();
    const route = String(entry.route || "").trim();
    if (!instructionTextsByStep.has(stepId)) continue;
    if (!shouldEnforceRouteDocumentation(route)) continue;
    const text = instructionTextsByStep.get(stepId) || "";
    assert.ok(
      text.includes(route),
      `${stepId} instructions must explicitly document menu route ${route} from ${actionCode}`
    );
  }
});

test("non-step0 meta sections declare runtime-owned meta rendering", () => {
  const mustDeclareRuntimeOwnedMeta: Array<[string, string]> = [
    ["dream", DREAM_INSTRUCTIONS],
    ["dream_explainer", DREAM_EXPLAINER_INSTRUCTIONS],
    ["purpose", PURPOSE_INSTRUCTIONS],
    ["bigwhy", BIGWHY_INSTRUCTIONS],
    ["role", ROLE_INSTRUCTIONS],
    ["entity", ENTITY_INSTRUCTIONS],
    ["strategy", STRATEGY_INSTRUCTIONS],
  ];
  for (const [stepId, text] of mustDeclareRuntimeOwnedMeta) {
    assert.ok(
      text.includes("Runtime owns the final meta wording and redirect behavior."),
      `${stepId} must delegate meta copy rendering to runtime`
    );
  }
});

test("targetgroup/productsservices planner input does not duplicate STATE FINALS context", () => {
  const targetInput = buildTargetGroupSpecialistInput(
    "USER_MESSAGE: define my segment",
    "targetgroup",
    "targetgroup",
    "nl"
  );
  const productsInput = buildProductsServicesSpecialistInput(
    "USER_MESSAGE: we offer workshops",
    "productsservices",
    "productsservices",
    "nl",
    ["Workshops", "Implementation guidance"]
  );
  for (const input of [targetInput, productsInput]) {
    assert.ok(input.includes("INTRO_SHOWN_FOR_STEP:"), "planner input must include intro marker");
    assert.ok(input.includes("CURRENT_STEP:"), "planner input must include current step marker");
    assert.ok(input.includes("LANGUAGE: nl"), "planner input must include language marker when known");
    assert.ok(input.includes("PLANNER_INPUT:"), "planner input must include planner payload");
    assert.equal(
      input.includes("STATE FINALS:"),
      false,
      "planner input must not embed STATE FINALS context; context is injected in system instructions"
    );
  }
  assert.ok(productsInput.includes('PREVIOUS_STATEMENTS: ["Workshops","Implementation guidance"]'));
  assert.ok(productsInput.includes("PREVIOUS_STATEMENT_COUNT: 2"));
});

test("explain-light profile keeps schema and route sections while shrinking non-essential sections", () => {
  const compact = buildExplainLightInstructions(PURPOSE_INSTRUCTIONS);
  assert.ok(
    compact.includes("EXPLAIN-LIGHT PROFILE (token-optimized)"),
    "compact explain profile marker must be present"
  );
  assert.ok(
    compact.includes("OUTPUT SCHEMA"),
    "compact explain profile must preserve output schema section"
  );
  assert.ok(
    compact.includes("ACTION CODES AND ROUTE TOKENS") ||
      compact.includes("__ROUTE__") ||
      compact.includes("ACTION_") ||
      compact.includes("Route handling: treat REQUEST_EXPLANATION"),
    "compact explain profile must preserve action-code/route semantics"
  );
  assert.ok(
    compact.includes("EXPLAIN"),
    "compact explain profile must preserve explain behavior section"
  );
  assert.equal(
    compact.includes("FIVE-QUESTION MODE"),
    false,
    "compact explain profile should drop full ask/refine sections that are not needed for explain turns"
  );
});

test("presentation instructions do not inject CTA copy that belongs to runtime buttons or prompts", () => {
  assert.equal(
    PRESENTATION_INSTRUCTIONS.includes("Create The Business Strategy Canvas Builder Presentation"),
    false
  );
  assert.equal(
    PRESENTATION_INSTRUCTIONS.includes("Tell me what to adjust or create your presentation"),
    false
  );
});
