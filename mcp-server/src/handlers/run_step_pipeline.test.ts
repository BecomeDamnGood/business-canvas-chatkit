import test from "node:test";
import assert from "node:assert/strict";

import {
  createRunStepPipelineHelpers,
  isWordingChoiceIntentEligible,
  pickCurrentStepValueForFeedback,
  resolveProvisionalSourceForTurn,
  resolveWordingChoiceSeedUserText,
  shouldTreatTurnAsCurrentValueFeedback,
  shouldForcePendingWordingChoiceFromIntent,
} from "./run_step_pipeline.js";
import { createRunStepWordingHelpers } from "./run_step_wording.js";

function buildPipelineWordingHelpers() {
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
    normalizeDreamRuntimeMode: (raw) =>
      String(raw || "").trim() === "builder_collect" ? "builder_collect" : "self",
    uiDefaultString: (key: string) => defaultUi[key] || "",
    uiStringFromStateMap: (_state, _key, fallback) => fallback,
    fieldForStep: (stepId: string) => {
      if (stepId === "strategy") return "strategy";
      if (stepId === "dream") return "dream";
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
}

function buildStrategyPipelineHarness(params: {
  specialistResult: Record<string, unknown>;
  onSpecialistCall?: (userMessage: string) => void;
  classifyStepStuckTurn?: (params: {
    model: string;
    stepId: string;
    userMessage: string;
    currentStepStuckCount?: number;
    currentStepSupportMode?: string;
    language?: string;
  }) => Promise<{ is_stuck: boolean }>;
}) {
  const wordingHelpers = buildPipelineWordingHelpers();
  const helpers = createRunStepPipelineHelpers<any>({
    ids: {
      step0Id: "step0",
      dreamStepId: "dream",
      bigwhyStepId: "bigwhy",
      strategyStepId: "strategy",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      strategySpecialist: "Strategy",
      dreamExplainerSwitchSelfMenuId: "DREAM_MENU",
    },
    policy: {
      dreamForceRefineRoutePrefix: "__DREAM_FORCE_REFINE__",
      strategyConsolidateRouteToken: "__ROUTE__STRATEGY_CONSOLIDATE__",
      bigwhyMaxWords: 50,
      uiContractVersion: "test",
    },
    specialist: {
      buildRoutingContext: () => ({ enabled: true, shadow: false }),
      callSpecialistStrictSafe: async ({ userMessage }) => {
        params.onSpecialistCall?.(String(userMessage || ""));
        return {
          ok: true,
          value: {
            specialistResult: params.specialistResult,
            attempts: 1,
            usage: {},
            model: "gpt-5-mini",
          },
        };
      },
    },
    normalization: {
      normalizeLocalizedConceptTerms: (specialist) => specialist,
      normalizeEntitySpecialistResult: (_stepId, specialist) => specialist,
      applyCentralMetaTopicRouter: ({ specialistResult }) => specialistResult,
      normalizeNonStep0OfftopicSpecialist: ({ specialistResult }) => specialistResult,
      normalizeStep0AskDisplayContract: (_stepId, specialist) => specialist,
      hasValidStep0Final: () => false,
    },
    state: {
      applyPostSpecialistStateMutations: ({ prevState, decision, specialistResult }) => {
        const nextState = {
          ...prevState,
          current_step: String((decision as Record<string, unknown>).current_step || prevState.current_step || ""),
          active_specialist: String(
            (decision as Record<string, unknown>).specialist_to_call || prevState.active_specialist || ""
          ),
          last_specialist_result: specialistResult,
        } as Record<string, unknown>;
        if (
          String((decision as Record<string, unknown>).specialist_to_call || "").trim() === "DreamExplainer" &&
          Array.isArray((specialistResult as Record<string, unknown>).statements)
        ) {
          nextState.dream_builder_statements = ((specialistResult as Record<string, unknown>).statements as unknown[])
            .map((line) => String(line || "").trim())
            .filter(Boolean);
        }
        return nextState as any;
      },
      getDreamRuntimeMode: () => "self",
      isMetaOfftopicFallbackTurn: () => false,
      shouldTreatAsStepContributingInput: () => true,
      hasDreamSpecialistCandidate: () => false,
      buildDreamRefineFallbackSpecialist: (base) => base,
      strategyStatementsForConsolidateGuard: (result, state) => {
        if (Array.isArray((result as Record<string, unknown>).statements)) {
          return ((result as Record<string, unknown>).statements as unknown[]).map((item) => String(item || "").trim()).filter(Boolean);
        }
        const previous = (state as Record<string, unknown>).last_specialist_result as Record<string, unknown> | undefined;
        if (Array.isArray(previous?.statements)) {
          return (previous.statements as unknown[]).map((item) => String(item || "").trim()).filter(Boolean);
        }
        return [];
      },
      pickBigWhyCandidate: () => "",
      countWords: (text: string) =>
        String(text || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length,
      buildBigWhyTooLongFeedback: () => ({}),
      enforceDreamBuilderQuestionProgress: (specialistResult) => specialistResult,
      applyMotivationQuotesContractV11: ({ specialistResult }) => ({
        specialistResult,
        suppressChoices: false,
      }),
    },
    render: {
      renderFreeTextTurnPolicy: () => ({
        status: "incomplete_output",
        confirmEligible: false,
        specialist: {},
        uiActionCodes: [],
        uiActions: [],
        contractId: "strategy:ask:test",
        contractVersion: "test",
        textKeys: [],
      }),
      validateRenderedContractOrRecover: ({ rendered, state, previousSpecialist }) => ({
        rendered: {
          status: "incomplete_output",
          specialist: previousSpecialist && typeof previousSpecialist === "object"
            ? (rendered as Record<string, unknown>).specialist || (state as Record<string, unknown>).last_specialist_result || {}
            : (rendered as Record<string, unknown>).specialist || {},
          contractId: "strategy:ask:test",
          contractVersion: "test",
          textKeys: [],
          uiActionCodes: [],
          uiActions: [],
        },
        state,
        violation: null,
      }),
      applyUiPhaseByStep: () => {},
      buildContractId: () => "strategy:ask:test",
    },
    wording: {
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "step_variant",
        user_variant_is_stepworthy: true,
      }),
      classifyStepStuckTurn: params.classifyStepStuckTurn,
      isWordingChoiceEligibleContext: () => true,
      buildWordingChoiceFromTurn: wordingHelpers.buildWordingChoiceFromTurn,
      buildWordingChoiceFromPendingSpecialist: wordingHelpers.buildWordingChoiceFromPendingSpecialist,
    },
    response: {
      attachRegistryPayload: (payload, specialist, flags, actionCodes, renderedActions, wordingChoice, contractMeta) => ({
        ...payload,
        specialist,
        responseUiFlags: flags || null,
        actionCodesOverride: actionCodes || null,
        renderedActionsOverride: renderedActions || null,
        wordingChoiceOverride: wordingChoice || null,
        contractMetaOverride: contractMeta || null,
      }),
      turnResponseEngine: {
        renderValidateRecover: ({ state, specialist }) => ({
          ok: true,
          value: {
            state,
            specialist,
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "strategy:ask:test",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: ({ state, specialist, responseUiFlags, actionCodesOverride, renderedActionsOverride, wordingChoiceOverride, contractMetaOverride, debug }) => ({
          ok: true,
          state,
          specialist,
          responseUiFlags: responseUiFlags || null,
          actionCodesOverride: actionCodesOverride || null,
          renderedActionsOverride: renderedActionsOverride || null,
          wordingChoiceOverride: wordingChoiceOverride || null,
          contractMetaOverride: contractMetaOverride || null,
          debug: debug || null,
        }),
        finalize: (payload) => payload,
      },
    },
    guard: {
      looksLikeMetaInstruction: () => false,
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  });

  return helpers;
}

test("resolveProvisionalSourceForTurn keeps action-route precedence", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "ACTION_PURPOSE_REFINE_CONFIRM",
      submittedTextIntent: "feedback_on_suggestion",
    }),
    "action_route"
  );
});

