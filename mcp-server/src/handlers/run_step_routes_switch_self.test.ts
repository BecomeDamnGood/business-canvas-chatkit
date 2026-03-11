import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRouteHelpers } from "./run_step_routes.js";

test("dream_switch_to_self uses catalog copy for switch-to-self body", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      roleSpecialist: "Role",
      presentationSpecialist: "Presentation",
    },
    tokens: {
      dreamPickOneRouteToken: "__ROUTE__DREAM_PICK_ONE__",
      roleChooseForMeRouteToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      presentationMakeRouteToken: "__ROUTE__PRESENTATION_MAKE__",
      switchToSelfDreamToken: "__SWITCH_TO_SELF_DREAM__",
      dreamStartExerciseRouteToken: "__ROUTE__DREAM_START_EXERCISE__",
    },
    wording: {
      wordingSelectionMessage: () => "",
      pickPrompt: (specialist: Record<string, unknown>) => String(specialist.question || ""),
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) => String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: () => {
        throw new Error("applyStateUpdate should not be called in this test");
      },
      setDreamRuntimeMode: (state: Record<string, unknown>, mode: string) => {
        state.__dream_runtime_mode = mode;
      },
      getDreamRuntimeMode: () => "self",
      isUiStateHygieneSwitchV1Enabled: () => false,
      clearStepInteractiveState: (state: Record<string, unknown>) => state,
    },
    contracts: {
      renderFreeTextTurnPolicy: () => {
        throw new Error("renderFreeTextTurnPolicy should not be called in this test");
      },
      validateRenderedContractOrRecover: () => {
        throw new Error("validateRenderedContractOrRecover should not be called in this test");
      },
      applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
        if (!state.__ui_phase_by_step || typeof state.__ui_phase_by_step !== "object") {
          state.__ui_phase_by_step = {};
        }
        state.__ui_phase_by_step[stepId] = contractId;
      },
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => {
        throw new Error("ensureStartState should not be called in this test");
      },
      parseStep0Final: () => ({ name: "TBD" }),
      inferStep0SeedFromInitialMessage: () => "",
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (state: Record<string, unknown>, key: string, fallback: string) => {
        const map =
          state && typeof state.ui_strings === "object"
            ? (state.ui_strings as Record<string, unknown>)
            : {};
        const value = String(map[key] || "").trim();
        return value || fallback;
      },
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        throw new Error("callSpecialistStrictSafe should not be called in this test");
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any }) => ({
          ok: true,
          value: {
            state: params.state,
            specialist: params.specialist,
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "dream::incomplete_output::DREAM_MENU_INTRO",
              contractVersion: "1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          specialist: params.specialist,
          state: params.state,
        }),
        finalize: (payload: Record<string, unknown>) => payload,
      },
    },
    suggestions: {
      pickDreamSuggestionFromPreviousState: () => "",
      pickDreamCandidateFromState: () => "",
      pickRoleSuggestionFromPreviousState: () => "",
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  };

  const helpers = createRunStepRouteHelpers<any>(ports);
  const context: any = {
    routing: {
      userMessage: "__SWITCH_TO_SELF_DREAM__",
      actionCodeRaw: "ACTION_DREAM_SWITCH_TO_SELF",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "nl",
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
    },
    state: {
      state: {
        current_step: "dream",
        ui_strings: {
          "dreamBuilder.switchSelf.headline": "Ga verder met de Droom-oefening.",
          "dreamBuilder.switchSelf.body.intro":
            "Dat is een sterke manier om te beginnen. Je eigen droom opschrijven helpt scherp te krijgen wat voor jou en je bedrijf echt belangrijk is.",
          "dreamBuilder.switchSelf.body.helper":
            "Neem even de tijd om een eerste versie van je droom te schrijven. Ik help je die zo nodig verfijnen.",
        },
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  };

  const response = await helpers.handleSpecialRouteRegistry(context);
  assert.ok(response, "expected dream_switch_to_self route response");
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(
    String(specialist.message || ""),
    [
      "Ga verder met de Droom-oefening.",
      "Dat is een sterke manier om te beginnen. Je eigen droom opschrijven helpt scherp te krijgen wat voor jou en je bedrijf echt belangrijk is.",
      "Neem even de tijd om een eerste versie van je droom te schrijven. Ik help je die zo nodig verfijnen.",
    ].join("\n\n")
  );
});

