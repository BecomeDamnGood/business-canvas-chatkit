import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRouteHelpers } from "./run_step_routes.js";
import { hasValidStep0Final, parseStep0Final } from "./run_step_step0.js";

test("start_prestart prestart gate hydrates canonical step0_bootstrap from the LLM without seeding step_0_final", async () => {
  let bootstrapCalls = 0;

  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (key: string, fallback = "") => (key === "startHint" ? "Klik op Start om te beginnen." : fallback),
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => ({
        ...state,
        ui_strings: { startHint: "Klik op Start om te beginnen." },
      }) as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({
        state: {
          ...state,
          ui_strings: { startHint: "Klik op Start om te beginnen." },
        },
        interactiveReady: true,
      }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: () => "READY",
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        bootstrapCalls += 1;
        return {
          ok: true as const,
          value: {
            specialistResult: {
              recognized: true,
              venture: "tuin onderhoudbedrijf",
              name: "Groene Vingers",
              status: "existing",
            },
            attempts: 1,
            usage: {},
            model: "gpt-test",
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
            renderedStatus: "valid_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_START_GATE",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
          prompt: String(params.specialist.question || ""),
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "Ik heb een tuin onderhoudbedrijf Groene Vingers en wil een businessplan",
      actionCodeRaw: "",
      responseUiFlags: null,
      inputMode: "chat",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Ik heb een tuin onderhoudbedrijf Groene Vingers en wil een businessplan",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "Ik heb een tuin onderhoudbedrijf Groene Vingers en wil een businessplan",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(bootstrapCalls, 1);
  assert.equal(String(state.step_0_final || ""), "");
  assert.equal(String(state.started || ""), "false");
  assert.equal(String(state.business_name || ""), "Groene Vingers");
  assert.deepEqual(state.step0_bootstrap, {
    venture: "tuin onderhoudbedrijf",
    name: "Groene Vingers",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal(String(specialist.question || ""), "Klik op Start om te beginnen.");
});

test("start_prestart ACTION_START seeds step_0_final from the step-0 specialist before render", async () => {
  let ensureStartStateCalls = 0;
  let bootstrapCalls = 0;

  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => {
        ensureStartStateCalls += 1;
        return { state, interactiveReady: true };
      },
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: (_state: Record<string, unknown>, parsed: { name: string }) =>
        `READY:${parsed.name}`,
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        bootstrapCalls += 1;
        return {
          ok: true as const,
          value: {
            specialistResult: {
              recognized: true,
              venture: "reclamebureau",
              name: "Mindd",
              status: "existing",
            },
            attempts: 1,
            usage: {},
            model: "gpt-test",
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
            renderedStatus: "valid_output",
            actionCodes: ["ACTION_STEP0_READY_START"],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_READY_START",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Help met een businessplan voor mijn reclamebureau Mindd",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(ensureStartStateCalls > 0, true);
  assert.equal(bootstrapCalls, 1);
  assert.equal(String(state.started || ""), "true");
  assert.equal(String(state.intro_shown_session || ""), "true");
  assert.match(String(state.step_0_final || ""), /Venture:\s*reclamebureau/i);
  assert.match(String(state.step_0_final || ""), /Name:\s*Mindd/i);
  assert.match(String(state.step_0_final || ""), /Status:\s*existing/i);
  assert.equal(String(specialist.question || ""), "READY:Mindd");
});

test("start_prestart ACTION_START uses step-0 specialist bootstrap for natural opening sentence", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({ state, interactiveReady: true }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: (_state: Record<string, unknown>, parsed: { venture: string; name: string }) =>
        `READY:${parsed.venture}:${parsed.name}`,
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => ({
        ok: true as const,
        value: {
          specialistResult: {
            recognized: true,
            venture: "reclamebureau",
            name: "Mindd",
            status: "existing",
          },
          attempts: 1,
          usage: {},
          model: "gpt-test",
        },
      }),
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
            renderedStatus: "valid_output",
            actionCodes: ["ACTION_STEP0_READY_START"],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_READY_START",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "help met mijn ondernemingsplan voor mijn reclamebureau Mindd",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(String(state.step_0_final || ""), "Venture: reclamebureau | Name: Mindd | Status: existing");
  assert.equal(String(state.business_name || ""), "Mindd");
  assert.equal(String(specialist.question || ""), "READY:reclamebureau:Mindd");
});

test("start_prestart ACTION_START shows canonical LLM bootstrap for multiword venture and extracted brand", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({ state, interactiveReady: true }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: (_state: Record<string, unknown>, parsed: { venture: string; name: string }) =>
        `READY:${parsed.venture}:${parsed.name}`,
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => ({
        ok: true as const,
        value: {
          specialistResult: {
            recognized: true,
            venture: "Unified Commerce aanbieder",
            name: "New Black",
            status: "existing",
          },
          attempts: 1,
          usage: {},
          model: "gpt-test",
        },
      }),
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
            renderedStatus: "valid_output",
            actionCodes: ["ACTION_STEP0_READY_START"],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_READY_START",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Ik wil een businessplan voor New Black een Unified Commerce aanbieder",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(
    String(state.step_0_final || ""),
    "Venture: Unified Commerce aanbieder | Name: New Black | Status: existing"
  );
  assert.equal(String(state.business_name || ""), "New Black");
  assert.deepEqual(state.step0_bootstrap, {
    venture: "Unified Commerce aanbieder",
    name: "New Black",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal(String(specialist.question || ""), "READY:Unified Commerce aanbieder:New Black");
});

test("start_prestart ACTION_START accepts canonical LLM bootstrap for venture-first openings with a trailing brand name", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({ state, interactiveReady: true }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: (_state: Record<string, unknown>, parsed: { venture: string; name: string }) =>
        `READY:${parsed.venture}:${parsed.name}`,
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => ({
        ok: true as const,
        value: {
          specialistResult: {
            recognized: true,
            venture: "tuin onderhoudbedrijf",
            name: "Groene Vingers",
            status: "existing",
          },
          attempts: 1,
          usage: {},
          model: "gpt-test",
        },
      }),
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
            renderedStatus: "valid_output",
            actionCodes: ["ACTION_STEP0_READY_START"],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_READY_START",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Ik heb een tuin onderhoudbedrijf Groene Vingers en wil een businessplan",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(
    String(state.step_0_final || ""),
    "Venture: tuin onderhoudbedrijf | Name: Groene Vingers | Status: existing"
  );
  assert.equal(String(state.business_name || ""), "Groene Vingers");
  assert.deepEqual(state.step0_bootstrap, {
    venture: "tuin onderhoudbedrijf",
    name: "Groene Vingers",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal(String(specialist.question || ""), "READY:tuin onderhoudbedrijf:Groene Vingers");
});

test("start_prestart ACTION_START prefers canonical step0_bootstrap over reparsing raw input", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({ state, interactiveReady: true }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: (_state: Record<string, unknown>, parsed: { venture: string; name: string }) =>
        `READY:${parsed.venture}:${parsed.name}`,
      step0CardDescForState: () => "CardDesc",
      step0QuestionForState: () => "InitialQuestion",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => ({
        ok: true as const,
        value: {
          specialistResult: {
            recognized: false,
            venture: "",
            name: "",
            status: "starting",
          },
          attempts: 1,
          usage: {},
          model: "gpt-test",
        },
      }),
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
            renderedStatus: "valid_output",
            actionCodes: ["ACTION_STEP0_READY_START"],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:valid_output:STEP0_MENU_READY_START",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Need help",
        step0_bootstrap: {
          venture: "reclamebureau",
          name: "Mindd",
          status: "existing",
          source: "initial_user_message",
        },
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart route response");
  const state = (response as Record<string, any>).state || {};
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(String(state.step_0_final || ""), "Venture: reclamebureau | Name: Mindd | Status: existing");
  assert.equal(String(state.business_name || ""), "Mindd");
  assert.equal(String(specialist.question || ""), "READY:reclamebureau:Mindd");
});

test("start_prestart ACTION_START uses non-empty fallback copy when no seed is available", async () => {
  const ports: any = {
    ids: {
      step0Id: "step_0",
      dreamStepId: "dream",
      roleStepId: "role",
      strategyStepId: "strategy",
      presentationStepId: "presentation",
      step0Specialist: "ValidationAndBusinessName",
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
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) =>
        String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: (params: { prev: Record<string, unknown>; specialistResult: Record<string, unknown> }) => ({
        ...params.prev,
        last_specialist_result: params.specialistResult,
      }),
      setDreamRuntimeMode: () => {},
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
      applyUiPhaseByStep: (_state: Record<string, unknown>, _stepId: string, _contractId: string) => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async (state: Record<string, unknown>) => ({ state, interactiveReady: true }),
      parseStep0Final,
      hasValidStep0Final,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in this test");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (key: string, fallback = "") => {
        if (key === "step0.carddesc") return "FallbackCardDesc";
        if (key === "step0.question.initial") return "FallbackQuestion";
        return fallback;
      },
    },
    specialist: {
      callSpecialistStrictSafe: async () => ({
        ok: true as const,
        value: {
          specialistResult: {
            recognized: false,
            venture: "",
            name: "",
            status: "starting",
          },
          attempts: 1,
          usage: {},
          model: "gpt-test",
        },
      }),
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
            renderedStatus: "no_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "step_0:no_output:NO_MENU",
              contractVersion: "test",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          state: params.state,
          specialist: params.specialist,
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
  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "ACTION_START",
      actionCodeRaw: "ACTION_START",
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
        current_step: "step_0",
        started: "false",
        intro_shown_session: "false",
        initial_user_message: "Need help",
        last_specialist_result: {},
      },
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "ACTION_START",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected start_prestart fallback response");
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(String(specialist.message || ""), "FallbackCardDesc");
  assert.equal(String(specialist.question || ""), "FallbackQuestion");
});
