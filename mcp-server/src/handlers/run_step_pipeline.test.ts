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
import { createRunStepUiPayloadHelpers } from "./run_step_ui_payload.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";

function buildPipelineUiPayloadHelpers() {
  return createRunStepUiPayloadHelpers({
    shouldLogLocalDevDiagnostics: () => false,
    pickPrompt: (specialist) => String((specialist as Record<string, unknown>)?.question || "").trim(),
    buildTextForWidget: ({ specialist }) => {
      const record = (specialist || {}) as Record<string, unknown>;
      const candidates = [
        String(record.__canonical_text || "").trim(),
        String(record.dream || "").trim(),
        String(record.purpose || "").trim(),
        String(record.bigwhy || "").trim(),
        String(record.role || "").trim(),
        String(record.entity || "").trim(),
        String(record.rulesofthegame || "").trim(),
        String(record.refined_formulation || "").trim(),
        String(record.message || "").trim(),
      ].filter(Boolean);
      return candidates[0] || "";
    },
    deriveBootstrapContract: () => ({ waiting: false, ready: true, retry_hint: false, phase: "ready" }),
    deriveUiViewPayload: (variant) => (variant === "default" ? null : { variant }),
    sanitizeWidgetActionCodes: (actionCodes) => actionCodes,
    buildRenderedActionsFromMenu: () => [],
    buildQuestionTextFromActions: (prompt) => String(prompt || "").trim(),
    sanitizeEscapeInWidget: (specialist) => specialist,
    isWidgetSuppressedEscapeMenuId: () => false,
    enforcePromptInvariants: ({ specialist }) => specialist,
    isUiI18nV2Enabled: () => false,
    isMenuLabelKeysV1Enabled: () => false,
    isUiI18nV3LangBootstrapEnabled: () => false,
    isUiLocaleMetaV1Enabled: () => false,
    isUiLangSourceResolverV1Enabled: () => false,
    isUiStrictNonEnPendingV1Enabled: () => false,
    isUiStep0LangResetGuardV1Enabled: () => false,
    isUiBootstrapStateV1Enabled: () => false,
    isUiPendingNoFallbackTextV1Enabled: () => false,
    isUiStartTriggerLangResolveV1Enabled: () => false,
    isUiLocaleReadyGateV1Enabled: () => false,
    isUiNoPendingTextSuppressV1Enabled: () => false,
    isUiBootstrapWaitRetryV1Enabled: () => false,
    isUiBootstrapEventParityV1Enabled: () => false,
    isUiBootstrapPollActionV1Enabled: () => false,
    isUiWaitShellV2Enabled: () => false,
    isUiTranslationFastModelV1Enabled: () => false,
    isUiI18nCriticalKeysV1Enabled: () => false,
  });
}

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
    "wording.feedback.dream_builder.rewrite.default":
      "Your original wording is mainly about your own wish, while Dream Builder asks for a broader change in the world.",
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
      if (stepId === "purpose") return "purpose";
      if (stepId === "bigwhy") return "bigwhy";
      if (stepId === "role") return "role";
      if (stepId === "entity") return "entity";
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
    pickDualChoiceSuggestion: (_stepId, specialistResult) => {
      const record = (specialistResult as Record<string, unknown>) || {};
      const refined = String(record.refined_formulation || "").trim();
      if (refined) return refined;
      return Array.isArray(record.statements)
        ? (record.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).join("\n")
        : "";
    },
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
  specialistResults?: Record<string, unknown>[];
  onSpecialistCall?: (userMessage: string, state?: Record<string, unknown>) => void;
  dreamRuntimeMode?: "self" | "builder_collect" | "builder_scoring" | "builder_refine";
  pickBigWhyCandidate?: (result: Record<string, unknown>) => string;
  buildBigWhyTooLongFeedback?: () => Record<string, unknown>;
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
  const queuedResults = [...(params.specialistResults || [params.specialistResult])];
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
      callSpecialistStrictSafe: async ({ userMessage, state }) => {
        params.onSpecialistCall?.(String(userMessage || ""), (state || null) as Record<string, unknown> | null);
        const nextResult = queuedResults.length > 0 ? queuedResults.shift() || params.specialistResult : params.specialistResult;
        return {
          ok: true,
          value: {
            specialistResult: nextResult,
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
      getDreamRuntimeMode: () => params.dreamRuntimeMode || "self",
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
      pickBigWhyCandidate: (result) => params.pickBigWhyCandidate?.(result) || "",
      countWords: (text: string) =>
        String(text || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length,
      buildBigWhyTooLongFeedback: () => params.buildBigWhyTooLongFeedback?.() || ({}),
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

function buildRefineAdjustPipelineHarness(params: {
  stepId: string;
  activeSpecialist: string;
  specialistResult: Record<string, unknown>;
  onSpecialistCall?: (userMessage: string) => void;
  dreamRuntimeMode?: "self" | "builder_collect" | "builder_scoring" | "builder_refine";
  initialState?: Record<string, unknown>;
}) {
  const wordingHelpers = buildPipelineWordingHelpers();
  const uiPayloadHelpers = buildPipelineUiPayloadHelpers();
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
      applyPostSpecialistStateMutations: ({ prevState, decision, specialistResult }) =>
        ({
          ...prevState,
          current_step: String((decision as Record<string, unknown>).current_step || prevState.current_step || ""),
          active_specialist: String(
            (decision as Record<string, unknown>).specialist_to_call || prevState.active_specialist || ""
          ),
          last_specialist_result: specialistResult,
        }) as any,
      getDreamRuntimeMode: () => params.dreamRuntimeMode || "self",
      isMetaOfftopicFallbackTurn: () => false,
      shouldTreatAsStepContributingInput: () => true,
      hasDreamSpecialistCandidate: () => false,
      buildDreamRefineFallbackSpecialist: (base) => base,
      strategyStatementsForConsolidateGuard: (result, state) => {
        if (Array.isArray((result as Record<string, unknown>).statements)) {
          return ((result as Record<string, unknown>).statements as unknown[])
            .map((item) => String(item || "").trim())
            .filter(Boolean);
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
        contractId: `${params.stepId}:ask:test`,
        contractVersion: "test",
        textKeys: [],
      }),
      validateRenderedContractOrRecover: ({ rendered, state }) => ({
        rendered: {
          status: "incomplete_output",
          specialist: (rendered as Record<string, unknown>).specialist || {},
          contractId: String(
            ((rendered as Record<string, unknown>).specialist as Record<string, unknown> | undefined)?.ui_contract_id ||
            `${params.stepId}:ASK:test`
          ),
          contractVersion: "test",
          textKeys: [],
          uiActionCodes: [],
          uiActions: [],
        },
        state,
        violation: null,
      }),
      applyUiPhaseByStep: () => {},
      buildContractId: () => `${params.stepId}:ask:test`,
    },
    wording: {
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "step_variant",
        user_variant_is_stepworthy: true,
      }),
      classifyStepStuckTurn: undefined,
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
            actionCodes: null as any,
            renderedActions: null as any,
            contractMeta: {
              contractId: String((specialist as Record<string, unknown>).ui_contract_id || `${params.stepId}:ASK:test`),
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: ({
          state,
          specialist,
          responseUiFlags,
          actionCodesOverride,
          renderedActionsOverride,
          wordingChoiceOverride,
          contractMetaOverride,
          debug,
        }) => {
          const attached = uiPayloadHelpers.attachRegistryPayload(
            {
              ok: true,
              tool: "run_step",
              current_step_id: String((state as Record<string, unknown>).current_step || ""),
              active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
              text: uiPayloadHelpers
                ? String(
                    (specialist as Record<string, unknown>).__canonical_text ||
                    (specialist as Record<string, unknown>)[String((state as Record<string, unknown>).current_step || "")] ||
                    (specialist as Record<string, unknown>).refined_formulation ||
                    (specialist as Record<string, unknown>).message ||
                    ""
                  ).trim()
                : "",
              prompt: String((specialist as Record<string, unknown>).question || "").trim(),
              specialist,
              state,
            },
            specialist,
            responseUiFlags,
            actionCodesOverride,
            renderedActionsOverride,
            wordingChoiceOverride,
            contractMetaOverride
          );
          return {
            ...attached,
            wordingChoiceOverride: wordingChoiceOverride || null,
            contractMetaOverride: contractMetaOverride || null,
            debug: debug || null,
          };
        },
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

test("shouldTreatTurnAsCurrentValueFeedback never hijacks Dream Builder turns into current-value feedback", async () => {
  assert.equal(
    await shouldTreatTurnAsCurrentValueFeedback({
      state: {
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
      } as any,
      stepId: "dream",
      userMessage: "I want my work to make a positive difference in people's lives.",
      model: "gpt-5-mini",
      dreamRuntimeModeRaw: "builder_collect",
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "feedback_on_existing_content",
        user_variant_is_stepworthy: false,
      }),
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    false
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

test("runPostSpecialistPipeline recovers Dream Builder compare when a material rewrite is returned without explicit feedback_reason_text", async () => {
  const existingStatements = [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
  ];
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message:
        "Je uitspraken zijn sterk persoonlijk en gaan vooral over wat jij wilt bereiken. In deze oefening zoeken we naar bredere veranderingen in de wereld of de samenleving.",
      question:
        "Als je 5 tot 10 jaar vooruitkijkt, welke grote kansen of dreigingen zie je, en welke positieve veranderingen hoop je?",
      feedback_reason_text: "",
      refined_formulation: [
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
        "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
      ].join("\n"),
      dream: "",
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Over 5 tot 10 jaar zullen meer mensen werk zoeken dat zichtbaar bijdraagt aan het leven van anderen.",
        "Er zal meer waarde worden gehecht aan het creëren van iets dat generaties overstijgt en blijvende betekenis heeft.",
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
      userMessage: [
        "I want my work to make a positive difference in people's lives.",
        "I want to build something that lasts beyond me.",
      ].join("\n\n"),
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
      submittedUserText: [
        "I want my work to make a positive difference in people's lives.",
        "I want to build something that lasts beyond me.",
      ].join("\n\n"),
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: [
        "I want my work to make a positive difference in people's lives.",
        "I want to build something that lasts beyond me.",
      ].join("\n\n"),
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
  assert.match(
    String(payload.wordingChoiceOverride?.compare_feedback?.text || ""),
    /broader change in the world/i
  );
});

test("runPostSpecialistPipeline keeps Dream Builder compare active even when a canonical dream already exists", async () => {
  const existingStatements = [
    "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
  ];
  const helpers = buildStrategyPipelineHarness({
    dreamRuntimeMode: "builder_collect",
    specialistResult: {
      action: "ASK",
      message:
        "Je uitspraken zijn heel persoonlijk en gaan vooral over wat jij wilt bereiken. In deze oefening zoeken we naar bredere veranderingen in de wereld of de samenleving.",
      question:
        "Als je 5 tot 10 jaar vooruitkijkt, welke grote kansen of dreigingen zie je, en welke positieve veranderingen hoop je?",
      feedback_reason_text: "",
      refined_formulation: [
        "Over 5 tot 10 jaar zal het belangrijker zijn dat werk een positieve impact heeft op het leven van mensen.",
        "Bedrijven zullen vaker een afspiegeling zijn van de waarden en identiteit van hun oprichters.",
      ].join("\n"),
      dream:
        "Mindd droomt van een wereld waarin mensen en organisaties keuzes maken die zichtbaar goed doen.",
      statements: [
        "Over 5 tot 10 jaar zullen meer mensen streven naar werk dat een positieve impact heeft op het leven van anderen.",
        "Over 5 tot 10 jaar zal het belangrijker zijn dat werk een positieve impact heeft op het leven van mensen.",
        "Bedrijven zullen vaker een afspiegeling zijn van de waarden en identiteit van hun oprichters.",
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
      userMessage: [
        "I want my work to make a positive difference in people's lives.",
        "I want my business to reflect who I am and what I stand for.",
      ].join("\n\n"),
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
        dream_final:
          "Mindd droomt van een wereld waarin mensen en organisaties keuzes maken die zichtbaar goed doen.",
        dream_builder_statements: existingStatements,
        provisional_by_step: {},
        last_specialist_result: {
          statements: existingStatements,
          dream: existingStatements.join("\n"),
          refined_formulation: existingStatements.join("\n"),
        },
      } as any,
      transientPendingScores: null,
      submittedUserText: [
        "I want my work to make a positive difference in people's lives.",
        "I want my business to reflect who I am and what I stand for.",
      ].join("\n\n"),
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      rawNormalized: [
        "I want my work to make a positive difference in people's lives.",
        "I want my business to reflect who I am and what I stand for.",
      ].join("\n\n"),
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

test("runPostSpecialistPipeline repairs Big Why suggestion routes into explicit suggestion fields and never shortens them", async () => {
  const specialistCalls: string[] = [];
  const longCandidate = [
    "Mensen verdienen het om zich gezien en geraakt te voelen zodat zij hun volledige potentieel kunnen ontdekken",
    "en benutten in een wereld waarin merken en communicatie hen niet reduceren maar juist helpen",
    "om met vertrouwen en waardigheid keuzes te maken die hun leven verrijken.",
  ].join(" ");
  const helpers = buildStrategyPipelineHarness({
    specialistResult: {
      action: "ASK",
      message: "",
      question: "",
      refined_formulation: "",
      bigwhy: "",
      suggestion_intro: "",
      suggestion_items: [],
      suggestion_outro: "",
      suggestion_item_style: "bullets",
      feedback_reason_text: "",
      feedback_mode: "none",
      step_support_state: "ok",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    specialistResults: [
      {
        action: "ASK",
        message: [
          "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD",
          "- Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
          "- Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
          "- Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
          "",
          "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
        ].join("\n"),
        question: "",
        refined_formulation: longCandidate,
        bigwhy: longCandidate,
        suggestion_intro: "",
        suggestion_items: [],
        suggestion_outro: "",
        suggestion_item_style: "bullets",
        feedback_reason_text: "Dit had geen refine-feedback mogen zijn.",
        feedback_mode: "none",
        step_support_state: "ok",
        wants_recap: false,
        is_offtopic: false,
        user_intent: "STEP_INPUT",
        meta_topic: "NONE",
      },
      {
        action: "ASK",
        message: [
          "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD",
          "- Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
          "- Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
          "- Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
          "",
          "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
        ].join("\n"),
        question: "",
        refined_formulation: "",
        bigwhy: "",
        suggestion_intro: "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD",
        suggestion_items: [
          "Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
          "Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
          "Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
        ],
        suggestion_outro: "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
        suggestion_item_style: "bullets",
        feedback_reason_text: "",
        feedback_mode: "none",
        step_support_state: "ok",
        wants_recap: false,
        is_offtopic: false,
        user_intent: "STEP_INPUT",
        meta_topic: "NONE",
      },
    ],
    onSpecialistCall: (userMessage) => {
      specialistCalls.push(userMessage);
    },
    pickBigWhyCandidate: (result) =>
      String((result as Record<string, unknown>).bigwhy || (result as Record<string, unknown>).refined_formulation || ""),
  });

  const payload = await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: "__ROUTE__BIGWHY_GIVE_EXAMPLE__",
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
      ensureUiStrings: async (state) => ({
        ...state,
        ui_strings: {
          "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
          "offtopic.step.bigwhy": "Grote Waarom",
        },
      }),
    },
    state: {
      state: {
        current_step: "bigwhy",
        active_specialist: "BigWhy",
        business_name: "Mindd",
        provisional_by_step: {},
        last_specialist_result: {},
      } as any,
      transientPendingScores: null,
      submittedUserText: "",
      submittedTextIntent: "",
      submittedTextAnchor: "",
      rawNormalized: "__ROUTE__BIGWHY_GIVE_EXAMPLE__",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-5-mini",
      decideOrchestration: () =>
        ({
          current_step: "bigwhy",
          specialist_to_call: "BigWhy",
          show_session_intro: "false",
          show_step_intro: "false",
        }) as any,
      rememberLlmCall: () => {},
    },
  } as any);

  assert.deepEqual((payload.specialist as Record<string, unknown>).suggestion_items, [
    "Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
    "Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
    "Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
  ]);
  assert.equal(String((payload.specialist as Record<string, unknown>).bigwhy || ""), "");
  assert.equal(String((payload.specialist as Record<string, unknown>).refined_formulation || ""), "");
  assert.equal(String((payload.specialist as Record<string, unknown>).feedback_reason_text || ""), "");
  assert.equal(
    specialistCalls.some((message) => String(message || "").startsWith("__SHORTEN_BIGWHY__")),
    false
  );
  assert.equal(
    specialistCalls.some((message) => String(message || "").includes("STRUCTURED_SUGGESTIONS_CONTRACT")),
    true
  );
});

test("runPostSpecialistPipeline exposes a renderable next widget outcome for every visible refine-adjust action", async () => {
  const scenarios = [
    {
      actionCode: "ACTION_DREAM_EXPLAINER_REFINE_ADJUST",
      stepId: "dream",
      activeSpecialist: "DreamExplainer",
      menuId: "DREAM_EXPLAINER_MENU_REFINE",
      route: "__ROUTE__DREAM_EXPLAINER_REFINE__",
      dreamRuntimeMode: "builder_refine" as const,
      previousValue: "Mindd droomt van een wereld waarin mensen bewuster kiezen.",
      specialistResult: {
        action: "ASK",
        message: "I tightened the direction so the next choice stays focused on the broader change.",
        question: "Which broader change should this dream emphasize more clearly?",
        suggest_dreambuilder: "true",
        ui_contract_id: "dream:incomplete_output:DREAM_EXPLAINER_MENU_REFINE",
      },
      expectedOutcome: "ask" as const,
      expectedQuestion: "Which broader change should this dream emphasize more clearly?",
      expectedText:
        "I tightened the direction so the next choice stays focused on the broader change.",
      expectedViewVariant: "dream_builder_refine",
    },
    {
      actionCode: "ACTION_PURPOSE_REFINE_ADJUST",
      stepId: "purpose",
      activeSpecialist: "Purpose",
      menuId: "PURPOSE_MENU_REFINE",
      route: "__ROUTE__PURPOSE_REFINE__",
      previousValue: "We help founders grow faster.",
      specialistResult: {
        action: "REFINE",
        message: "I made the purpose more concrete for the kind of change you described.",
        question: "Does this purpose fit better?",
        refined_formulation: "We help founders turn difficult growth choices into confident decisions.",
        purpose: "We help founders turn difficult growth choices into confident decisions.",
        ui_contract_id: "purpose:valid_output:PURPOSE_MENU_REFINE",
      },
      expectedOutcome: "refine" as const,
      expectedQuestion: "Does this purpose fit better?",
      expectedText: "We help founders turn difficult growth choices into confident decisions.",
    },
    {
      actionCode: "ACTION_BIGWHY_REFINE_ADJUST",
      stepId: "bigwhy",
      activeSpecialist: "BigWhy",
      menuId: "BIGWHY_MENU_REFINE",
      route: "__ROUTE__BIGWHY_REFINE__",
      previousValue: "Because communication matters.",
      specialistResult: {
        action: "REFINE",
        message: "I sharpened the underlying reason so it lands on the tension you named.",
        question: "Does this Big Why fit better?",
        refined_formulation: "Because better communication helps people make brave decisions without losing themselves.",
        bigwhy: "Because better communication helps people make brave decisions without losing themselves.",
        ui_contract_id: "bigwhy:valid_output:BIGWHY_MENU_REFINE",
      },
      expectedOutcome: "refine" as const,
      expectedQuestion: "Does this Big Why fit better?",
      expectedText:
        "Because better communication helps people make brave decisions without losing themselves.",
    },
    {
      actionCode: "ACTION_ROLE_REFINE_ADJUST",
      stepId: "role",
      activeSpecialist: "Role",
      menuId: "ROLE_MENU_REFINE",
      route: "__ROUTE__ROLE_ADJUST__",
      previousValue: "Strategic guide",
      specialistResult: {
        action: "ASK",
        message: "I need one more angle so I can adjust the role without making it too broad.",
        question: "Do you want this role to sound more like a guide, a challenger, or an implementing partner?",
        ui_contract_id: "role:incomplete_output:ROLE_MENU_REFINE",
      },
      expectedOutcome: "ask" as const,
      expectedQuestion:
        "Do you want this role to sound more like a guide, a challenger, or an implementing partner?",
      expectedText: "I need one more angle so I can adjust the role without making it too broad.",
    },
    {
      actionCode: "ACTION_ENTITY_EXAMPLE_REFINE",
      stepId: "entity",
      activeSpecialist: "Entity",
      menuId: "ENTITY_MENU_EXAMPLE",
      route: "__ROUTE__ENTITY_REFINE__",
      previousValue: "A strategy agency",
      specialistResult: {
        action: "REFINE",
        message: "I reformulated the entity so the category and qualifiers both move with your input.",
        question: "Does this entity fit better?",
        refined_formulation: "A strategic decision studio for complex growth questions.",
        entity: "A strategic decision studio for complex growth questions.",
        ui_contract_id: "entity:valid_output:ENTITY_MENU_EXAMPLE",
      },
      expectedOutcome: "refine" as const,
      expectedQuestion: "Does this entity fit better?",
      expectedText: "A strategic decision studio for complex growth questions.",
    },
    {
      actionCode: "ACTION_RULES_REFINE_ADJUST",
      stepId: "rulesofthegame",
      activeSpecialist: "RulesOfTheGame",
      menuId: "RULES_MENU_REFINE",
      route: "__ROUTE__RULES_ADJUST__",
      previousValue: "We always move fast.",
      specialistResult: {
        action: "ASK",
        message: "I need one concrete trade-off so the rule can be adjusted without becoming vague.",
        question: "When speed and care conflict, which one should this rule protect first?",
        ui_contract_id: "rulesofthegame:incomplete_output:RULES_MENU_REFINE",
      },
      expectedOutcome: "ask" as const,
      expectedQuestion: "When speed and care conflict, which one should this rule protect first?",
      expectedText:
        "I need one concrete trade-off so the rule can be adjusted without becoming vague.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const registryEntry = ACTIONCODE_REGISTRY.actions[scenario.actionCode];
    assert.ok(registryEntry, `missing registry entry for ${scenario.actionCode}`);
    assert.equal(registryEntry.route, scenario.route);
    assert.ok(
      (ACTIONCODE_REGISTRY.menus[scenario.menuId] || []).includes(scenario.actionCode),
      `${scenario.menuId} should expose ${scenario.actionCode}`
    );

    let specialistUserMessage = "";
    const helpers = buildRefineAdjustPipelineHarness({
      stepId: scenario.stepId,
      activeSpecialist: scenario.activeSpecialist,
      specialistResult: scenario.specialistResult,
      dreamRuntimeMode: scenario.dreamRuntimeMode,
      onSpecialistCall: (userMessage) => {
        specialistUserMessage = userMessage;
      },
    });

    const payload = await helpers.runPostSpecialistPipeline({
      routing: {
        userMessage: scenario.route,
        actionCodeRaw: scenario.actionCode,
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
          current_step: scenario.stepId,
          active_specialist: scenario.activeSpecialist,
          provisional_by_step: {},
          last_specialist_result: {
            refined_formulation: scenario.previousValue,
            [scenario.stepId]: scenario.previousValue,
          },
        } as any,
        transientPendingScores: null,
        submittedUserText: "",
        submittedTextIntent: "",
        submittedTextAnchor: "",
        rawNormalized: scenario.route,
        pristineAtEntry: true,
      },
      specialist: {
        model: "gpt-5-mini",
        decideOrchestration: () =>
          ({
            current_step: scenario.stepId,
            specialist_to_call: scenario.activeSpecialist,
            show_session_intro: "false",
            show_step_intro: "false",
          }) as any,
        rememberLlmCall: () => {},
      },
    } as any);

    assert.equal(specialistUserMessage, scenario.route);
    assert.ok(payload.ui, `${scenario.actionCode} should return a renderable ui payload`);
    assert.deepEqual(payload.ui?.action_codes, ACTIONCODE_REGISTRY.menus[scenario.menuId]);
    assert.equal(payload.ui?.contract_id, scenario.specialistResult.ui_contract_id);
    assert.equal(payload.ui?.questionText, scenario.expectedQuestion);

    if (scenario.expectedViewVariant) {
      assert.equal(payload.ui?.view?.variant, scenario.expectedViewVariant);
    }

    assert.equal(payload.text, scenario.expectedText);
    if (scenario.expectedOutcome === "refine") {
      assert.notEqual(payload.text, scenario.previousValue);
    }
  }
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

test("runPostSpecialistPipeline passes current-turn stuck classification into the specialist context", async () => {
  let capturedState: Record<string, unknown> | null = null;
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
    onSpecialistCall: (_userMessage, stateArg) => {
      capturedState = (stateArg || null) as Record<string, unknown> | null;
    },
    classifyStepStuckTurn: async () => ({ is_stuck: true }),
  });

  await helpers.runPostSpecialistPipeline({
    routing: {
      userMessage: "ik weet het niet",
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
      submittedUserText: "ik weet het niet",
      submittedTextIntent: "",
      submittedTextAnchor: "",
      rawNormalized: "ik weet het niet",
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

  assert.equal(String(capturedState?.__current_turn_step_support_state || ""), "stuck");
});