test("resolveProvisionalSourceForTurn treats suggestion feedback/reject intents as system-generated", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "feedback_on_suggestion",
    }),
    "system_generated"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "reject_suggestion_explicit",
    }),
    "system_generated"
  );
});

test("resolveProvisionalSourceForTurn treats feedback on current value as user-driven evidence", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "feedback_on_current_value",
    }),
    "user_input"
  );
});

test("resolveProvisionalSourceForTurn keeps user-input source for content and explicit accept intents", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "content_input",
    }),
    "user_input"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "accept_suggestion_explicit",
    }),
    "user_input"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    "user_input"
  );
});

test("isWordingChoiceIntentEligible allows only step-input/meta-none turns", () => {
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    }),
    true
  );
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "META_QUESTION",
      meta_topic: "NONE",
    }),
    false
  );
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "STEP_INPUT",
      meta_topic: "NO_STARTING_POINT",
    }),
    false
  );
});

test("resolveWordingChoiceSeedUserText anchors feedback on suggestion to the previous suggestion", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "suggestion",
      submittedUserText: "Dit klinkt nog een beetje saai.",
      userMessage: "Dit klinkt nog een beetje saai.",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    "Technische mkb-bedrijven met complexe productontwikkeling."
  );
});

test("resolveWordingChoiceSeedUserText keeps direct user content input as seed", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      submittedUserText: "Familiebedrijven met een technische kern.",
      userMessage: "Familiebedrijven met een technische kern.",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    "Familiebedrijven met een technische kern."
  );
});

