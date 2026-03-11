import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepWordingHelpers } from "./run_step_wording.js";

function buildHelpers(intentEnabled: boolean) {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceInterpretedListHeading: "This is what I took from your input:",
    wordingChoiceGroupedCompareUserLabel: "This is your compact wording:",
    wordingChoiceGroupedCompareSuggestionLabel: "This is my suggestion:",
    wordingChoiceGroupedCompareInstruction: "Choose the version that fits best for the remaining difference.",
    wordingChoiceGroupedCompareRetainedHeading: "These points already stay in the final list:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wording.feedback.user_pick.reason.default":
      "This keeps your original meaning while staying aligned with this step.",
    "wordingChoice.chooseVersion": "Choose this version",
    "wordingChoice.useInputFallback": "Use this input",
    "autosuggest.prefix.template": "Based on your input I suggest the following {0}:",
    "offtopic.step.dream": "Dream",
    "offtopic.step.purpose": "Purpose",
    "offtopic.step.bigwhy": "Big Why",
    "offtopic.step.role": "Role",
    "offtopic.step.entity": "Entity",
    "offtopic.step.targetgroup": "Target Group",
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

function buildHeadingAwareSingleValueHelpers(params: {
  stepId: "dream" | "purpose" | "bigwhy" | "role" | "entity" | "targetgroup";
  heading: string;
  suggestion: string;
  equivalent?: boolean;
}) {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceInterpretedListHeading: "This is what I took from your input:",
    wordingChoiceGroupedCompareUserLabel: "This is your compact wording:",
    wordingChoiceGroupedCompareSuggestionLabel: "This is my suggestion:",
    wordingChoiceGroupedCompareInstruction: "Choose the version that fits best for the remaining difference.",
    wordingChoiceGroupedCompareRetainedHeading: "These points already stay in the final list:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wording.feedback.user_pick.reason.default":
      "This keeps your original meaning while staying aligned with this step.",
    "wordingChoice.chooseVersion": "Choose this version",
    "wordingChoice.useInputFallback": "Use this input",
    "autosuggest.prefix.template": "Based on your input I suggest the following {0}:",
    "offtopic.step.dream": "Dream",
    "offtopic.step.purpose": "Purpose",
    "offtopic.step.bigwhy": "Big Why",
    "offtopic.step.role": "Role",
    "offtopic.step.entity": "Entity",
    "offtopic.step.targetgroup": "Target Group",
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
    fieldForStep: (stepId: string) => {
      if (stepId === "dream") return "dream";
      if (stepId === "purpose") return "purpose";
      if (stepId === "bigwhy") return "bigwhy";
      if (stepId === "role") return "role";
      if (stepId === "entity") return "entity";
      if (stepId === "targetgroup") return "targetgroup";
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

test("buildWordingChoiceFromTurn keeps targetgroup in picker pending presentation for direct content input", () => {
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
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
});

test("buildWordingChoiceFromTurn keeps targetgroup picker pending presentation for regular rewrites", () => {
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
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
});

test("buildWordingChoiceFromTurn keeps Dream in picker pending presentation for direct content input", () => {
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

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
});

test("buildWordingChoiceFromTurn suppresses Dream picker when user text is only raw source content", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {} as any,
    activeSpecialist: "Dream",
    previousSpecialist: {},
    specialistResult: {
      message: "Ik denk dat ik je begrijp.",
      refined_formulation:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      dream: "",
    } as Record<string, unknown>,
    userTextRaw:
      "Ik zou willen dat mensen gezonder zouden eten met minder bewerkt voedsel en voedsel eten waar minimale tot geen ongezonde toevoegingen in zitten.",
    isOfftopic: false,
    acceptedOutputUserTurnClassification: {
      turn_kind: "raw_source_content",
      user_variant_is_stepworthy: false,
    },
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
  assert.equal(
    String((result.specialist as Record<string, unknown>).wording_choice_user_variant_semantics || ""),
    "raw_source_content"
  );
});

test("buildWordingChoiceFromTurn suppresses Dream picker when user text is refine feedback", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {} as any,
    activeSpecialist: "Dream",
    previousSpecialist: {
      dream:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
    },
    specialistResult: {
      message: "Ik denk dat ik begrijp wat je bedoelt.",
      refined_formulation:
        "Bart droomt van een wereld waarin mensen zich vitaal en hoopvol voelen doordat zij kiezen voor puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      dream: "",
    } as Record<string, unknown>,
    userTextRaw: "Ik wil het iets positiever laten klinken.",
    isOfftopic: false,
    acceptedOutputUserTurnClassification: {
      turn_kind: "feedback_on_existing_content",
      user_variant_is_stepworthy: false,
    },
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
  assert.equal(
    String((result.specialist as Record<string, unknown>).wording_choice_user_variant_semantics || ""),
    "feedback_on_existing_content"
  );
});

test("buildWordingChoiceFromTurn keeps Purpose in picker pending presentation for direct content input", () => {
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

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
});

test("buildWordingChoiceFromTurn keeps Role in picker pending presentation for direct content input", () => {
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

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
});

test("buildWordingChoiceFromTurn suppresses Role picker when user text is pure rejection", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "role",
    state: {} as any,
    activeSpecialist: "Role",
    previousSpecialist: {
      role: "Mindd helpt ondernemers koersvast te blijven in lastige keuzes.",
    },
    specialistResult: {
      message: "Ik denk dat ik begrijp wat je afwijst.",
      refined_formulation: "Mindd helpt ondernemers keuzes maken die standhouden onder druk.",
      role: "",
    } as Record<string, unknown>,
    userTextRaw: "Nee, dat bedoel ik niet.",
    isOfftopic: false,
    acceptedOutputUserTurnClassification: {
      turn_kind: "rejection_without_replacement",
      user_variant_is_stepworthy: false,
    },
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
  assert.equal(
    String((result.specialist as Record<string, unknown>).wording_choice_user_variant_semantics || ""),
    "rejection_without_replacement"
  );
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

test("buildWordingChoiceFromTurn compares strategy wording choices per differing compare unit", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: [
        "Recurring revenue",
        "Expert-led delivery",
      ],
      strategy: [
        "Recurring revenue",
        "Expert-led delivery",
      ].join("\n"),
    },
    specialistResult: {
      message: "This is what your current strategy looks like.",
      refined_formulation: [
        "Recurring revenue",
        "Expert-led delivery",
        "Operational focus",
      ].join("\n"),
      statements: [
        "Recurring revenue",
        "Expert-led delivery",
        "Operational focus",
      ],
    },
    userTextRaw: "Operational simplicity",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.equal(result.wordingChoice?.user_label, "This is your compact wording:");
  assert.equal(
    String((result.specialist as Record<string, unknown>).wording_choice_list_semantics || ""),
    "full"
  );
  assert.deepEqual(result.wordingChoice?.user_items, ["Operational simplicity"]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, ["Operational focus"]);
  assert.equal(result.wordingChoice?.user_text, "Operational simplicity");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
});

