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
    wordingChoiceDreamBuilderKeepBothLabel: "Keep both statements:",
    wordingChoiceDreamBuilderMergeLabel: "Merge into one statement:",
    wordingChoiceDreamBuilderMergeInstruction:
      "Choose whether you want to keep both similar statements or merge them into one stronger statement.",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wording.feedback.compare.intro.template":
      "I think I understand what you mean. For a stronger {0}, it helps to keep this in mind.",
    "wording.feedback.user_pick.ack.default": "Your own wording is completely okay.",
    "wording.feedback.user_pick.nudge.template":
      "At the same time, it helps to remember what usually makes a strong {0}.",
    "wording.feedback.user_pick.reason.default":
      "Keep in mind what makes this step strong, so your wording stays clear and aligned.",
    "wording.feedback.dream_builder.rewrite.default":
      "Your original wording is mainly about your own wish, while Dream Builder asks for a broader change in the world.",
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
    uiStringFromStateMap: (state, key, fallback) => {
      const fromState = String(((state as any)?.ui_strings || {})[key] || "").trim();
      return fromState || fallback;
    },
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

function buildDreamBuilderHelpers(intentEnabled: boolean) {
  const defaultUi: Record<string, string> = {
    wordingChoiceHeading: "This is your input:",
    wordingChoiceInterpretedListHeading: "This is what I took from your input:",
    wordingChoiceGroupedCompareUserLabel: "This is your compact wording:",
    wordingChoiceGroupedCompareSuggestionLabel: "This is my suggestion:",
    wordingChoiceGroupedCompareInstruction: "Choose the version that fits best for the remaining difference.",
    wordingChoiceGroupedCompareRetainedHeading: "These points already stay in the final list:",
    wordingChoiceDreamBuilderKeepBothLabel: "Keep both statements:",
    wordingChoiceDreamBuilderMergeLabel: "Merge into one statement:",
    wordingChoiceDreamBuilderMergeInstruction:
      "Choose whether you want to keep both similar statements or merge them into one stronger statement.",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "wording.choice.context.default": "Please choose the wording that fits best.",
    "wording.feedback.compare.intro.template":
      "I think I understand what you mean. For a stronger {0}, it helps to keep this in mind.",
    "wording.feedback.user_pick.ack.default": "Your own wording is completely okay.",
    "wording.feedback.user_pick.nudge.template":
      "At the same time, it helps to remember what usually makes a strong {0}.",
    "wording.feedback.user_pick.reason.default":
      "Keep in mind what makes this step strong, so your wording stays clear and aligned.",
    "wording.feedback.dream_builder.rewrite.default":
      "Your original wording is mainly about your own wish, while Dream Builder asks for a broader change in the world.",
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
    normalizeDreamRuntimeMode: (raw) =>
      String(raw || "").trim() === "builder_collect" ? "builder_collect" : "self",
    uiDefaultString: (key: string) => defaultUi[key] || "",
    uiStringFromStateMap: (state, key, fallback) => {
      const fromState = String(((state as any)?.ui_strings || {})[key] || "").trim();
      return fromState || fallback;
    },
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
    "wording.feedback.compare.intro.template":
      "I think I understand what you mean. For a stronger {0}, it helps to keep this in mind.",
    "wording.feedback.user_pick.ack.default": "Your own wording is completely okay.",
    "wording.feedback.user_pick.nudge.template":
      "At the same time, it helps to remember what usually makes a strong {0}.",
    "wording.feedback.user_pick.reason.default":
      "Keep in mind what makes this step strong, so your wording stays clear and aligned.",
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
    uiStringFromStateMap: (state, key, fallback) => {
      const fromState = String(((state as any)?.ui_strings || {})[key] || "").trim();
      return fromState || fallback;
    },
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
      feedback_reason_text: "Deze suggestie maakt de doelgroep concreter en beter afgebakend.",
      feedback_mode: "compare_suggestion",
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
      feedback_reason_text: "Deze suggestie maakt de doelgroep concreter en beter bruikbaar voor de volgende stappen.",
      feedback_mode: "compare_suggestion",
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
      feedback_reason_text: "Deze suggestie maakt de Droom menselijker en richtinggevender.",
      feedback_mode: "compare_suggestion",
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

test("buildWordingChoiceFromTurn keeps Dream Builder statements canonical while a rewritten addition is still pending", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
    } as any,
    activeSpecialist: "DreamExplainer",
    previousSpecialist: {
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
      ],
      dream:
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    },
    specialistResult: {
      message: "Ik heb je wens breder vertaald naar maatschappelijke verandering.",
      feedback_reason_text:
        "Je oorspronkelijke zin ging vooral over jouw wens, terwijl Dream Builder een bredere verandering in de wereld vraagt.",
      refined_formulation:
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
      ],
      suggest_dreambuilder: "true",
    } as Record<string, unknown>,
    userTextRaw: "I want my work to make a positive difference in people's lives.",
    isOfftopic: false,
    dreamRuntimeModeRaw: "builder_collect",
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
  ]);
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
      feedback_reason_text: "Deze suggestie maakt de bestaansreden concreter en betekenisvoller.",
      feedback_mode: "compare_suggestion",
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
      feedback_reason_text: "Deze suggestie laat scherper zien welke rol Mindd voor anderen speelt.",
      feedback_mode: "compare_suggestion",
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
      feedback_reason_text: "This suggestion keeps the remaining offer change concrete and easy to compare.",
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
      feedback_reason_text: "This suggestion sharpens the remaining strategic difference into one clearer choice.",
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
  assert.equal(
    String(result.wordingChoice?.compare_feedback?.text || ""),
    "This suggestion sharpens the remaining strategic difference into one clearer choice."
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
      feedback_reason_text: "This suggestion makes the remaining rule interpretation more concrete.",
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

test("buildWordingChoiceFromPendingSpecialist suppresses picker when only a generic interpretation opener is available", () => {
  const helpers = buildHelpers(true);
  const wordingChoice = helpers.buildWordingChoiceFromPendingSpecialist(
    {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_target_field: "purpose",
      wording_choice_user_variant_stepworthy: "true",
      wording_choice_user_normalized:
        "Mindd bestaat om bij te dragen aan een wereld waarin communicatie en verhalen authentiek, eerlijk en origineel zijn.",
      wording_choice_agent_current:
        "Mindd bestaat om communicatie en verhalen authentiek, eerlijk en origineel te maken, zodat echte mensen en echte waarden centraal staan.",
      refined_formulation:
        "Mindd bestaat om communicatie en verhalen authentiek, eerlijk en origineel te maken, zodat echte mensen en echte waarden centraal staan.",
      purpose:
        "Mindd bestaat om communicatie en verhalen authentiek, eerlijk en origineel te maken, zodat echte mensen en echte waarden centraal staan.",
      feedback_reason_text: "Ik denk dat ik begrijp wat je bedoelt.",
    },
    { current_step: "purpose" } as any,
    "Purpose",
    {}
  );

  assert.equal(wordingChoice, null);
});

test("buildWordingChoiceFromPendingSpecialist keeps grouped compare feedback bound to the active unit instead of stale top-level feedback", () => {
  const helpers = buildHelpers(true);
  const wordingChoice = helpers.buildWordingChoiceFromPendingSpecialist(
    {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "strategy",
      wording_choice_variant: "grouped_list_units",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_cursor: "1",
      wording_choice_compare_segments: [
        { kind: "retained", items: ["Recurring revenue"] },
        { kind: "unit", unit_id: "unit_1" },
        { kind: "unit", unit_id: "unit_2" },
      ],
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["Expert-led delivery"],
          suggestion_items: ["Operational excellence"],
          user_text: "Expert-led delivery",
          suggestion_text: "Operational excellence",
          feedback_reason_text: "Earlier unit feedback should not stay on screen.",
          resolution: "user",
          confidence: "anchored",
        },
        {
          id: "unit_2",
          user_items: ["Operational simplicity"],
          suggestion_items: ["Operational focus"],
          user_text: "Operational simplicity",
          suggestion_text: "Operational focus",
          feedback_reason_text:
            "This suggestion sharpens the remaining strategic difference into one clearer choice.",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["Operational simplicity"],
      wording_choice_suggestion_items: ["Operational focus"],
      wording_choice_user_normalized: "Operational simplicity",
      wording_choice_agent_current: "Operational focus",
      feedback_reason_text: "Earlier unit feedback should not stay on screen.",
    },
    { current_step: "strategy" } as any,
    "Strategy",
    {}
  );

  assert.ok(wordingChoice);
  assert.equal(
    String(wordingChoice?.compare_feedback?.text || ""),
    "This suggestion sharpens the remaining strategic difference into one clearer choice."
  );
  assert.match(String(wordingChoice?.instruction || ""), /These points already stay in the final list:/);
  assert.match(String(wordingChoice?.instruction || ""), /Recurring revenue/);
  assert.doesNotMatch(
    String(wordingChoice?.compare_feedback?.text || ""),
    /Recurring revenue|Earlier unit feedback should not stay on screen/i
  );
});

test("buildWordingChoiceFromPendingSpecialist suppresses grouped compare when the active unit has no valid feedback even if stale top-level feedback remains", () => {
  const helpers = buildHelpers(true);
  const wordingChoice = helpers.buildWordingChoiceFromPendingSpecialist(
    {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "strategy",
      wording_choice_variant: "grouped_list_units",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_cursor: "1",
      wording_choice_compare_segments: [
        { kind: "retained", items: ["Recurring revenue"] },
        { kind: "unit", unit_id: "unit_1" },
        { kind: "unit", unit_id: "unit_2" },
      ],
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["Expert-led delivery"],
          suggestion_items: ["Operational excellence"],
          user_text: "Expert-led delivery",
          suggestion_text: "Operational excellence",
          feedback_reason_text: "Earlier unit feedback should not stay on screen.",
          resolution: "user",
          confidence: "anchored",
        },
        {
          id: "unit_2",
          user_items: ["Operational simplicity"],
          suggestion_items: ["Operational focus"],
          user_text: "Operational simplicity",
          suggestion_text: "Operational focus",
          feedback_reason_text: "",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["Operational simplicity"],
      wording_choice_suggestion_items: ["Operational focus"],
      wording_choice_user_normalized: "Operational simplicity",
      wording_choice_agent_current: "Operational focus",
      feedback_reason_text: "Earlier unit feedback should not stay on screen.",
    },
    { current_step: "strategy" } as any,
    "Strategy",
    {}
  );

  assert.equal(wordingChoice, null);
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
      feedback_reason_text: "This suggestion sharpens the remaining difference into one clearer strategic choice.",
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

test("buildWordingChoiceFromTurn exposes dynamic feedback reason across the single-value feedback family", () => {
  const scenarios = [
    {
      stepId: "dream" as const,
      activeSpecialist: "Dream",
      heading: "Je huidige droom voor Mindd is:",
      suggestion: "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.",
      userTextRaw: "Wij willen dat mensen bewuster kiezen.",
      message:
        "Je droom blijft nog te beschrijvend en mist een voelbaar toekomstbeeld. Ik heb hem aangescherpt zodat de ambitie direct menselijker en richtinggevender voelt.",
      expected: "Je droom blijft nog te beschrijvend en mist een voelbaar toekomstbeeld.",
    },
    {
      stepId: "purpose" as const,
      activeSpecialist: "Purpose",
      heading: "Je huidige bestaansreden voor Mindd is:",
      suggestion: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      userTextRaw: "Wij willen iets goeds doen.",
      message:
        "De huidige formulering blijft nog te algemeen en maakt niet concreet welke betekenis Mindd wil hebben. Ik heb hem aangescherpt zodat de bijdrage van Mindd helderder wordt.",
      expected: "De huidige formulering blijft nog te algemeen en maakt niet concreet welke betekenis Mindd wil hebben.",
    },
    {
      stepId: "bigwhy" as const,
      activeSpecialist: "BigWhy",
      heading: "Je huidige grote waarom voor Mindd is:",
      suggestion: "Omdat mensen rust voelen wanneer complexe beslissingen eindelijk helder worden.",
      userTextRaw: "Omdat we graag willen helpen.",
      message:
        "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie. Ik heb hem compacter gemaakt zodat de diepere drijfveer direct voelbaar wordt.",
      expected: "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie.",
    },
    {
      stepId: "role" as const,
      activeSpecialist: "Role",
      heading: "Je huidige rol voor Mindd is:",
      suggestion: "Mindd maakt complexe keuzes zichtbaar en hanteerbaar voor ambitieuze teams.",
      userTextRaw: "Wij maken mooie dingen zichtbaar.",
      message:
        "Je rol blijft nog te algemeen en laat nog niet scherp zien welke bijdrage Mindd levert. Ik heb hem verfijnd zodat de positionerende rol duidelijker naar voren komt.",
      expected: "Je rol blijft nog te algemeen en laat nog niet scherp zien welke bijdrage Mindd levert.",
    },
    {
      stepId: "entity" as const,
      activeSpecialist: "Entity",
      heading: "Je huidige entiteit voor Mindd is:",
      suggestion: "Een strategisch creatief bureau",
      userTextRaw: "Een bureau voor van alles en nog wat",
      message:
        "Je entiteit blijft nog te generiek en geeft te weinig richting aan de positionering. Ik heb hem compacter gemaakt zodat het type organisatie directer herkenbaar wordt.",
      expected: "Je entiteit blijft nog te generiek en geeft te weinig richting aan de positionering.",
    },
    {
      stepId: "targetgroup" as const,
      activeSpecialist: "TargetGroup",
      heading: "Je huidige doelgroep voor Mindd is:",
      suggestion: "Mensen die complexe keuzes moeten maken in hun werk of leven.",
      userTextRaw: "Iedereen die wel wat hulp kan gebruiken",
      message:
        "Je doelgroep blijft nog te breed en maakt de relevante spanning onvoldoende concreet. Ik heb hem aangescherpt zodat duidelijker wordt voor wie Mindd echt betekenisvol is.",
      expected: "Je doelgroep blijft nog te breed en maakt de relevante spanning onvoldoende concreet.",
    },
  ];

  for (const scenario of scenarios) {
    const helpers = buildHeadingAwareSingleValueHelpers({
      stepId: scenario.stepId,
      heading: scenario.heading,
      suggestion: scenario.suggestion,
      equivalent: false,
    });

    const result = helpers.buildWordingChoiceFromTurn({
      stepId: scenario.stepId,
      state: {} as any,
      activeSpecialist: scenario.activeSpecialist,
      previousSpecialist: {},
      specialistResult: {
        message: scenario.message,
        feedback_reason_text: scenario.expected,
        feedback_mode: "compare_suggestion",
        refined_formulation: scenario.suggestion,
        [scenario.stepId]: "",
      } as Record<string, unknown>,
      userTextRaw: scenario.userTextRaw,
      isOfftopic: false,
    });

    assert.ok(result.wordingChoice);
    const feedback = String(result.wordingChoice?.compare_feedback?.text || "");
    assert.match(feedback, new RegExp(scenario.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(feedback, /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i);
    assert.equal("feedback_reason_text" in (result.wordingChoice || {}), false);
  }
});

test("buildWordingChoiceFromTurn exposes dynamic feedback reason across grouped compare feedback family", () => {
  const helpers = buildHelpers(true);
  const scenarios = [
    {
      stepId: "strategy",
      activeSpecialist: "Strategy",
      field: "strategy",
      previousItems: ["Recurring revenue", "Expert-led delivery"],
      suggestionItems: ["Recurring revenue", "Expert-led delivery", "Operational focus"],
      userTextRaw: "Operational simplicity",
      message: "This suggestion sharpens the remaining difference into one clearer strategic choice.",
      expected: "This suggestion sharpens the remaining difference into one clearer strategic choice.",
    },
    {
      stepId: "productsservices",
      activeSpecialist: "ProductsServices",
      field: "productsservices",
      previousItems: ["Strategy workshops", "Creative campaigns"],
      suggestionItems: ["Strategy workshops", "Creative campaigns", "AI prototypes"],
      userTextRaw: "AI flows",
      message: "This suggestion keeps the list focused on the service change that still needs a decision.",
      expected: "This suggestion keeps the list focused on the service change that still needs a decision.",
    },
    {
      stepId: "rulesofthegame",
      activeSpecialist: "RulesOfTheGame",
      field: "rulesofthegame",
      previousItems: ["We communicate proactively", "We keep promises"],
      suggestionItems: ["We communicate proactively", "We keep promises", "We stay curious"],
      userTextRaw: "We ask better questions",
      message: "This suggestion narrows the remaining difference into one clearer behavioral choice.",
      expected: "This suggestion narrows the remaining difference into one clearer behavioral choice.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const result = helpers.buildWordingChoiceFromTurn({
      stepId: scenario.stepId,
      state: {} as any,
      activeSpecialist: scenario.activeSpecialist,
      previousSpecialist: {
        statements: scenario.previousItems,
        [scenario.field]: scenario.previousItems.join("\n"),
      },
      specialistResult: {
        message: scenario.message,
        feedback_reason_text: scenario.expected,
        refined_formulation: scenario.suggestionItems.join("\n"),
        statements: scenario.suggestionItems,
      },
      userTextRaw: scenario.userTextRaw,
      isOfftopic: false,
    });

    assert.ok(result.wordingChoice);
    const feedback = String(result.wordingChoice?.compare_feedback?.text || "");
    assert.match(feedback, new RegExp(scenario.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(feedback, /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i);
    assert.equal("feedback_reason_text" in (result.wordingChoice || {}), false);
  }
});

test("buildWordingChoiceFromTurn suppresses single-value compare when the reason is only a generic acknowledgment", () => {
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
    heading: "Je huidige bestaansreden voor Mindd is:",
    suggestion: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    equivalent: false,
  });

  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message: "Ik denk dat ik begrijp wat je bedoelt.",
      feedback_reason_text: "Ik denk dat ik begrijp wat je bedoelt.",
      feedback_mode: "compare_suggestion",
      refined_formulation: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      purpose: "",
    },
    userTextRaw: "We willen iets goeds doen.",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn keeps the substantive reason when a generic acknowledgment comes first", () => {
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
    heading: "Je huidige bestaansreden voor Mindd is:",
    suggestion: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    equivalent: false,
  });

  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message:
        "I think I understand what you mean. Your current wording is still too broad and does not yet show the concrete change Mindd creates.",
      feedback_reason_text:
        "I think I understand what you mean. Your current wording is still too broad and does not yet show the concrete change Mindd creates.",
      feedback_mode: "compare_suggestion",
      refined_formulation: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      purpose: "",
    },
    userTextRaw: "We willen iets goeds doen.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(
    String(result.wordingChoice?.compare_feedback?.text || ""),
    "Your current wording is still too broad and does not yet show the concrete change Mindd creates."
  );
});