test("resolveWordingChoiceSeedUserText returns empty seed for feedback on current value", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "feedback_on_current_value",
      submittedTextAnchor: "current_value",
      submittedUserText: "Ik vind dit een saaie formulering",
      userMessage: "Ik vind dit een saaie formulering",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    ""
  );
});

test("pickCurrentStepValueForFeedback prefers provisional value over final for single-value steps", () => {
  assert.equal(
    pickCurrentStepValueForFeedback({
      provisional_by_step: { dream: "Provisional dream" },
      dream_final: "Final dream",
    } as any, "dream"),
    "Provisional dream"
  );
  assert.equal(
    pickCurrentStepValueForFeedback({
      provisional_by_step: { bigwhy: "Provisional big why" },
      bigwhy_final: "Final big why",
    } as any, "bigwhy"),
    "Provisional big why"
  );
});

test("shouldTreatTurnAsCurrentValueFeedback detects single-value formulation feedback without pending picker", async () => {
  assert.equal(
    await shouldTreatTurnAsCurrentValueFeedback({
      state: {
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
      } as any,
      stepId: "dream",
      userMessage: "Ik vind dit een saaie formulering",
      model: "gpt-5-mini",
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "feedback_on_existing_content",
        user_variant_is_stepworthy: false,
      }),
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    true
  );
  assert.equal(
    await shouldTreatTurnAsCurrentValueFeedback({
      state: {
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
      } as any,
      stepId: "dream",
      userMessage: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken die bij hen passen.",
      model: "gpt-5-mini",
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "step_variant",
        user_variant_is_stepworthy: true,
      }),
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    false
  );
  assert.equal(
    await shouldTreatTurnAsCurrentValueFeedback({
      state: {
        current_step: "bigwhy",
        bigwhy_final: "Mindd bestaat zodat authentieke communicatie echte waarden weer centraal zet.",
      } as any,
      stepId: "bigwhy",
      userMessage: "Kun je deze gekozen Grote Waarom korter en krachtiger maken?",
      model: "gpt-5-mini",
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "feedback_on_existing_content",
        user_variant_is_stepworthy: false,
      }),
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    true
  );
});

test("shouldForcePendingWordingChoiceFromIntent forces pending only for suggestion-anchored feedback/reject intents", () => {
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "suggestion",
    }),
    true
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "reject_suggestion_explicit",
      submittedTextAnchor: "suggestion",
    }),
    true
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
    }),
    false
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "user_input",
    }),
    false
  );
});