test("buildWordingChoiceFromPendingSpecialist applies interpreted list labels for business list steps", () => {
  const helpers = buildHelpers(true);
  const wordingChoice = helpers.buildWordingChoiceFromPendingSpecialist(
    {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_target_field: "rulesofthegame",
      wording_choice_user_normalized: [
        "We communicate proactively.",
        "We keep commitments.",
        "We escalate risks early.",
      ].join("\n"),
      wording_choice_agent_current: [
        "We communicate proactively.",
        "We keep commitments.",
        "We escalate risks early.",
      ].join("\n"),
      wording_choice_user_items: [
        "We communicate proactively.",
        "We keep commitments.",
        "We escalate risks early.",
      ],
      wording_choice_suggestion_items: [
        "We communicate proactively.",
        "We keep commitments.",
        "We escalate risks early.",
      ],
    },
    {} as any,
    "RulesOfTheGame",
    {}
  );

  assert.ok(wordingChoice);
  assert.equal(wordingChoice?.user_label, "This is what I took from your input:");
  assert.equal(wordingChoice?.suggestion_label, "This would be my suggestion:");
});

test("buildWordingChoiceFromTurn creates grouped compare unit for free-text strategy input and keeps agreed bullets visible", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: ["Recurring revenue", "Expert-led delivery"],
      strategy: ["Recurring revenue", "Expert-led delivery"].join("\n"),
    },
    specialistResult: {
      message: "This is what your current strategy looks like.",
      refined_formulation: [
        "Recurring revenue",
        "Expert-led delivery",
        "Operational focus",
      ].join("\n"),
      statements: [
        "Recurring revenue",
        "Expert-led delivery",
        "Operational focus",
      ],
    },
    userTextRaw: "Operational simplicity",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.user_label, "This is your compact wording:");
  assert.equal(result.wordingChoice?.suggestion_label, "This is my suggestion:");
  assert.deepEqual(result.wordingChoice?.user_items, ["Operational simplicity"]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, ["Operational focus"]);
  assert.match(String(result.wordingChoice?.instruction || ""), /These points already stay in the final list:/);
  assert.match(String(result.wordingChoice?.instruction || ""), /Recurring revenue/);
  assert.match(String(result.wordingChoice?.instruction || ""), /Expert-led delivery/);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
});