test("buildWordingChoiceFromTurn keeps encouragement wording when it contains a concrete rationale", () => {
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
    heading: "Je huidige bestaansreden voor Mindd is:",
    suggestion: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    equivalent: false,
  });

  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message:
        "Dat is al een sterk beginpunt, maar je formulering blijft nog te algemeen en maakt niet concreet voor wie je verschil maakt.",
      feedback_reason_text:
        "Dat is al een sterk beginpunt, maar je formulering blijft nog te algemeen en maakt niet concreet voor wie je verschil maakt.",
      feedback_mode: "compare_suggestion",
      refined_formulation: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      purpose: "",
    },
    userTextRaw: "We willen iets goeds doen.",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(
    String(result.wordingChoice?.compare_feedback?.text || ""),
    "Dat is al een sterk beginpunt, maar je formulering blijft nog te algemeen en maakt niet concreet voor wie je verschil maakt."
  );
});

test("buildWordingChoiceFromTurn requires explicit valid compare feedback across the single-value wording family", () => {
  const scenarios = [
    {
      stepId: "dream" as const,
      activeSpecialist: "Dream",
      heading: "Je huidige droom voor Mindd is:",
      suggestion: "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.",
      userTextRaw: "Wij willen bedrijven helpen groeien.",
      field: "dream",
    },
    {
      stepId: "purpose" as const,
      activeSpecialist: "Purpose",
      heading: "Je huidige bestaansreden voor Mindd is:",
      suggestion: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      userTextRaw: "We willen iets goeds doen.",
      field: "purpose",
    },
    {
      stepId: "bigwhy" as const,
      activeSpecialist: "BigWhy",
      heading: "Je huidige grote waarom voor Mindd is:",
      suggestion: "Omdat heldere keuzes mensen rust en richting geven.",
      userTextRaw: "Omdat het belangrijk is.",
      field: "bigwhy",
    },
    {
      stepId: "role" as const,
      activeSpecialist: "Role",
      heading: "Je huidige rol voor Mindd is:",
      suggestion: "Mindd helpt mensen complexe keuzes helder en menselijk te maken.",
      userTextRaw: "We helpen mensen.",
      field: "role",
    },
    {
      stepId: "entity" as const,
      activeSpecialist: "Entity",
      heading: "Je huidige entiteit voor Mindd is:",
      suggestion: "Mindd is een strategisch bureau voor complexe keuzes.",
      userTextRaw: "Een bedrijf voor van alles.",
      field: "entity",
    },
    {
      stepId: "targetgroup" as const,
      activeSpecialist: "TargetGroup",
      heading: "Je huidige doelgroep voor Mindd is:",
      suggestion: "Mensen die in hun werk complexe keuzes moeten uitleggen.",
      userTextRaw: "Iedereen die hulp nodig heeft.",
      field: "targetgroup",
    },
  ];

  for (const scenario of scenarios) {
    const helpers = buildHeadingAwareSingleValueHelpers({
      stepId: scenario.stepId,
      heading: scenario.heading,
      suggestion: scenario.suggestion,
      equivalent: false,
    });

    const result = helpers.buildWordingChoiceFromTurn({
      stepId: scenario.stepId,
      state: {} as any,
      activeSpecialist: scenario.activeSpecialist,
      previousSpecialist: {},
      specialistResult: {
        message: "I refined the wording.",
        feedback_reason_text: "",
        feedback_mode: "compare_suggestion",
        refined_formulation: scenario.suggestion,
        [scenario.field]: "",
      } as Record<string, unknown>,
      userTextRaw: scenario.userTextRaw,
      isOfftopic: false,
    });

    assert.equal(result.wordingChoice, null, `expected ${scenario.stepId} to suppress compare without feedback`);
    assert.equal(
      String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""),
      "canonical",
      `expected ${scenario.stepId} to fall back to canonical presentation`
    );
  }
});