test("runPostSpecialistPipeline keeps strategy local when a small addition is answered with a full rewrite", async () => {
  const existingStatements = [
    "Build recurring revenue with implementation retainers",
    "Work directly with internal decision-makers",
    "Keep delivery practical and measurable",
  ];
  const smallAddition = "Prioritize compliance-heavy sectors first.";
  let specialistUserMessage = "";
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message: "I sharpened the strategy set.",
      question: "Does this fit?",
      feedback_reason_text:
        "This suggestion keeps the remaining strategy difference concrete and easy to compare.",
      refined_formulation: [
        "Build predictable revenue through long-term implementation retainers",
        "Partner early with executive and operational stakeholders",
        "Serve complex organisations where change adoption matters",
        "Keep delivery practical, measurable, and audit-ready from day one",
      ].join("\n"),
      strategy: [
        "Build predictable revenue through long-term implementation retainers",
        "Partner early with executive and operational stakeholders",
        "Serve complex organisations where change adoption matters",
        "Keep delivery practical, measurable, and audit-ready from day one",
      ].join("\n"),
      statements: [
        "Build predictable revenue through long-term implementation retainers",
        "Partner early with executive and operational stakeholders",
        "Serve complex organisations where change adoption matters",
        "Keep delivery practical, measurable, and audit-ready from day one",
      ],
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    onSpecialistCall: (userMessage) => {
      specialistUserMessage = userMessage;
    },
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: smallAddition,
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: false,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: false,
    },
    rendering: {
      uiI18nTelemetry: null,
      lang: "en",
      ensureUiStrings: async (state) => state,
    },
    state: {
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        provisional_by_step: {},
        last_specialist_result: {
          statements: existingStatements,
          strategy: existingStatements.join("\n"),
          refined_formulation: existingStatements.join("\n"),
        },
      } as any,
      transientPendingScores: null,
      submittedUserText: smallAddition,
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: smallAddition,
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "strategy",
          specialist_to_call: "Strategy",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.equal(specialistUserMessage, smallAddition);
  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.deepEqual((payload.specialist as Record<string, unknown>).statements, existingStatements);
  assert.equal(String((payload.specialist as Record<string, unknown>).strategy || ""), existingStatements.join("\n"));
  assert.equal(String((payload.specialist as Record<string, unknown>).refined_formulation || ""), existingStatements.join("\n"));
  assert.ok(payload.wordingChoiceOverride);
  assert.equal(payload.wordingChoiceOverride?.mode, "list");
  assert.ok(Array.isArray((payload.specialist as Record<string, unknown>).wording_choice_compare_units));
  const compareUnits = ((payload.specialist as Record<string, unknown>).wording_choice_compare_units as Array<Record<string, unknown>>) || [];
  assert.equal(compareUnits.length >= 1, true);
});

test("runPostSpecialistPipeline restores Dream Builder canonical statements when a rewrite stays pending", async () => {
  const existingStatements = [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
  ];
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "REFINE",
      message: "Ik heb je wens vertaald naar een bredere verandering.",
      question: "Past deze formulering beter?",
      feedback_reason_text:
        "Je oorspronkelijke zin ging vooral over jouw wens, terwijl Dream Builder een bredere verandering in de wereld vraagt.",
      refined_formulation:
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
      dream: "",
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
      ],
      suggest_dreambuilder: "true",
      scoring_phase: "false",
      clusters: [],
      user_state: "ok",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: "I want my work to make a positive difference in people's lives.",
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: false,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: false,
    },
    rendering: {
      uiI18nTelemetry: null,
      lang: "en",
      ensureUiStrings: async (state) => state,
    },
    state: {
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_collect",
        dream_builder_statements: existingStatements,
        provisional_by_step: {},
        last_specialist_result: {
          statements: existingStatements,
          dream: existingStatements.join("\n"),
          refined_formulation: existingStatements.join("\n"),
        },
      } as any,
      transientPendingScores: null,
      submittedUserText: "I want my work to make a positive difference in people's lives.",
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: "I want my work to make a positive difference in people's lives.",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "dream",
          specialist_to_call: "DreamExplainer",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.deepEqual((payload.specialist as Record<string, unknown>).statements, existingStatements);
  assert.deepEqual((payload.state as Record<string, unknown>).dream_builder_statements, existingStatements);
  assert.ok(payload.wordingChoiceOverride);
});

