import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepWordingHelpers } from "./run_step_wording.js";

function buildHelpers(intentEnabled: boolean) {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wordingChoice.chooseVersion": "Choose this version",
    "wordingChoice.useInputFallback": "Use this input",
  };
  return createRunStepWordingHelpers({
    step0Id: "step0",
    presentationStepId: "presentation",
    dreamStepId: "dream",
    strategyStepId: "strategy",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    entityStepId: "entity",
    dreamExplainerSpecialist: "DreamExplainer",
    normalizeDreamRuntimeMode: () => "self",
    uiDefaultString: (key: string) => defaultUi[key] || "",
    uiStringFromStateMap: (_state, _key, fallback) => fallback,
    fieldForStep: (stepId: string) => {
      if (stepId === "dream") return "dream";
      if (stepId === "purpose") return "purpose";
      if (stepId === "bigwhy") return "bigwhy";
      if (stepId === "role") return "role";
      if (stepId === "entity") return "entity";
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

function buildHeadingAwarePurposeHelpers(params: {
  heading: string;
  suggestion: string;
  equivalent?: boolean;
}) {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wordingChoice.chooseVersion": "Choose this version",
    "wordingChoice.useInputFallback": "Use this input",
  };
  const canonicalize = (input: string) =>
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  return createRunStepWordingHelpers({
    step0Id: "step0",
    presentationStepId: "presentation",
    dreamStepId: "dream",
    strategyStepId: "strategy",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    entityStepId: "entity",
    dreamExplainerSpecialist: "DreamExplainer",
    normalizeDreamRuntimeMode: () => "self",
    uiDefaultString: (key: string) => defaultUi[key] || "",
    uiStringFromStateMap: (_state, _key, fallback) => fallback,
    fieldForStep: (stepId: string) => (stepId === "purpose" ? "purpose" : ""),
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
    canonicalizeComparableText: canonicalize,
    stripChoiceInstructionNoise: (input: string) => String(input || "").trim(),
    tokenizeWords: (input: string) =>
      String(input || "")
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    isMaterialRewriteCandidate: () => true,
    shouldTreatAsStepContributingInput: () => true,
    pickDualChoiceSuggestion: () => params.suggestion,
    areEquivalentWordingVariants: ({ userRaw, suggestionRaw }) =>
      params.equivalent !== undefined ? params.equivalent : canonicalize(userRaw) === canonicalize(suggestionRaw),
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
    isWordingChoiceIntentV1Enabled: () => true,
    bumpUiI18nCounter: () => {},
    wordingSelectionMessage: (_stepId, _state, _activeSpecialist, selectedValue = "") =>
      `${params.heading}\n\n${selectedValue}`.trim(),
  });
}

test("buildWordingChoiceFromTurn keeps targetgroup in canonical pending presentation", () => {
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

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn keeps canonical pending presentation for regular targetgroup rewrites", () => {
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

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn keeps Dream in canonical pending presentation for rough first input", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {} as any,
    activeSpecialist: "Dream",
    previousSpecialist: {},
    specialistResult: {
      message: "Een aangescherpte Droom helpt om later scherpe keuzes te maken.",
      refined_formulation: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      dream: "",
    } as Record<string, unknown>,
    userTextRaw: "Wij willen bedrijven helpen groeien.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn keeps Purpose in canonical pending presentation", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message: "Een aangescherpte Bestaansreden maakt je koers concreter.",
      refined_formulation: "Mindd bestaat om ondernemers helderheid te geven in strategische keuzes.",
      purpose: "",
    } as Record<string, unknown>,
    userTextRaw: "We willen ondernemers helpen.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn keeps Role in canonical pending presentation", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "role",
    state: {} as any,
    activeSpecialist: "Role",
    previousSpecialist: {},
    specialistResult: {
      message: "Een scherpe Rol maakt je positionering stabiel.",
      refined_formulation: "Mindd is de gids die ondernemers helpt koersvast te blijven.",
      role: "",
    } as Record<string, unknown>,
    userTextRaw: "Wij zijn een adviesbureau.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn skips wording panel for meta-topic turns", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "targetgroup",
    state: {} as any,
    activeSpecialist: "TargetGroup",
    previousSpecialist: {},
    specialistResult: {
      message: "Meta response",
      refined_formulation: "Industrial manufacturers with technical product development.",
      user_intent: "STEP_INPUT",
      meta_topic: "NO_STARTING_POINT",
    },
    userTextRaw: "I don't know what I want yet.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
});

test("buildWordingChoiceFromTurn skips wording panel when user intent is not step input", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "targetgroup",
    state: {} as any,
    activeSpecialist: "TargetGroup",
    previousSpecialist: {},
    specialistResult: {
      message: "Meta response",
      refined_formulation: "Industrial manufacturers with technical product development.",
      user_intent: "META_QUESTION",
      meta_topic: "NONE",
    },
    userTextRaw: "Who is Ben?",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
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

test("buildWordingChoiceFromTurn never enables wording-choice for presentation step", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "presentation",
    state: {} as any,
    activeSpecialist: "Presentation",
    previousSpecialist: {
      question: "Wil je nog iets aanpassen of je presentatie maken?",
    },
    specialistResult: {
      message: "Dit is wat je zei.",
      refined_formulation: "Samenvatting",
      presentation_brief: "Samenvatting",
    } as Record<string, unknown>,
    userTextRaw: "Maak dit professioneler en korter.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
});

test("buildWordingChoiceFromTurn strips markup from canonical pending wording fields", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "targetgroup",
    state: {} as any,
    activeSpecialist: "TargetGroup",
    previousSpecialist: {
      question: "Welke doelgroep bedoel je precies?",
    },
    specialistResult: {
      message: "Ik heb een suggestie gemaakt.",
      refined_formulation: "<strong>Technische mkb-bedrijven</strong> met complexe vraagstukken.",
    } as Record<string, unknown>,
    userTextRaw: "<strong>bedrijven</strong> met complexe producten",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
  assert.doesNotMatch(
    String((result.specialist as Record<string, unknown>).wording_choice_user_normalized || ""),
    /<[^>]+>/
  );
  assert.doesNotMatch(
    String((result.specialist as Record<string, unknown>).wording_choice_agent_current || ""),
    /<[^>]+>/
  );
});