test("buildWordingChoiceFromTurn suppresses grouped compare when no explicit agent feedback is available", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "productsservices",
    state: {} as any,
    activeSpecialist: "ProductsServices",
    previousSpecialist: {
      statements: ["Strategy workshops", "Creative campaigns"],
      productsservices: ["Strategy workshops", "Creative campaigns"].join("\n"),
    },
    specialistResult: {
      message: "I refined the list.",
      refined_formulation: ["Strategy workshops", "Creative campaigns", "AI prototypes"].join("\n"),
      statements: ["Strategy workshops", "Creative campaigns", "AI prototypes"],
    },
    userTextRaw: "AI flows",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
});

test("buildWordingChoiceFromTurn suppresses grouped compare when the reason sanitizes to no valid feedback", () => {
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
      message: "I think I understand what you mean.",
      feedback_reason_text: "I think I understand what you mean.",
      refined_formulation: ["Recurring revenue", "Expert-led delivery", "Operational focus"].join("\n"),
      statements: ["Recurring revenue", "Expert-led delivery", "Operational focus"],
    },
    userTextRaw: "Operational simplicity",
    isOfftopic: false,
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
});

test("buildWordingChoiceFromTurn accepts explicit compare feedback across the grouped/list family without relying on feedback_mode", () => {
  const scenarios = [
    {
      stepId: "strategy" as const,
      activeSpecialist: "Strategy",
      previousItems: ["Recurring revenue", "Expert-led delivery"],
      suggestionItems: ["Recurring revenue", "Expert-led delivery", "Operational focus"],
      userTextRaw: "Operational simplicity",
      expected: "This suggestion sharpens the remaining difference into one clearer strategic choice.",
    },
    {
      stepId: "productsservices" as const,
      activeSpecialist: "ProductsServices",
      previousItems: ["Strategy workshops", "Creative campaigns"],
      suggestionItems: ["Strategy workshops", "Creative campaigns", "AI prototypes"],
      userTextRaw: "AI flows",
      expected: "This suggestion keeps the remaining offer change concrete and easy to compare.",
    },
    {
      stepId: "rulesofthegame" as const,
      activeSpecialist: "RulesOfTheGame",
      previousItems: ["We communicate proactively.", "We keep promises."],
      suggestionItems: ["We communicate proactively.", "We keep promises.", "We stay curious."],
      userTextRaw: "We ask better questions.",
      expected: "This suggestion narrows the remaining difference into one clearer behavioral choice.",
    },
  ];

  for (const scenario of scenarios) {
    const result = buildHelpers(true).buildWordingChoiceFromTurn({
      stepId: scenario.stepId,
      state: {} as any,
      activeSpecialist: scenario.activeSpecialist,
      previousSpecialist: {
        statements: scenario.previousItems,
        [scenario.stepId]: scenario.previousItems.join("\n"),
      },
      specialistResult: {
        message: scenario.expected,
        feedback_reason_text: scenario.expected,
        refined_formulation: scenario.suggestionItems.join("\n"),
        statements: scenario.suggestionItems,
      },
      userTextRaw: scenario.userTextRaw,
      isOfftopic: false,
    });

    assert.ok(result.wordingChoice, `expected ${scenario.stepId} to keep compare active`);
    assert.equal(
      String(result.wordingChoice?.compare_feedback?.text || ""),
      scenario.expected,
      `expected ${scenario.stepId} to preserve the explicit compare feedback`
    );
  }
});