test("buildWordingChoiceFromTurn keeps strategy 7-to-8 overflow as a local consolidation suggestion with retained bullets", () => {
  const helpers = buildHelpers(true);
  const previousStatements = [
    "Recurring revenue",
    "Expert-led delivery",
    "Decision-maker access",
    "Complex organisations only",
    "Operational simplicity",
    "Measurable delivery",
    "Long-term partnerships",
  ];
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: previousStatements,
      strategy: previousStatements.join("\n"),
    },
    specialistResult: {
      message: "This is the consolidation suggestion to keep the strategy focused.",
      refined_formulation: [
        "Recurring revenue",
        "Expert-led delivery",
        "Decision-maker access",
        "Complex organisations only",
        "Operational simplicity",
        "Measurable delivery",
        "Long-term partnerships with built-in client education",
      ].join("\n"),
      statements: [
        "Recurring revenue",
        "Expert-led delivery",
        "Decision-maker access",
        "Complex organisations only",
        "Operational simplicity",
        "Measurable delivery",
        "Long-term partnerships with built-in client education",
      ],
    },
    userTextRaw: "Add client education as a separate strategic focus.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.equal(result.wordingChoice?.user_label, "This is your compact wording:");
  assert.equal(result.wordingChoice?.suggestion_label, "This is my suggestion:");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, previousStatements);
  assert.match(String(result.wordingChoice?.instruction || ""), /These points already stay in the final list:/);
  assert.match(String(result.wordingChoice?.instruction || ""), /Recurring revenue/);
  assert.match(String(result.wordingChoice?.instruction || ""), /Long-term partnerships/);
});

test("buildWordingChoiceFromTurn supports 1 user sentence versus 2 suggestion bullets as one compare unit", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "productsservices",
    state: {} as any,
    activeSpecialist: "ProductsServices",
    previousSpecialist: {
      statements: [],
      productsservices: "",
    },
    specialistResult: {
      message: "This is the sharpened offer.",
      refined_formulation: ["AI audits", "Implementation guidance"].join("\n"),
      statements: ["AI audits", "Implementation guidance"],
    },
    userTextRaw: "AI audits and implementation guidance",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.deepEqual(result.wordingChoice?.user_items, ["AI audits and implementation guidance"]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, ["AI audits", "Implementation guidance"]);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
});

test("buildWordingChoiceFromTurn supports 3 user bullets versus 1 compact suggestion as one compare unit", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "rulesofthegame",
    state: {} as any,
    activeSpecialist: "RulesOfTheGame",
    previousSpecialist: {
      statements: [],
      rulesofthegame: "",
    },
    specialistResult: {
      message: "This is the compact rule suggestion.",
      refined_formulation: "We keep each other accountable for delivery.",
      statements: ["We keep each other accountable for delivery."],
    },
    userTextRaw: [
      "We do what we promise.",
      "We follow up on ownership.",
      "We resolve blockers fast.",
    ].join("\n"),
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.deepEqual(result.wordingChoice?.user_items, [
    "We do what we promise.",
    "We follow up on ownership.",
    "We resolve blockers fast.",
  ]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, [
    "We keep each other accountable for delivery.",
  ]);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
});

