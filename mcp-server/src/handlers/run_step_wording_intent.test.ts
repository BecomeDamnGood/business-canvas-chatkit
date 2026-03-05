import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepWordingHelpers } from "./run_step_wording.js";

function buildHelpers(intentEnabled: boolean) {
  return createRunStepWordingHelpers({
    step0Id: "step0",
    dreamStepId: "dream",
    strategyStepId: "strategy",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    entityStepId: "entity",
    dreamExplainerSpecialist: "DreamExplainer",
    normalizeDreamRuntimeMode: () => "self",
    uiDefaultString: () => "",
    uiStringFromStateMap: (_state, _key, fallback) => fallback,
    fieldForStep: (stepId: string) => {
      if (stepId === "targetgroup") return "targetgroup";
      if (stepId === "strategy") return "strategy";
      if (stepId === "productsservices") return "productsservices";
      if (stepId === "rulesofthegame") return "rulesofthegame";
      return "";
    },
    parseListItems: (input: string) =>
      String(input || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    splitSentenceItems: (input: string) =>
      String(input || "")
        .split(/[.!?]+\s+/)
        .map((line) => line.trim())
        .filter(Boolean),
    normalizeListUserInput: (input: string) => String(input || "").trim(),
    normalizeLightUserInput: (input: string) => String(input || "").trim(),
    normalizeUserInputAgainstSuggestion: (input: string) => String(input || "").trim(),
    canonicalizeComparableText: (input: string) =>
      String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    stripChoiceInstructionNoise: (input: string) => String(input || "").trim(),
    tokenizeWords: (input: string) =>
      String(input || "")
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    isMaterialRewriteCandidate: () => true,
    shouldTreatAsStepContributingInput: () => true,
    pickDualChoiceSuggestion: (_stepId, specialistResult) =>
      String((specialistResult as Record<string, unknown>)?.refined_formulation || "").trim(),
    areEquivalentWordingVariants: () => false,
    normalizeEntityPhrase: (input: string) => String(input || "").trim(),
    withProvisionalValue: (state) => state,
    renderFreeTextTurnPolicy: () => ({
      specialist: {},
      contractId: "",
      contractVersion: "",
      textKeys: [],
    }),
    applyUiPhaseByStep: () => {},
    isUiWordingFeedbackKeyedV1Enabled: () => false,
    isWordingChoiceIntentV1Enabled: () => intentEnabled,
    bumpUiI18nCounter: () => {},
    wordingSelectionMessage: () => "",
  });
}

test("buildWordingChoiceFromTurn marks clarify_dual variant for disambiguation context", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "targetgroup",
    state: {} as any,
    activeSpecialist: "TargetGroup",
    previousSpecialist: {
      question:
        "Do you mean companies with complex products? Or do you mean companies with complex services?",
    },
    specialistResult: {
      message: "Doelgroep kiezen draait om focus.",
      refined_formulation: "Industrial manufacturers with technical product development.",
    },
    userTextRaw: "I mean all companies that develop and produce complex products.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.variant, "clarify_dual");
  assert.equal(result.wordingChoice?.user_label, "Do you mean something like this");
  assert.equal(result.wordingChoice?.suggestion_label, "Or do you mean something like this?");
});

test("buildWordingChoiceFromTurn keeps default variant for regular rewrite context", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "targetgroup",
    state: {} as any,
    activeSpecialist: "TargetGroup",
    previousSpecialist: {
      question: "Welke doelgroep past het best bij jouw focus?",
    },
    specialistResult: {
      message: "Een scherpere formulering helpt je later bij strategie.",
      refined_formulation: "Industrial manufacturers with technical product development.",
    },
    userTextRaw: "I mean all companies that develop and produce complex products.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.variant, undefined);
});

test("buildWordingChoiceFromTurn treats remove-line requests as list edit intent in business list steps", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "productsservices",
    state: {
      active_specialist: "ProductsAndServices",
    } as any,
    activeSpecialist: "ProductsAndServices",
    previousSpecialist: {
      statements: [
        "AI-compatible websites and apps",
        "AI-tools and support",
        "Branding",
        "Strategy",
        "The rest we do not do",
      ],
      productsservices: [
        "AI-compatible websites and apps",
        "AI-tools and support",
        "Branding",
        "Strategy",
        "The rest we do not do",
      ].join("\n"),
    },
    specialistResult: {
      message: "This is what your current offer looks like.",
      refined_formulation: [
        "AI-compatible websites and apps",
        "AI-tools and support",
        "Branding",
        "Strategy",
      ].join("\n"),
      statements: [
        "AI-compatible websites and apps",
        "AI-tools and support",
        "Branding",
        "Strategy",
      ],
    },
    userTextRaw: 'Remove "The rest we do not do".',
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.deepEqual(result.wordingChoice?.user_items, [
    "AI-compatible websites and apps",
    "AI-tools and support",
    "Branding",
    "Strategy",
  ]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, [
    "AI-compatible websites and apps",
    "AI-tools and support",
    "Branding",
    "Strategy",
  ]);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_list_semantics || ""), "full");
});

test("applyWordingPickSelection keeps removals when user picks own edited list", () => {
  const helpers = buildHelpers(true);
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "productsservices",
    routeToken: "__WORDING_PICK_USER__",
    state: {
      current_step: "productsservices",
      active_specialist: "ProductsAndServices",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "productsservices",
        wording_choice_list_semantics: "full",
        wording_choice_base_items: [
          "AI-compatible websites and apps",
          "AI-tools and support",
          "Branding",
          "Strategy",
          "The rest we do not do",
        ],
        wording_choice_user_items: [
          "AI-compatible websites and apps",
          "AI-tools and support",
          "Branding",
          "Strategy",
        ],
        wording_choice_suggestion_items: [
          "AI-compatible websites and apps",
          "AI-tools and support",
          "Branding",
          "Strategy",
        ],
        wording_choice_user_normalized: [
          "AI-compatible websites and apps",
          "AI-tools and support",
          "Branding",
          "Strategy",
        ].join("\n"),
        wording_choice_agent_current: [
          "AI-compatible websites and apps",
          "AI-tools and support",
          "Branding",
          "Strategy",
        ].join("\n"),
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.deepEqual(
    (applyResult.specialist.statements as string[]) || [],
    ["AI-compatible websites and apps", "AI-tools and support", "Branding", "Strategy"]
  );
  assert.equal(
    String((applyResult.specialist.productsservices as string) || ""),
    ["AI-compatible websites and apps", "AI-tools and support", "Branding", "Strategy"].join("\n")
  );
});