test("buildWordingChoiceFromTurn suppresses forced grouped compare when no explicit agent feedback is available", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: ["Recurring revenue", "Expert-led delivery"],
      strategy: ["Recurring revenue", "Expert-led delivery"].join("\n"),
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_user_normalized: "Operational simplicity",
      wording_choice_agent_current: ["Recurring revenue", "Expert-led delivery", "Operational focus"].join("\n"),
    },
    specialistResult: {
      message: "Okay.",
      refined_formulation: ["Recurring revenue", "Expert-led delivery", "Operational focus"].join("\n"),
      statements: ["Recurring revenue", "Expert-led delivery", "Operational focus"],
    },
    userTextRaw: "Operational simplicity",
    isOfftopic: false,
    forcePending: true,
    submittedTextIntent: "feedback_on_suggestion",
    submittedTextAnchor: "suggestion",
  });

  assert.equal(result.wordingChoice, null);
});

test("buildWordingChoiceFromTurn groups overlapping strategy points on the user side against one merged suggestion", () => {
  const helpers = buildHelpers(true);
  const existingStatements = [
    "Altijd gericht investeren in relevante technologische innovaties die de impact van klantcommunicatie vergroten",
    "Prototyping en MVP's bouwen als show what we can do for you",
  ];
  const mergedSuggestion = [
    "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
    "Prototyping en MVP's bouwen als show what we can do for you",
  ];
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: existingStatements,
      strategy: existingStatements.join("\n"),
    },
    specialistResult: {
      message: "Je voorstel lijkt sterk op een bestaand focuspunt.",
      feedback_reason_text:
        "Deze suggestie voegt de overlappende focus samen tot een helderder strategisch verschil.",
      refined_formulation: mergedSuggestion.join("\n"),
      statements: mergedSuggestion,
    },
    userTextRaw:
      "Altijd gericht investeren in AI-technologieen die de impact van klantcommunicatie vergroten",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(result.wordingChoice?.mode, "list");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.deepEqual(result.wordingChoice?.user_items, [
    "Altijd gericht investeren in relevante technologische innovaties die de impact van klantcommunicatie vergroten",
    "Altijd gericht investeren in AI-technologieen die de impact van klantcommunicatie vergroten",
  ]);
  assert.deepEqual(result.wordingChoice?.suggestion_items, [
    "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
  ]);
  assert.match(String(result.wordingChoice?.instruction || ""), /Prototyping en MVP's bouwen/i);
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, existingStatements);
  assert.equal(String((result.specialist as Record<string, unknown>).strategy || ""), existingStatements.join("\n"));
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
      feedback_reason_text:
        "This suggestion keeps the strategy compact by resolving the one remaining overlap.",
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
      feedback_reason_text:
        "This suggestion turns the remaining offer difference into a clearer set of service items.",
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
      feedback_reason_text:
        "This suggestion compresses the remaining behavioral difference into one clearer rule.",
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
      feedback_reason_text:
        "This suggestion turns the remaining strategy change into a clearer long-term strategic choice.",
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
      feedback_reason_text:
        "This suggestion turns the remaining rule change into one clearer team behavior.",
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
      feedback_reason_text:
        "This suggestion groups the remaining strategy difference into one clearer comparison.",
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
      feedback_reason_text:
        "This suggestion groups the remaining offer difference into one clearer comparison.",
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

test("buildWordingChoiceFromTurn treats an implicit strategy line rewrite as one remaining compare unit instead of an additive list expansion", () => {
  const helpers = buildHelpers(true);
  const originalTarget = "Werk alleen met klanten die groei vanuit wederzijds begrip nastreven";
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "strategy",
    state: {} as any,
    activeSpecialist: "Strategy",
    previousSpecialist: {
      statements: [
        "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        originalTarget,
      ],
      strategy: "",
    },
    specialistResult: {
      message: "Ik heb je input omgezet naar een positieve focuskeuze, zodat het duidelijk richting geeft aan je strategie.",
      feedback_reason_text:
        "Ik heb je input omgezet naar een positieve focuskeuze, zodat het duidelijk richting geeft aan je strategie.",
      refined_formulation: [
        "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        "Sta open voor samenwerkingen met diverse klanten, mits er ruimte is voor echte verbinding",
      ].join("\n"),
      statements: [
        "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        "Sta open voor samenwerkingen met diverse klanten, mits er ruimte is voor echte verbinding",
      ],
    },
    userTextRaw: "Ik werk niet alleen met klanten die groei vanuit wederzijds begrip nastreven. Wij werken met iedereen",
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  const compareUnits = ((result.specialist as Record<string, unknown>).wording_choice_compare_units as Array<Record<string, unknown>>) || [];
  assert.equal(compareUnits.length, 1);
  assert.deepEqual(compareUnits[0].user_items, [
    "Ik werk niet alleen met klanten die groei vanuit wederzijds begrip nastreven",
    "Wij werken met iedereen",
  ]);
  assert.deepEqual(compareUnits[0].suggestion_items, [
    "Sta open voor samenwerkingen met diverse klanten, mits er ruimte is voor echte verbinding",
  ]);
  const compareSegments = ((result.specialist as Record<string, unknown>).wording_choice_compare_segments as Array<Record<string, unknown>>) || [];
  const retainedItems = compareSegments
    .filter((segment) => String(segment.kind || "") === "retained")
    .flatMap((segment) => ((segment.items as string[]) || []).map((line) => String(line || "")));
  assert.equal(retainedItems.includes(originalTarget), false);
});

test("buildWordingChoiceFromTurn keeps productsservices retained items with internal commas intact", () => {
  const helpers = buildHelpers(true);
  const retainedItem = "Traditionele communicatiediensten (zoals DTP, posters, campagnes)";
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
      feedback_reason_text:
        "This suggestion keeps the remaining offer wording concrete while preserving the retained item.",
      refined_formulation: [
        retainedItem,
        "Strategisch bedrijfs- en communicatieadvies",
      ].join("\n"),
      statements: [
        retainedItem,
        "Strategisch bedrijfs- en communicatieadvies",
      ],
    },
    userTextRaw: [
      retainedItem,
      "Strategisch advies",
    ].join("\n"),
    isOfftopic: false,
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.deepEqual(
    ((result.specialist as Record<string, unknown>).wording_choice_compare_segments as Array<Record<string, unknown>>)
      .filter((segment) => String(segment.kind || "") === "retained")
      .flatMap((segment) => ((segment.items as string[]) || []).map((line) => String(line || ""))),
    [retainedItem]
  );
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
      feedback_reason_text:
        "This suggestion is the clearest local rewrite for the remaining rules difference.",
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
    "wording.feedback.compare.intro.template":
      "I think I understand what you mean. For a stronger {0}, it helps to keep this in mind.",
    "wording.feedback.user_pick.ack.default": "Your own wording is completely okay.",
    "wording.feedback.user_pick.nudge.template":
      "At the same time, it helps to remember what usually makes a strong {0}.",
    "wording.feedback.user_pick.reason.default":
      "Keep in mind what makes this step strong, so your wording stays clear and aligned.",
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
  const preservedCommaItem = "Traditionele communicatiediensten (zoals DTP, posters, campagnes)";
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
          feedback_reason_text:
            "This suggestion keeps the remaining offer difference precise and easy to compare.",
          resolution: "",
          confidence: "anchored",
        },
        {
          id: "unit_2",
          user_items: ["Branding retainers"],
          suggestion_items: [preservedCommaItem],
          user_text: "Branding retainers",
          suggestion_text: preservedCommaItem,
          feedback_reason_text:
            "This suggestion keeps the remaining offer difference precise and easy to compare.",
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
    preservedCommaItem,
  ]);
  assert.equal(
    String((second.specialist.productsservices as string) || ""),
    ["Strategy workshops", "AI websites", preservedCommaItem].join("\n")
  );
});