test("buildWordingChoiceFromTurn keeps free-text strategy proposals pending instead of committing them", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: ["Recurring revenue"],
      strategy: "Recurring revenue",
    },
    specialistResult: {
      message: "I think I understand what you mean.",
      refined_formulation: [
        "Recurring revenue",
        "Client education inside long-term programs",
      ].join("\n"),
      statements: [
        "Recurring revenue",
        "Client education inside long-term programs",
      ],
    },
    userTextRaw:
      "I do not want to run loose workshops anymore. It should really become something that strengthens the long-term programs and helps clients apply the work themselves.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, ["Recurring revenue"]);
  assert.equal(String((result.specialist as Record<string, unknown>).strategy || ""), "Recurring revenue");
});

test("buildWordingChoiceFromTurn keeps free-text rules proposals pending and local", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "rulesofthegame",
    state: {} as any,
    activeSpecialist: "RulesOfTheGame",
    previousSpecialist: {
      statements: ["We communicate proactively."],
      rulesofthegame: "We communicate proactively.",
    },
    specialistResult: {
      message: "I think I understand what you mean.",
      refined_formulation: [
        "We communicate proactively.",
        "We raise quality concerns before delivery leaves the building.",
      ].join("\n"),
      statements: [
        "We communicate proactively.",
        "We raise quality concerns before delivery leaves the building.",
      ],
    },
    userTextRaw:
      "If something is not right, I want the team to say it before it reaches the client instead of patching it later.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, ["We communicate proactively."]);
  assert.equal(String((result.specialist as Record<string, unknown>).rulesofthegame || ""), "We communicate proactively.");
});

test("buildWordingChoiceFromTurn keeps strategy anchorless 3-to-4 rewrites in grouped compare mode", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: [],
      strategy: "",
    },
    specialistResult: {
      message: "This is the sharpened strategy set.",
      refined_formulation: [
        "Build recurring revenue with implementation retainers",
        "Partner directly with internal decision-makers",
        "Focus on complex organisations with longer buying cycles",
        "Keep delivery practical and measurable from day one",
      ].join("\n"),
      statements: [
        "Build recurring revenue with implementation retainers",
        "Partner directly with internal decision-makers",
        "Focus on complex organisations with longer buying cycles",
        "Keep delivery practical and measurable from day one",
      ],
    },
    userTextRaw: [
      "Recurring revenue through retainers",
      "Work with decision-makers inside complex organisations",
      "Keep delivery practical and measurable",
    ].join("\n"),
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.user_label, "This is your compact wording:");
  assert.equal(result.wordingChoice?.suggestion_label, "This is my suggestion:");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.equal(Array.isArray((result.specialist as Record<string, unknown>).wording_choice_compare_units), true);
  const compareUnits = ((result.specialist as Record<string, unknown>).wording_choice_compare_units as Array<Record<string, unknown>>) || [];
  assert.equal(compareUnits.length >= 1, true);
  assert.deepEqual(
    compareUnits.flatMap((unit) => ((unit.user_items as string[]) || []).map((line) => String(line || ""))),
    [
      "Recurring revenue through retainers",
      "Work with decision-makers inside complex organisations",
      "Keep delivery practical and measurable",
    ]
  );
  assert.deepEqual(
    compareUnits.flatMap((unit) => ((unit.suggestion_items as string[]) || []).map((line) => String(line || ""))),
    [
      "Build recurring revenue with implementation retainers",
      "Partner directly with internal decision-makers",
      "Focus on complex organisations with longer buying cycles",
      "Keep delivery practical and measurable from day one",
    ]
  );
  assert.equal((result.wordingChoice?.user_items || []).length >= 1, true);
  assert.equal((result.wordingChoice?.suggestion_items || []).length >= 1, true);
});

