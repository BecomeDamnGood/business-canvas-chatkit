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
    fieldForStep: (stepId: string) => (stepId === "targetgroup" ? "targetgroup" : ""),
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