test("applyWordingPickSelection persists accepted Dream Builder statements into canonical state", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "dream",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "dream",
      active_specialist: "DreamExplainer",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
      ],
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "dream",
        wording_choice_presentation: "picker",
        wording_choice_base_items: [
          "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        ],
        wording_choice_user_items: [
          "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        ],
        wording_choice_suggestion_items: [
          "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
        ],
        wording_choice_user_normalized:
          "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        wording_choice_agent_current:
          "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
        feedback_reason_text:
          "Deze suggestie vertaalt je wens naar een bredere maatschappelijke verandering.",
        refined_formulation:
          "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.deepEqual((applyResult.nextState as any).dream_builder_statements, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
  ]);
  assert.deepEqual((applyResult.specialist as Record<string, unknown>).statements, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
  ]);
});

test("buildWordingChoiceFromTurn opens a merge choice for a near-duplicate Dream Builder statement", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
    } as any,
    activeSpecialist: "DreamExplainer",
    previousSpecialist: {
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
      ],
      dream:
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    },
    specialistResult: {
      message: "Ik heb de overlap samengebracht in een scherpere maatschappelijke formulering.",
      feedback_reason_text:
        "Deze twee statements gaan bijna over dezelfde maatschappelijke beweging, dus een samengevoegde formulering houdt je lijst scherper.",
      refined_formulation:
        "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
        "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
      ],
      suggest_dreambuilder: "true",
    } as Record<string, unknown>,
    userTextRaw:
      "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
    isOfftopic: false,
    dreamRuntimeModeRaw: "builder_collect",
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
  ]);
  assert.deepEqual((result.wordingChoice as Record<string, unknown>).user_items, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
  ]);
  assert.deepEqual((result.wordingChoice as Record<string, unknown>).suggestion_items, [
    "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
  ]);
  assert.equal(String((result.wordingChoice as Record<string, unknown>).user_label || ""), "Keep both statements:");
  assert.equal(String((result.wordingChoice as Record<string, unknown>).suggestion_label || ""), "Merge into one statement:");
});