test("buildWordingChoiceFromTurn keeps productsservices anchorless 2-to-3 rewrites in grouped compare mode", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "productsservices",
    state: {} as any,
    activeSpecialist: "ProductsServices",
    previousSpecialist: {
      statements: [],
      productsservices: "",
    },
    specialistResult: {
      message: "This is the sharpened offer set.",
      refined_formulation: [
        "AI opportunity scans",
        "Implementation guidance for AI adoption",
        "Brand strategy for technical companies",
      ].join("\n"),
      statements: [
        "AI opportunity scans",
        "Implementation guidance for AI adoption",
        "Brand strategy for technical companies",
      ],
    },
    userTextRaw: [
      "AI scans and implementation help",
      "Brand strategy for technical teams",
    ].join("\n"),
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.user_label, "This is your compact wording:");
  assert.equal(result.wordingChoice?.suggestion_label, "This is my suggestion:");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  const compareUnits = ((result.specialist as Record<string, unknown>).wording_choice_compare_units as Array<Record<string, unknown>>) || [];
  assert.equal(compareUnits.length >= 1, true);
  assert.deepEqual(
    compareUnits.flatMap((unit) => ((unit.user_items as string[]) || []).map((line) => String(line || ""))),
    [
      "AI scans and implementation help",
      "Brand strategy for technical teams",
    ]
  );
  assert.deepEqual(
    compareUnits.flatMap((unit) => ((unit.suggestion_items as string[]) || []).map((line) => String(line || ""))),
    [
      "AI opportunity scans",
      "Implementation guidance for AI adoption",
      "Brand strategy for technical companies",
    ]
  );
  assert.equal((result.wordingChoice?.user_items || []).length >= 1, true);
  assert.equal((result.wordingChoice?.suggestion_items || []).length >= 1, true);
});

test("buildWordingChoiceFromTurn falls back to legacy full-set compare when anchorless business list matching is too uncertain", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "rulesofthegame",
    state: {} as any,
    activeSpecialist: "RulesOfTheGame",
    previousSpecialist: {
      statements: [],
      rulesofthegame: "",
    },
    specialistResult: {
      message: "This is the rewritten rule set.",
      refined_formulation: [
        "Protect margin through weekly dashboard reviews",
        "Automate recurring workflows where possible",
        "Keep process changes fully documented",
      ].join("\n"),
      statements: [
        "Protect margin through weekly dashboard reviews",
        "Automate recurring workflows where possible",
        "Keep process changes fully documented",
      ],
    },
    userTextRaw: [
      "Tell hard truths early",
      "Own the room during client workshops",
    ].join("\n"),
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "");
  assert.equal(result.wordingChoice?.user_label, "This is what I took from your input:");
  assert.equal(result.wordingChoice?.suggestion_label, "This would be my suggestion:");
});

test("buildWordingChoiceFromTurn directly accepts one valid strategy sentence when it already meets the step wording", () => {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceInterpretedListHeading: "This is what I took from your input:",
    wordingChoiceGroupedCompareUserLabel: "This is your compact wording:",
    wordingChoiceGroupedCompareSuggestionLabel: "This is my suggestion:",
    wordingChoiceGroupedCompareInstruction: "Choose the version that fits best for the remaining difference.",
    wordingChoiceGroupedCompareRetainedHeading: "These points already stay in the final list:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wording.feedback.user_pick.reason.default":
      "This keeps your original meaning while staying aligned with this step.",
    "wordingChoice.chooseVersion": "Choose this version",
    "wordingChoice.useInputFallback": "Use this input",
  };
  const canonicalize = (input: string) =>
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  const helpers = createRunStepWordingHelpers({
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
      if (stepId === "strategy") return "strategy";
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
    pickDualChoiceSuggestion: (_stepId, specialistResult) =>
      String((specialistResult as Record<string, unknown>)?.refined_formulation || "").trim(),
    areEquivalentWordingVariants: ({ userItems, suggestionItems }) =>
      JSON.stringify(userItems.map(canonicalize)) === JSON.stringify(suggestionItems.map(canonicalize)),
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
    wordingSelectionMessage: () => "",
  });

  const line = "Focus on recurring revenue with implementation retainers";
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: [],
      strategy: "",
    },
    specialistResult: {
      message: "This focus point is already sharp enough.",
      refined_formulation: line,
      statements: [line],
    },
    userTextRaw: line,
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
  assert.equal(String((result.specialist as Record<string, unknown>).refined_formulation || ""), line);
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, [line]);
  assert.equal(String((result.specialist as Record<string, unknown>).strategy || ""), line);
});