test("dream_switch_to_self clears staged dream value but preserves Dream Builder resume context", async () => {
  let specialistCalled = false;
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      roleSpecialist: "Role",
      presentationSpecialist: "Presentation",
    },
    tokens: {
      dreamPickOneRouteToken: "__ROUTE__DREAM_PICK_ONE__",
      roleChooseForMeRouteToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      presentationMakeRouteToken: "__ROUTE__PRESENTATION_MAKE__",
      switchToSelfDreamToken: "__SWITCH_TO_SELF_DREAM__",
      dreamStartExerciseRouteToken: "__ROUTE__DREAM_START_EXERCISE__",
    },
    wording: {
      wordingSelectionMessage: () => "",
      pickPrompt: (specialist: Record<string, unknown>) => String(specialist.question || ""),
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) => String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: () => {
        throw new Error("applyStateUpdate should not be called in this test");
      },
      setDreamRuntimeMode: (state: Record<string, unknown>, mode: string) => {
        state.__dream_runtime_mode = mode;
      },
      getDreamRuntimeMode: () => "self",
      isUiStateHygieneSwitchV1Enabled: () => false,
      clearStepInteractiveState: (state: Record<string, unknown>) => state,
    },
    contracts: {
      renderFreeTextTurnPolicy: () => {
        throw new Error("renderFreeTextTurnPolicy should not be called in this test");
      },
      validateRenderedContractOrRecover: () => {
        throw new Error("validateRenderedContractOrRecover should not be called in this test");
      },
      applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
        if (!state.__ui_phase_by_step || typeof state.__ui_phase_by_step !== "object") {
          state.__ui_phase_by_step = {};
        }
        state.__ui_phase_by_step[stepId] = contractId;
      },
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => {
        throw new Error("ensureStartState should not be called in this test");
      },
      parseStep0Final: () => ({ name: "TBD" }),
      inferStep0SeedFromInitialMessage: () => "",
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (state: Record<string, unknown>, key: string, fallback: string) => {
        const map =
          state && typeof state.ui_strings === "object"
            ? (state.ui_strings as Record<string, unknown>)
            : {};
        const value = String(map[key] || "").trim();
        return value || fallback;
      },
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        specialistCalled = true;
        throw new Error("callSpecialistStrictSafe should not be called in this test");
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any }) => ({
          ok: true,
          value: {
            state: params.state,
            specialist: params.specialist,
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "dream::incomplete_output::DREAM_MENU_INTRO",
              contractVersion: "1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          specialist: params.specialist,
          state: params.state,
        }),
        finalize: (payload: Record<string, unknown>) => payload,
      },
    },
    suggestions: {
      pickDreamSuggestionFromPreviousState: () => "",
      pickDreamCandidateFromState: () => "Deze oude waarde mag niet meer gebruikt worden.",
      pickRoleSuggestionFromPreviousState: () => "",
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  };

  const helpers = createRunStepRouteHelpers<any>(ports);
  const context: any = {
    routing: {
      userMessage: "__SWITCH_TO_SELF_DREAM__",
      actionCodeRaw: "ACTION_DREAM_SWITCH_TO_SELF",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "nl",
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
    },
    state: {
      state: {
        current_step: "dream",
        dream_final: "Dit was eerder ten onrechte als droom opgeslagen.",
        dream_builder_statements: [
          "Mensen verwachten meer transparantie van bedrijven.",
          "Mentale gezondheid krijgt meer prioriteit op het werk.",
        ],
        dream_scoring_statements: [
          "Mensen verwachten meer transparantie van bedrijven.",
          "Mentale gezondheid krijgt meer prioriteit op het werk.",
        ],
        dream_scores: [[8, 9], [7, 8]],
        dream_top_clusters: [{ theme: "Transparantie", average: 8.5 }],
        dream_awaiting_direction: "false",
        provisional_by_step: {
          dream: "Dit was eerder ten onrechte als droom opgeslagen.",
        },
        provisional_source_by_step: {
          dream: "action_route",
        },
        ui_strings: {
          "dreamBuilder.switchSelf.headline": "Ga verder met de Droom-oefening.",
          "dreamBuilder.switchSelf.body.intro":
            "Dat is een sterke manier om te beginnen. Je eigen droom opschrijven helpt scherp te krijgen wat voor jou en je bedrijf echt belangrijk is.",
          "dreamBuilder.switchSelf.body.helper":
            "Neem even de tijd om een eerste versie van je droom te schrijven. Ik help je die zo nodig verfijnen.",
        },
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  };

  const response = await helpers.handleSpecialRouteRegistry(context);
  assert.ok(response, "expected dream_switch_to_self route response");
  assert.equal(specialistCalled, false);

  const state = (response as Record<string, any>).state || {};
  assert.equal(String(state.dream_final || ""), "");
  assert.equal(String((state.provisional_by_step || {}).dream || ""), "");
  assert.equal(String((state.provisional_source_by_step || {}).dream || ""), "");
  assert.deepEqual(state.dream_builder_statements, [
    "Mensen verwachten meer transparantie van bedrijven.",
    "Mentale gezondheid krijgt meer prioriteit op het werk.",
  ]);
  assert.deepEqual(state.dream_scoring_statements, [
    "Mensen verwachten meer transparantie van bedrijven.",
    "Mentale gezondheid krijgt meer prioriteit op het werk.",
  ]);
  assert.deepEqual(state.dream_scores, [[8, 9], [7, 8]]);
  assert.deepEqual(state.dream_top_clusters, [{ theme: "Transparantie", average: 8.5 }]);
});