test("buildWordingChoiceFromTurn opens a grouped compare for multiple Dream Builder wishes that are rewritten into future statements", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
    } as any,
    activeSpecialist: "DreamExplainer",
    previousSpecialist: {
      statements: [],
      dream: "",
    },
    specialistResult: {
      message: "Ik heb je persoonlijke wensen vertaald naar bredere maatschappelijke bewegingen.",
      feedback_reason_text:
        "Je input gaat vooral over persoonlijke verlangens, terwijl Dream Builder zoekt naar toekomstige veranderingen in de wereld of samenleving.",
      refined_formulation: [
        "Over 5 tot 10 jaar zal positieve impact op het leven van anderen voor meer mensen een belangrijk criterium worden in hun werk.",
        "Mensen zullen meer waarde hechten aan het opbouwen van iets dat duurzaam blijft bestaan voorbij henzelf.",
        "Vrijheid in tijd en keuzes zal voor steeds meer mensen een belangrijk onderdeel worden van hun werkende leven.",
        "Trots op het eigen werk en de maatschappelijke bijdrage ervan zal voor meer mensen leidend worden in hun loopbaan.",
        "Bedrijven zullen vaker bewust worden ingericht als een weerspiegeling van de waarden en identiteit van hun oprichters.",
      ].join("\n"),
      statements: [],
      suggest_dreambuilder: "true",
    } as Record<string, unknown>,
    userTextRaw: [
      "I want my work to make a positive difference in people's lives.",
      "I want to build something that lasts beyond me.",
      "I want to create freedom in my time and choices.",
      "I want to feel proud when I talk about what I do.",
      "I want my business to reflect who I am and what I stand for.",
    ].join("\n\n"),
    isOfftopic: false,
    dreamRuntimeModeRaw: "builder_collect",
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.deepEqual((result.specialist as Record<string, unknown>).statements, []);
  assert.deepEqual((result.wordingChoice as Record<string, unknown>).user_items, [
    "I want my work to make a positive difference in people's lives.",
    "I want to build something that lasts beyond me.",
    "I want to create freedom in my time and choices.",
    "I want to feel proud when I talk about what I do.",
    "I want my business to reflect who I am and what I stand for.",
  ]);
  assert.deepEqual((result.wordingChoice as Record<string, unknown>).suggestion_items, [
    "Over 5 tot 10 jaar zal positieve impact op het leven van anderen voor meer mensen een belangrijk criterium worden in hun werk.",
    "Mensen zullen meer waarde hechten aan het opbouwen van iets dat duurzaam blijft bestaan voorbij henzelf.",
    "Vrijheid in tijd en keuzes zal voor steeds meer mensen een belangrijk onderdeel worden van hun werkende leven.",
    "Trots op het eigen werk en de maatschappelijke bijdrage ervan zal voor meer mensen leidend worden in hun loopbaan.",
    "Bedrijven zullen vaker bewust worden ingericht als een weerspiegeling van de waarden en identiteit van hun oprichters.",
  ]);
});

test("buildWordingChoiceFromTurn keeps Dream Builder grouped compare active for multiple wishes even without explicit specialist feedback text", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "dream",
    state: {
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
    } as any,
    activeSpecialist: "DreamExplainer",
    previousSpecialist: {
      statements: [],
      dream: "",
    },
    specialistResult: {
      message: "Ik heb je persoonlijke wensen vertaald naar bredere maatschappelijke bewegingen.",
      feedback_reason_text: "",
      refined_formulation: [
        "Over 5 tot 10 jaar zal positieve impact op het leven van anderen voor meer mensen een belangrijk criterium worden in hun werk.",
        "Mensen zullen meer waarde hechten aan het opbouwen van iets dat duurzaam blijft bestaan voorbij henzelf.",
        "Vrijheid in tijd en keuzes zal voor steeds meer mensen een belangrijk onderdeel worden van hun werkende leven.",
        "Trots op het eigen werk en de maatschappelijke bijdrage ervan zal voor meer mensen leidend worden in hun loopbaan.",
        "Bedrijven zullen vaker bewust worden ingericht als een weerspiegeling van de waarden en identiteit van hun oprichters.",
      ].join("\n"),
      statements: [],
      suggest_dreambuilder: "true",
    } as Record<string, unknown>,
    userTextRaw: [
      "I want my work to make a positive difference in people's lives.",
      "I want to build something that lasts beyond me.",
      "I want to create freedom in my time and choices.",
      "I want to feel proud when I talk about what I do.",
      "I want my business to reflect who I am and what I stand for.",
    ].join("\n\n"),
    isOfftopic: false,
    dreamRuntimeModeRaw: "builder_collect",
  });

  assert.ok(result.wordingChoice);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.match(
    String((result.wordingChoice as Record<string, unknown>).feedback_reason_text || ""),
    /broader change|bredere verandering/i
  );
});