test("applyWordingPickSelection resolves grouped compare units into one final productsservices list", () => {
  const helpers = buildHelpers(true);
  const state = {
    current_step: "productsservices",
    active_specialist: "ProductsServices",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_target_field: "productsservices",
      wording_choice_presentation: "picker",
      wording_choice_variant: "grouped_list_units",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_cursor: "0",
      wording_choice_compare_segments: [
        { kind: "retained", items: ["Strategy workshops"] },
        { kind: "unit", unit_id: "unit_1" },
        { kind: "unit", unit_id: "unit_2" },
      ],
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["AI websites"],
          suggestion_items: ["AI-compatible websites"],
          user_text: "AI websites",
          suggestion_text: "AI-compatible websites",
          resolution: "",
          confidence: "anchored",
        },
        {
          id: "unit_2",
          user_items: ["Branding retainers"],
          suggestion_items: ["Brand systems"],
          user_text: "Branding retainers",
          suggestion_text: "Brand systems",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["AI websites"],
      wording_choice_suggestion_items: ["AI-compatible websites"],
      wording_choice_user_normalized: "AI websites",
      wording_choice_agent_current: "AI-compatible websites",
      wording_choice_user_label: "This is your compact wording:",
      wording_choice_suggestion_label: "This is my suggestion:",
    },
  } as any;

  const first = helpers.applyWordingPickSelection({
    stepId: "productsservices",
    routeToken: "__WORDING_PICK_USER__",
    state,
  });

  assert.equal(first.handled, true);
  assert.equal(String(first.specialist.wording_choice_pending || ""), "true");
  assert.deepEqual((first.specialist.wording_choice_user_items as string[]) || [], ["Branding retainers"]);

  const second = helpers.applyWordingPickSelection({
    stepId: "productsservices",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: first.nextState,
  });

  assert.equal(second.handled, true);
  assert.equal(String(second.specialist.wording_choice_pending || ""), "false");
  assert.deepEqual((second.specialist.statements as string[]) || [], [
    "Strategy workshops",
    "AI websites",
    "Brand systems",
  ]);
  assert.equal(
    String((second.specialist.productsservices as string) || ""),
    ["Strategy workshops", "AI websites", "Brand systems"].join("\n")
  );
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

test("buildWordingChoiceFromTurn strips markup from picker pending wording fields", () => {
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

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "picker");
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
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
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
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
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

test("buildWordingChoiceFromTurn unwraps autosuggest heading before equivalence check", () => {
  const heading = "Based on your input I suggest the following Dream:";
  const value = "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.";
  const wrapped = `${heading}\n${value}`;
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "dream",
    heading: "Je huidige droom voor Mindd is:",
    suggestion: wrapped,
  });
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {} as any,
    activeSpecialist: "Dream",
    previousSpecialist: {},
    specialistResult: {
      message: wrapped,
      refined_formulation: "",
      dream: "",
    } as Record<string, unknown>,
    userTextRaw: value,
    isOfftopic: false,
  });
  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "false");
  assert.equal(String((result.specialist as Record<string, unknown>).refined_formulation || ""), value);
  assert.equal(String((result.specialist as Record<string, unknown>).dream || ""), value);
});

test("applyWordingPickSelection unwraps autosuggest heading before committing suggestion", () => {
  const heading = "Based on your input I suggest the following Dream:";
  const value = "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.";
  const wrapped = `${heading}\n${value}`;
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "dream",
    heading: "Je huidige droom voor Mindd is:",
    suggestion: wrapped,
    equivalent: false,
  });
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "dream",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "dream",
      active_specialist: "Dream",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "dream",
        wording_choice_user_normalized: value,
        wording_choice_agent_current: wrapped,
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.refined_formulation || ""), value);
  assert.equal(String(applyResult.specialist.dream || ""), value);
  assert.equal(String(applyResult.specialist.wording_choice_agent_current || ""), value);
});