test("applyWordingPickSelection strips markup before committing selected wording", () => {
  const helpers = buildHelpers(true);
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "targetgroup",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "targetgroup",
      active_specialist: "TargetGroup",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "targetgroup",
        wording_choice_user_normalized: "bedrijven met complexe producten",
        wording_choice_agent_current: "<strong>Technische mkb-bedrijven</strong> met complexe vraagstukken.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.doesNotMatch(String(applyResult.specialist.refined_formulation || ""), /<[^>]+>/);
  assert.doesNotMatch(String(applyResult.specialist.targetgroup || ""), /<[^>]+>/);
});

test("buildWordingChoiceFromTurn unwraps current-context heading before equivalence check", () => {
  const heading = "Je huidige bestaansreden voor Mindd is:";
  const value = "Mindd helpt ondernemers hun visie om te zetten in scherpe keuzes en consistente uitvoering.";
  const wrapped = `${heading}\n${value}`;
  const helpers = buildHeadingAwarePurposeHelpers({
    heading,
    suggestion: wrapped,
  });
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message: wrapped,
      refined_formulation: "",
      purpose: "",
    } as Record<string, unknown>,
    userTextRaw: value,
    isOfftopic: false,
  });
  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
  assert.equal(String((result.specialist as Record<string, unknown>).refined_formulation || ""), value);
  assert.equal(String((result.specialist as Record<string, unknown>).purpose || ""), value);
});

test("applyWordingPickSelection unwraps current-context heading before committing suggestion", () => {
  const heading = "Je huidige bestaansreden voor Mindd is:";
  const value = "Mindd helpt ondernemers hun visie om te zetten in scherpe keuzes en consistente uitvoering.";
  const wrapped = `${heading}\n${value}`;
  const helpers = buildHeadingAwarePurposeHelpers({
    heading,
    suggestion: wrapped,
    equivalent: false,
  });
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "purpose",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "purpose",
      active_specialist: "Purpose",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "purpose",
        wording_choice_user_normalized: value,
        wording_choice_agent_current: wrapped,
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.refined_formulation || ""), value);
  assert.equal(String(applyResult.specialist.purpose || ""), value);
  assert.equal(String(applyResult.specialist.wording_choice_agent_current || ""), value);
});