test("applyWordingPickSelection can keep both Dream Builder near-duplicate statements", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "dream",
    routeToken: "__WORDING_PICK_USER__",
    state: {
      current_step: "dream",
      active_specialist: "DreamExplainer",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
      ],
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "dream",
        wording_choice_presentation: "picker",
        wording_choice_variant: "grouped_list_units",
        wording_choice_compare_mode: "grouped_units",
        wording_choice_compare_cursor: "0",
        wording_choice_compare_segments: [
          { kind: "unit", unit_id: "unit_1" },
          {
            kind: "retained",
            items: ["Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties."],
          },
        ],
        wording_choice_compare_units: [
          {
            id: "unit_1",
            user_items: [
              "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
              "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
            ],
            suggestion_items: [
              "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
            ],
            user_text:
              "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.\nOver 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
            suggestion_text:
              "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
            feedback_reason_text:
              "Deze twee statements gaan bijna over dezelfde maatschappelijke beweging, dus een samengevoegde formulering houdt je lijst scherper.",
            resolution: "",
            confidence: "fallback",
          },
        ],
        wording_choice_user_items: [
          "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
          "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
        ],
        wording_choice_suggestion_items: [
          "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
        ],
        wording_choice_user_label: "Keep both statements:",
        wording_choice_suggestion_label: "Merge into one statement:",
        feedback_reason_text:
          "Deze twee statements gaan bijna over dezelfde maatschappelijke beweging, dus een samengevoegde formulering houdt je lijst scherper.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.deepEqual((applyResult.nextState as any).dream_builder_statements, [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
    "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
    "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
  ]);
});

test("applyWordingPickSelection can merge a Dream Builder near-duplicate into one stronger statement", () => {
  const helpers = buildDreamBuilderHelpers(true);
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "dream",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "dream",
      active_specialist: "DreamExplainer",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
      ],
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "dream",
        wording_choice_presentation: "picker",
        wording_choice_variant: "grouped_list_units",
        wording_choice_compare_mode: "grouped_units",
        wording_choice_compare_cursor: "0",
        wording_choice_compare_segments: [
          { kind: "unit", unit_id: "unit_1" },
          {
            kind: "retained",
            items: ["Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties."],
          },
        ],
        wording_choice_compare_units: [
          {
            id: "unit_1",
            user_items: [
              "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
              "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
            ],
            suggestion_items: [
              "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
            ],
            user_text:
              "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.\nOver 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
            suggestion_text:
              "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
            feedback_reason_text:
              "Deze twee statements gaan bijna over dezelfde maatschappelijke beweging, dus een samengevoegde formulering houdt je lijst scherper.",
            resolution: "",
            confidence: "fallback",
          },
        ],
        wording_choice_user_items: [
          "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
          "Over 5 tot 10 jaar zal het belangrijker worden dat werk zichtbaar iets goeds doet in het leven van mensen.",
        ],
        wording_choice_suggestion_items: [
          "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
        ],
        wording_choice_user_label: "Keep both statements:",
        wording_choice_suggestion_label: "Merge into one statement:",
        feedback_reason_text:
          "Deze twee statements gaan bijna over dezelfde maatschappelijke beweging, dus een samengevoegde formulering houdt je lijst scherper.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.deepEqual((applyResult.nextState as any).dream_builder_statements, [
    "Over 5 tot 10 jaar zal werk steeds vaker worden gezien als iets dat zichtbaar betekenis toevoegt aan het leven van anderen.",
    "Er zal meer behoefte zijn aan bedrijven en initiatieven die een blijvende waarde nalaten voor toekomstige generaties.",
  ]);
});

test("applyWordingPickSelection keeps explicit agent feedback available for the next grouped compare unit", () => {
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
          user_items: ["AI flows"],
          suggestion_items: ["AI-driven flows"],
          user_text: "AI flows",
          suggestion_text: "AI-driven flows",
          feedback_reason_text: "This suggestion keeps the service wording more precise.",
          resolution: "",
          confidence: "anchored",
        },
        {
          id: "unit_2",
          user_items: ["Production support"],
          suggestion_items: ["Production guidance"],
          user_text: "Production support",
          suggestion_text: "Production guidance",
          feedback_reason_text: "This suggestion keeps the service wording more precise.",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["AI flows"],
      wording_choice_suggestion_items: ["AI-driven flows"],
      wording_choice_user_normalized: "AI flows",
      wording_choice_agent_current: "AI-driven flows",
      feedback_reason_text: "This suggestion keeps the service wording more precise.",
    },
  } as any;

  const first = helpers.applyWordingPickSelection({
    stepId: "productsservices",
    routeToken: "__WORDING_PICK_USER__",
    state,
  });

  assert.equal(first.handled, true);
  assert.equal(String(first.specialist.wording_choice_pending || ""), "true");
  assert.equal(
    String(first.specialist.feedback_reason_text || ""),
    "This suggestion keeps the service wording more precise."
  );
  assert.deepEqual((first.specialist.wording_choice_user_items as string[]) || [], ["Production support"]);
  const nextUnits = ((first.specialist.wording_choice_compare_units as unknown[]) || []) as Record<string, unknown>[];
  assert.equal(
    String(nextUnits[1]?.feedback_reason_text || ""),
    "This suggestion keeps the service wording more precise."
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
      feedback_reason_text: "Deze suggestie maakt de doelgroep concreter en beter afgebakend.",
      feedback_mode: "compare_suggestion",
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

test("applyWordingPickSelection clears stale current-value refinement context after suggestion pick", () => {
  const helpers = buildHelpers(true);
  const chosen = "Retailbedrijven in de Randstad met marketingteams";
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
        wording_choice_user_normalized: "Bedrijven in de retailsector",
        wording_choice_agent_current: chosen,
        current_value_refinement_pending: "true",
        current_value_refinement_target_field: "targetgroup",
        current_value_refinement_feedback_text:
          "Alleen 'bedrijven in de retailsector' is te algemeen; een extra kenmerk zoals teamtype maakt het bruikbaarder.",
        current_value_refinement_anchor_value: "Bedrijven in de retailsector",
        feedback_reason_text:
          "Alleen 'bedrijven in de retailsector' is te algemeen; een extra kenmerk zoals teamtype maakt het bruikbaarder.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.refined_formulation || ""), chosen);
  assert.equal(String(applyResult.specialist.targetgroup || ""), chosen);
  assert.equal(String(applyResult.specialist.wording_choice_selected || ""), "suggestion");
  assert.equal(String(applyResult.specialist.current_value_refinement_pending || ""), "false");
  assert.equal(String(applyResult.specialist.current_value_refinement_target_field || ""), "");
  assert.equal(String(applyResult.specialist.current_value_refinement_feedback_text || ""), "");
  assert.equal(String(applyResult.specialist.current_value_refinement_anchor_value || ""), "");
  assert.equal(String(applyResult.specialist.feedback_reason_text || ""), "");
});

test("applyWordingPickSelection strips stale autosuggest UI contracts after suggestion pick", () => {
  const heading = "Je huidige entiteit voor Mindd is:";
  const chosen = "strategisch communicatiebureau";
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "entity",
    heading,
    suggestion: chosen,
  });
  const applyResult = helpers.applyWordingPickSelection({
    stepId: "entity",
    routeToken: "__WORDING_PICK_SUGGESTION__",
    state: {
      current_step: "entity",
      active_specialist: "Entity",
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "entity",
        wording_choice_user_normalized: "gevoel voor communicatie",
        wording_choice_agent_current: chosen,
        ui_feedback_contract: {
          kind: "single_value_canonical_suggestion",
          heading: "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE ENTITEIT VOOR:",
          suggested_value: chosen,
          rationale: "Je omschrijving mist nog een heldere bedrijfscontainer.",
        },
        ui_content: {
          kind: "single_value",
          heading: "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE ENTITEIT VOOR:",
          canonical_text: chosen,
          feedback_reason_text: "Je omschrijving mist nog een heldere bedrijfscontainer.",
        },
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.wording_choice_selected || ""), "suggestion");
  assert.equal(String(applyResult.specialist.entity || ""), chosen);
  assert.match(String(applyResult.specialist.message || ""), /je huidige entiteit voor mindd is:/i);
  assert.doesNotMatch(String(applyResult.specialist.message || ""), /op basis van je input stel ik/i);
  assert.equal("ui_feedback_contract" in applyResult.specialist, false);
  assert.equal("ui_content" in applyResult.specialist, false);
});