test("applyWordingPickSelection does not carry suggestion rationale when user picks own single-value wording", () => {
  const heading = "Je huidige droom voor Mindd is:";
  const userValue = "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.";
  const suggestionValue = "Mindd droomt van een wereld waarin mensen zonder zorgen complexe keuzes durven maken.";
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "dream",
    heading,
    suggestion: suggestionValue,
    equivalent: false,
  });
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "dream",
    routeToken: "__WORDING_PICK_USER__",
    state: {
      current_step: "dream",
      active_specialist: "Dream",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "dream",
        wording_choice_user_normalized: userValue,
        wording_choice_agent_current: suggestionValue,
        feedback_reason_text:
          "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.wording_choice_selected || ""), "user");
  assert.equal(String(applyResult.specialist.feedback_reason_text || ""), "");
  assert.match(String(applyResult.specialist.message || ""), /je huidige droom voor mindd is:/i);
  assert.match(String(applyResult.specialist.message || ""), /mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken/i);
  assert.doesNotMatch(String(applyResult.specialist.message || ""), /toekomstbeeld waarin mensen zich zekerder/i);
});

test("buildWordingChoiceFromTurn keeps canonical pending during forced pending feedback even when suggestion is equivalent", () => {
  const scenarios = [
    {
      stepId: "dream" as const,
      activeSpecialist: "Dream",
      value:
        "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken door heldere informatie.",
    },
    {
      stepId: "purpose" as const,
      activeSpecialist: "Purpose",
      value: "Mindd bestaat om complexe keuzes begrijpelijk te maken zodat mensen met vertrouwen kunnen handelen.",
    },
    {
      stepId: "role" as const,
      activeSpecialist: "Role",
      value: "Mindd is de gids die complexe informatie vertaalt naar heldere keuzes voor ondernemers.",
    },
  ];

  for (const scenario of scenarios) {
    const helpers = buildHeadingAwareSingleValueHelpers({
      stepId: scenario.stepId,
      heading: "Je huidige formulering voor Mindd is:",
      suggestion: scenario.value,
      equivalent: true,
    });
    const result = helpers.buildWordingChoiceFromTurn({
      stepId: scenario.stepId,
      state: {} as any,
      activeSpecialist: scenario.activeSpecialist,
      previousSpecialist: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_user_normalized: scenario.value,
        wording_choice_agent_current: scenario.value,
      },
      specialistResult: {
        message: "Dat is een goed beginpunt.",
        refined_formulation: scenario.value,
      } as Record<string, unknown>,
      userTextRaw: scenario.value,
      isOfftopic: false,
      forcePending: true,
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "suggestion",
      submittedFeedbackText: "Dit voelt nog te vlak.",
    });

    assert.equal(result.wordingChoice, null);
    assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
    assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
    assert.equal(String((result.specialist as Record<string, unknown>).pending_suggestion_anchor || ""), "suggestion");
    assert.equal(String((result.specialist as Record<string, unknown>).pending_suggestion_intent || ""), "feedback_on_suggestion");
    assert.notEqual(String((result.specialist as Record<string, unknown>).feedback_reason_text || "").trim(), "");
  }
});

test("buildWordingChoiceFromTurn bypasses contributing-input gate while forced pending feedback is active", () => {
  const helpers = buildHelpers(true);
  const value = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_user_normalized: value,
      wording_choice_agent_current: value,
    },
    specialistResult: {
      message: "Dat is een goed beginpunt.",
      refined_formulation: value,
      purpose: value,
    } as Record<string, unknown>,
    userTextRaw: "?",
    isOfftopic: false,
    forcePending: true,
    submittedTextIntent: "reject_suggestion_explicit",
    submittedTextAnchor: "suggestion",
    submittedFeedbackText: "Dat is niet wat ik bedoel.",
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});