test("runPostSpecialistPipeline keeps overlapping strategy merge proposals in a grouped compare picker", async () => {
  const existingStatements = [
    "Altijd gericht investeren in relevante technologische innovaties die de impact van klantcommunicatie vergroten",
    "Prototyping en MVP's bouwen als show what we can do for you",
  ];
  const userAddition =
    "Altijd gericht investeren in AI-technologieen die de impact van klantcommunicatie vergroten";
  let specialistUserMessage = "";
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message: "Je voorstel lijkt sterk op een bestaand focuspunt.",
      question: "Wil je het bestaande punt vervangen of beide behouden?",
      feedback_reason_text:
        "Deze suggestie maakt het overblijvende verschil concreet en goed vergelijkbaar.",
      refined_formulation: [
        "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
        "Prototyping en MVP's bouwen als show what we can do for you",
      ].join("\n"),
      strategy: [
        "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
        "Prototyping en MVP's bouwen als show what we can do for you",
      ].join("\n"),
      statements: [
        "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
        "Prototyping en MVP's bouwen als show what we can do for you",
      ],
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    onSpecialistCall: (userMessage) => {
      specialistUserMessage = userMessage;
    },
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: userAddition,
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: false,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: false,
    },
    rendering: {
      uiI18nTelemetry: null,
      lang: "en",
      ensureUiStrings: async (state) => state,
    },
    state: {
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        provisional_by_step: {},
        last_specialist_result: {
          statements: existingStatements,
          strategy: existingStatements.join("\n"),
          refined_formulation: existingStatements.join("\n"),
        },
      } as any,
      transientPendingScores: null,
      submittedUserText: userAddition,
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: userAddition,
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "strategy",
          specialist_to_call: "Strategy",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.equal(specialistUserMessage, userAddition);
  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_pending || ""), "true");
  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_compare_mode || ""), "grouped_units");
  assert.equal(String((payload.specialist as Record<string, unknown>).wording_choice_variant || ""), "grouped_list_units");
  assert.ok(payload.wordingChoiceOverride);
  assert.deepEqual(payload.wordingChoiceOverride?.user_items, [
    "Altijd gericht investeren in relevante technologische innovaties die de impact van klantcommunicatie vergroten",
    "Altijd gericht investeren in AI-technologieen die de impact van klantcommunicatie vergroten",
  ]);
  assert.deepEqual(payload.wordingChoiceOverride?.suggestion_items, [
    "Altijd gericht investeren in relevante AI-technologieen die de impact van klantcommunicatie vergroten",
  ]);
  assert.match(String(payload.wordingChoiceOverride?.instruction || ""), /Prototyping en MVP's bouwen/i);
});

test("runPostSpecialistPipeline sends first multiline strategy input straight to the specialist when no list exists", async () => {
  const firstInput = [
    "Altijd investeren in de nieuwste AI-technologieen die relevant zijn voor onze klanten",
    "Prototyping en MVP's bouwen als show what we can do for you",
  ].join("\n");
  let specialistUserMessage = "";
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message: "I structured your first strategy ideas.",
      question: "What else belongs in this strategy?",
      refined_formulation: firstInput,
      strategy: firstInput,
      statements: [
        "Altijd investeren in de nieuwste AI-technologieen die relevant zijn voor onze klanten",
        "Prototyping en MVP's bouwen als show what we can do for you",
      ],
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    onSpecialistCall: (userMessage) => {
      specialistUserMessage = userMessage;
    },
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: firstInput,
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: false,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: false,
    },
    rendering: {
      uiI18nTelemetry: null,
      lang: "en",
      ensureUiStrings: async (state) => state,
    },
    state: {
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        provisional_by_step: {},
        last_specialist_result: {},
      } as any,
      transientPendingScores: null,
      submittedUserText: firstInput,
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: firstInput,
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "strategy",
          specialist_to_call: "Strategy",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.equal(specialistUserMessage, firstInput);
  assert.equal(specialistUserMessage.startsWith("__BUSINESS_LIST_CLARIFY__"), false);
  assert.equal(String((payload.specialist as Record<string, unknown>).__business_list_turn_preclassified || ""), "");
});

test("runPostSpecialistPipeline escalates stuck support from server-side classifier even when specialist returns ok", async () => {
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message: "Laat me strategie nog eens uitleggen.",
      question: "Welke keuze wil je maken?",
      refined_formulation: "",
      strategy: "",
      feedback_reason_text: "",
      step_support_state: "ok",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
      statements: [],
    },
    classifyStepStuckTurn: async () => ({ is_stuck: true }),
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: "ik snap het niet",
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: false,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: false,
    },
    rendering: {
      uiI18nTelemetry: null,
      lang: "nl",
      ensureUiStrings: async (state) => state,
    },
    state: {
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        provisional_by_step: {},
        last_specialist_result: {},
      } as any,
      transientPendingScores: null,
      submittedUserText: "ik snap het niet",
      submittedTextIntent: "",
      submittedTextAnchor: "",
      rawNormalized: "ik snap het niet",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "strategy",
          specialist_to_call: "Strategy",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.equal(String((payload.specialist as Record<string, unknown>).step_support_state || ""), "stuck");
  assert.equal(
    Number(((payload.state as Record<string, unknown>).__step_stuck_count_by_step as Record<string, unknown>)?.strategy || 0),
    1
  );
});