test("applyWordingPickSelection preserves feedback reason when user picks own single-value wording", () => {
  const heading = "Je huidige droom voor Mindd is:";
  const userValue = "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.";
  const suggestionValue = "Mindd droomt van een wereld waarin mensen zonder zorgen complexe keuzes durven maken.";
  const feedbackReason =
    "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.";
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
        feedback_reason_text: feedbackReason,
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.wording_choice_selected || ""), "user");
  assert.equal(String(applyResult.specialist.feedback_reason_text || ""), feedbackReason);
  assert.match(String(applyResult.specialist.message || ""), /your own wording is completely okay/i);
  assert.match(String(applyResult.specialist.message || ""), /toekomstbeeld waarin mensen zich zekerder/i);
  assert.match(String(applyResult.specialist.message || ""), /je huidige droom voor mindd is:/i);
  assert.match(String(applyResult.specialist.message || ""), /mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken/i);
});

test("applyWordingPickSelection falls back to the user-pick reason when explicit feedback is missing", () => {
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
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(String(applyResult.specialist.wording_choice_selected || ""), "user");
  assert.equal(
    String(applyResult.specialist.feedback_reason_text || ""),
    "Keep in mind what makes this step strong, so your wording stays clear and aligned."
  );
  assert.match(String(applyResult.specialist.message || ""), /your own wording is completely okay/i);
  assert.match(String(applyResult.specialist.message || ""), /keep in mind what makes this step strong/i);
  assert.match(String(applyResult.specialist.message || ""), /je huidige droom voor mindd is:/i);
});

test("applyWordingPickSelection replaces generic user-pick feedback with the fallback reason", () => {
  const heading = "Je huidige bestaansreden voor Mindd is:";
  const userValue = "Mindd bestaat om bij te dragen aan een wereld waarin communicatie en verhalen authentiek, eerlijk en origineel zijn.";
  const suggestionValue = "Mindd bestaat om communicatie en verhalen authentiek, eerlijk en origineel te maken, zodat echte mensen en echte waarden centraal staan.";
  const helpers = buildHeadingAwareSingleValueHelpers({
    stepId: "purpose",
    heading,
    suggestion: suggestionValue,
    equivalent: false,
  });

  const applyResult = helpers.applyWordingPickSelection({
    stepId: "purpose",
    routeToken: "__WORDING_PICK_USER__",
    state: {
      current_step: "purpose",
      active_specialist: "Purpose",
      ui_strings: {
        "wording.feedback.reason.generic": "Ik denk dat ik begrijp wat je bedoelt.",
      },
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "purpose",
        wording_choice_user_normalized: userValue,
        wording_choice_agent_current: suggestionValue,
        feedback_reason_key: "generic",
        feedback_reason_text: "Ik denk dat ik begrijp wat je bedoelt.",
      },
    } as any,
  });

  assert.equal(applyResult.handled, true);
  assert.equal(
    String(applyResult.specialist.feedback_reason_text || ""),
    "Keep in mind what makes this step strong, so your wording stays clear and aligned."
  );
  assert.doesNotMatch(String(applyResult.specialist.message || ""), /ik denk dat ik begrijp wat je bedoelt/i);
  assert.match(String(applyResult.specialist.message || ""), /keep in mind what makes this step strong/i);
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
    assert.equal(String((result.specialist as Record<string, unknown>).feedback_reason_text || "").trim(), "");
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

test("buildWordingChoiceFromTurn does not open compare when feedback mode affirms the user input", () => {
  const helpers = buildHelpers(true);
  const result = helpers.buildWordingChoiceFromTurn({
    stepId: "purpose",
    state: {} as any,
    activeSpecialist: "Purpose",
    previousSpecialist: {},
    specialistResult: {
      message: "Je benoemt al duidelijk waar Mindd voor staat.",
      refined_formulation:
        "Mindd gelooft in authentieke, eerlijke en originele communicatie, zodat echte mensen en waarden centraal blijven.",
      purpose:
        "Mindd gelooft in authentieke, eerlijke en originele communicatie, zodat echte mensen en waarden centraal blijven.",
      feedback_reason_text:
        "Je benoemt al duidelijk de overtuiging die onder de Droom ligt en verwoordt waarom Mindd ertoe doet.",
      feedback_mode: "affirm_input",
    } as Record<string, unknown>,
    userTextRaw:
      "Mindd bestaat om bij te dragen aan een wereld waarin communicatie en verhalen authentiek, eerlijk en origineel zijn, zodat echte mensen en echte waarden centraal staan.",
    isOfftopic: false,
    forcePending: false,
    submittedTextIntent: "content_input",
    submittedTextAnchor: "user_input",
    submittedFeedbackText: "",
  });

  assert.equal(result.wordingChoice, null);
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((result.specialist as Record<string, unknown>).wording_choice_presentation || ""), "canonical");
  assert.equal(String((result.specialist as Record<string, unknown>).feedback_mode || ""), "affirm_input");
});