test("dream_start_exercise reuses saved Dream Builder score context when it still matches the statements", async () => {
  const calls: Array<{ state: Record<string, unknown>; userMessage: string }> = [];
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      roleSpecialist: "Role",
      presentationSpecialist: "Presentation",
    },
    tokens: {
      dreamPickOneRouteToken: "__ROUTE__DREAM_PICK_ONE__",
      roleChooseForMeRouteToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      presentationMakeRouteToken: "__ROUTE__PRESENTATION_MAKE__",
      switchToSelfDreamToken: "__SWITCH_TO_SELF_DREAM__",
      dreamStartExerciseRouteToken: "__ROUTE__DREAM_START_EXERCISE__",
    },
    wording: {
      wordingSelectionMessage: () => "",
      pickPrompt: (specialist: Record<string, unknown>) => String(specialist.question || ""),
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) => String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: ({ prev, specialistResult }: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...prev,
        last_specialist_result: specialistResult,
      }),
      setDreamRuntimeMode: (state: Record<string, unknown>, mode: string) => {
        state.__dream_runtime_mode = mode;
      },
      getDreamRuntimeMode: (state: Record<string, unknown>) => String(state.__dream_runtime_mode || "self"),
      isUiStateHygieneSwitchV1Enabled: () => false,
      clearStepInteractiveState: (state: Record<string, unknown>) => state,
    },
    contracts: {
      renderFreeTextTurnPolicy: () => {
        throw new Error("renderFreeTextTurnPolicy should not be called in this test");
      },
      validateRenderedContractOrRecover: () => {
        throw new Error("validateRenderedContractOrRecover should not be called in this test");
      },
      applyUiPhaseByStep: () => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => {
        throw new Error("ensureStartState should not be called in this test");
      },
      parseStep0Final: () => ({ name: "TBD" }),
      inferStep0SeedFromInitialMessage: () => "",
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async ({ state, userMessage }: { state: Record<string, unknown>; userMessage: string }) => {
        calls.push({ state: { ...state }, userMessage });
        return {
          ok: true,
          value: {
            specialistResult: {
              action: "ASK",
              message: "Samenvatting van je Dream Builder-context.",
              question: "Wil je deze richting aanscherpen?",
              refined_formulation: "Een scherper geformuleerde droom.",
              dream: "Een scherper geformuleerde droom.",
              suggest_dreambuilder: "true",
              statements: state.dream_builder_statements,
              user_state: "ok",
              wants_recap: false,
              is_offtopic: false,
              user_intent: "STEP_INPUT",
              meta_topic: "NONE",
              scoring_phase: "false",
              clusters: [],
            },
            attempts: 1,
          },
        };
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any }) => ({
          ok: true,
          value: {
            state: params.state,
            specialist: params.specialist,
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "dream::incomplete_output::DREAM_MENU_INTRO",
              contractVersion: "1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          specialist: params.specialist,
          state: params.state,
          debug: params.debug,
        }),
        finalize: (payload: Record<string, unknown>) => payload,
      },
    },
    suggestions: {
      pickDreamSuggestionFromPreviousState: () => "",
      pickDreamCandidateFromState: () => "",
      pickRoleSuggestionFromPreviousState: () => "",
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  };

  const helpers = createRunStepRouteHelpers<any>(ports);
  const statements = Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`);
  const context: any = {
    routing: {
      userMessage: "__ROUTE__DREAM_START_EXERCISE__",
      actionCodeRaw: "ACTION_DREAM_START_EXERCISE",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "nl",
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
    },
    state: {
      state: {
        current_step: "dream",
        __dream_runtime_mode: "self",
        dream_builder_statements: statements,
        dream_scoring_statements: [...statements],
        dream_scores: [[8, 9, 7]],
        dream_top_clusters: [{ theme: "Vertrouwen", average: 8 }],
        dream_awaiting_direction: "false",
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  };

  const response = await helpers.handleSpecialRouteRegistry(context);
  assert.ok(response, "expected dream_start_exercise route response");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.userMessage, "");
  assert.equal(String(calls[0]?.state.__dream_runtime_mode || ""), "builder_scoring");
  assert.equal(String(calls[0]?.state.dream_awaiting_direction || ""), "true");
  assert.deepEqual(calls[0]?.state.dream_builder_statements, statements);

  const state = (response as Record<string, any>).state || {};
  assert.equal(String(state.__dream_runtime_mode || ""), "builder_refine");
  assert.deepEqual(state.dream_builder_statements, statements);
});

test("dream_start_exercise drops stale score context when statements no longer match", async () => {
  const calls: Array<{ state: Record<string, unknown>; userMessage: string }> = [];
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      roleSpecialist: "Role",
      presentationSpecialist: "Presentation",
    },
    tokens: {
      dreamPickOneRouteToken: "__ROUTE__DREAM_PICK_ONE__",
      roleChooseForMeRouteToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      presentationMakeRouteToken: "__ROUTE__PRESENTATION_MAKE__",
      switchToSelfDreamToken: "__SWITCH_TO_SELF_DREAM__",
      dreamStartExerciseRouteToken: "__ROUTE__DREAM_START_EXERCISE__",
    },
    wording: {
      wordingSelectionMessage: () => "",
      pickPrompt: (specialist: Record<string, unknown>) => String(specialist.question || ""),
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) => String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: ({ prev, specialistResult }: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...prev,
        last_specialist_result: specialistResult,
      }),
      setDreamRuntimeMode: (state: Record<string, unknown>, mode: string) => {
        state.__dream_runtime_mode = mode;
      },
      getDreamRuntimeMode: (state: Record<string, unknown>) => String(state.__dream_runtime_mode || "self"),
      isUiStateHygieneSwitchV1Enabled: () => false,
      clearStepInteractiveState: (state: Record<string, unknown>) => state,
    },
    contracts: {
      renderFreeTextTurnPolicy: () => {
        throw new Error("renderFreeTextTurnPolicy should not be called in this test");
      },
      validateRenderedContractOrRecover: () => {
        throw new Error("validateRenderedContractOrRecover should not be called in this test");
      },
      applyUiPhaseByStep: () => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => {
        throw new Error("ensureStartState should not be called in this test");
      },
      parseStep0Final: () => ({ name: "TBD" }),
      inferStep0SeedFromInitialMessage: () => "",
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async ({ state, userMessage }: { state: Record<string, unknown>; userMessage: string }) => {
        calls.push({ state: { ...state }, userMessage });
        return {
          ok: true,
          value: {
            specialistResult: {
              action: "INTRO",
              message: "Laten we verder bouwen.",
              question: "Welke andere verandering zie je nog?",
              refined_formulation: "",
              dream: "",
              suggest_dreambuilder: "true",
              statements: state.dream_builder_statements,
              user_state: "ok",
              wants_recap: false,
              is_offtopic: false,
              user_intent: "STEP_INPUT",
              meta_topic: "NONE",
              scoring_phase: "false",
              clusters: [],
            },
            attempts: 1,
          },
        };
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any }) => ({
          ok: true,
          value: {
            state: params.state,
            specialist: params.specialist,
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "dream::incomplete_output::DREAM_MENU_INTRO",
              contractVersion: "1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          specialist: params.specialist,
          state: params.state,
        }),
        finalize: (payload: Record<string, unknown>) => payload,
      },
    },
    suggestions: {
      pickDreamSuggestionFromPreviousState: () => "",
      pickDreamCandidateFromState: () => "",
      pickRoleSuggestionFromPreviousState: () => "",
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  };

  const helpers = createRunStepRouteHelpers<any>(ports);
  const currentStatements = Array.from({ length: 5 }, (_, index) => `Nieuw statement ${index + 1}`);
  const staleStatements = Array.from({ length: 20 }, (_, index) => `Oud statement ${index + 1}`);
  const context: any = {
    routing: {
      userMessage: "__ROUTE__DREAM_START_EXERCISE__",
      actionCodeRaw: "ACTION_DREAM_START_EXERCISE",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "nl",
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
    },
    state: {
      state: {
        current_step: "dream",
        __dream_runtime_mode: "self",
        dream_builder_statements: currentStatements,
        dream_scoring_statements: staleStatements,
        dream_scores: [[8, 9, 7]],
        dream_top_clusters: [{ theme: "Vertrouwen", average: 8 }],
        dream_awaiting_direction: "false",
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "",
      pristineAtEntry: true,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  };

  const response = await helpers.handleSpecialRouteRegistry(context);
  assert.ok(response, "expected dream_start_exercise route response");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.userMessage, "__ROUTE__DREAM_START_EXERCISE__");
  assert.equal(String(calls[0]?.state.__dream_runtime_mode || ""), "builder_collect");
  assert.equal(String(calls[0]?.state.dream_awaiting_direction || ""), "false");
  assert.deepEqual(calls[0]?.state.dream_builder_statements, currentStatements);
  assert.deepEqual(calls[0]?.state.dream_scoring_statements, []);
  assert.deepEqual(calls[0]?.state.dream_scores, []);
  assert.deepEqual(calls[0]?.state.dream_top_clusters, []);

  const state = (response as Record<string, any>).state || {};
  assert.equal(String(state.__dream_runtime_mode || ""), "builder_collect");
  assert.deepEqual(state.dream_builder_statements, currentStatements);
});
