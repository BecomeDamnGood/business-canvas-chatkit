import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { renderFreeTextTurnPolicy } from "../core/turn_policy_renderer.js";
import { createRunStepRouteHelpers } from "./run_step_routes.js";

test("presentation make route keeps recap visible while adding presentation assets", async () => {
  const recap =
    "This is what you said:\n\nDream: Build calm around complex choices.\n\nPurpose: Turn complexity into clarity.";

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
      renderFreeTextTurnPolicy,
      validateRenderedContractOrRecover: ({ rendered, state }: { rendered: any; state: any }) => ({
        rendered,
        state,
        violation: null,
      }),
      applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
        state.__ui_phase_by_step = { ...(state.__ui_phase_by_step || {}), [stepId]: contractId };
      },
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => ({ state: getDefaultState(), interactiveReady: true }),
      parseStep0Final: () => ({ name: "Mindd" }),
      hasValidStep0Final: () => true,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => ({
        pdfUrl: "https://cdn.example.com/mindd.pdf",
        pngUrl: "https://cdn.example.com/mindd.png",
        baseName: "mindd-presentation",
        assetFingerprint: "asset-123",
      }),
      uiStringFromStateMap: (state: Record<string, unknown>, key: string, fallback: string) => {
        const map = state && typeof state.ui_strings === "object" ? state.ui_strings as Record<string, unknown> : {};
        const value = String(map[key] || "").trim();
        return value || fallback;
      },
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        throw new Error("callSpecialistStrictSafe should not be called");
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any; previousSpecialist?: any }) => {
          const rendered = renderFreeTextTurnPolicy({
            stepId: "presentation",
            state: params.state,
            specialist: params.specialist,
            previousSpecialist: params.previousSpecialist || {},
          });
          return {
            ok: true,
            value: {
              state: {
                ...params.state,
                last_specialist_result: rendered.specialist,
              },
              specialist: rendered.specialist,
              renderedStatus: rendered.status,
              actionCodes: rendered.uiActionCodes,
              renderedActions: rendered.uiActions,
              contractMeta: {
                contractId: rendered.contractId,
                contractVersion: rendered.contractVersion,
                textKeys: rendered.textKeys,
              },
            },
          };
        },
        attachAndFinalize: () => {
          throw new Error("attachAndFinalize should not be called for this route");
        },
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
  const state = getDefaultState();
  (state as any).current_step = "presentation";
  (state as any).active_specialist = "Presentation";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { presentation: recap };
  (state as any).provisional_source_by_step = { presentation: "user_input" };
  (state as any).ui_strings = {
    "presentation.ready": "Your presentation is ready.",
  };
  (state as any).last_specialist_result = {
    action: "ASK",
    message: recap,
    question: "",
    refined_formulation: recap,
    presentation_brief: recap,
    wants_recap: false,
    is_offtopic: false,
    user_intent: "STEP_INPUT",
    meta_topic: "NONE",
  };

  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "__ROUTE__PRESENTATION_MAKE__",
      actionCodeRaw: "ACTION_PRESENTATION_MAKE",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "en",
      ensureUiStrings: async (value: Record<string, unknown>) => value as any,
    },
    state: {
      state,
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "__ROUTE__PRESENTATION_MAKE__",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  assert.ok(response, "expected presentation route response");
  assert.equal((response as any).presentation_assets?.pdf_url, "https://cdn.example.com/mindd.pdf");
  assert.equal((response as any).presentation_assets?.png_url, "https://cdn.example.com/mindd.png");
  assert.match(String((response as any).text || ""), /Your presentation is ready\./);
  assert.match(String((response as any).text || ""), /This is what you said:/);
  assert.equal(String((response as any).state?.presentation_asset_fingerprint || ""), "asset-123");
});

test("presentation make route rebuilds a flattened stored recap into structured sections", async () => {
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
      renderFreeTextTurnPolicy,
      validateRenderedContractOrRecover: ({ rendered, state }: { rendered: any; state: any }) => ({
        rendered,
        state,
        violation: null,
      }),
      applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
        state.__ui_phase_by_step = { ...(state.__ui_phase_by_step || {}), [stepId]: contractId };
      },
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => ({ state: getDefaultState(), interactiveReady: true }),
      parseStep0Final: () => ({ name: "Mindd" }),
      hasValidStep0Final: () => true,
      inferStep0SeedFromInitialMessage: () => null,
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => ({
        pdfUrl: "https://cdn.example.com/mindd.pdf",
        pngUrl: "https://cdn.example.com/mindd.png",
        baseName: "mindd-presentation",
        assetFingerprint: "asset-123",
      }),
      uiStringFromStateMap: (state: Record<string, unknown>, key: string, fallback: string) => {
        const map = state && typeof state.ui_strings === "object" ? state.ui_strings as Record<string, unknown> : {};
        const value = String(map[key] || "").trim();
        return value || fallback;
      },
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        throw new Error("callSpecialistStrictSafe should not be called");
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any; previousSpecialist?: any }) => {
          const rendered = renderFreeTextTurnPolicy({
            stepId: "presentation",
            state: params.state,
            specialist: params.specialist,
            previousSpecialist: params.previousSpecialist || {},
          });
          return {
            ok: true,
            value: {
              state: {
                ...params.state,
                last_specialist_result: rendered.specialist,
              },
              specialist: rendered.specialist,
              renderedStatus: rendered.status,
              actionCodes: rendered.uiActionCodes,
              renderedActions: rendered.uiActions,
              contractMeta: {
                contractId: rendered.contractId,
                contractVersion: rendered.contractVersion,
                textKeys: rendered.textKeys,
              },
            },
          };
        },
        attachAndFinalize: () => {
          throw new Error("attachAndFinalize should not be called for this route");
        },
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
  const state = getDefaultState();
  (state as any).current_step = "presentation";
  (state as any).active_specialist = "Presentation";
  (state as any).business_name = "Mindd";
  (state as any).step_0_final = "Venture: consultancy | Name: Mindd | Status: existing";
  (state as any).dream_final = "Build calm around complex choices.";
  (state as any).strategy_final = "• Focus on trusted advisory\n• Win on clarity";
  (state as any).productsservices_final = "• Strategy sessions\n• Decision frameworks";
  (state as any).rulesofthegame_final = "• Tell the truth\n• Keep it practical";
  (state as any).provisional_by_step = {
    presentation:
      "This is what you said: Dream: Build calm around complex choices. Strategy: Focus on trusted advisory and win on clarity.",
  };
  (state as any).provisional_source_by_step = { presentation: "user_input" };
  (state as any).ui_strings = {
    "presentation.ready": "Your presentation is ready.",
    "presentation.recapIntro": "This is what you said:",
  };
  (state as any).last_specialist_result = {
    action: "ASK",
    message: "summary visible",
    question: "",
    refined_formulation: "",
    presentation_brief:
      "This is what you said: Dream: Build calm around complex choices. Strategy: Focus on trusted advisory and win on clarity.",
    wants_recap: false,
    is_offtopic: false,
    user_intent: "STEP_INPUT",
    meta_topic: "NONE",
  };

  const response = await helpers.handleSpecialRouteRegistry({
    routing: {
      userMessage: "__ROUTE__PRESENTATION_MAKE__",
      actionCodeRaw: "ACTION_PRESENTATION_MAKE",
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "en",
      ensureUiStrings: async (value: Record<string, unknown>) => value as any,
    },
    state: {
      state,
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: "__ROUTE__PRESENTATION_MAKE__",
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any);

  const text = String((response as any).text || "");
  assert.match(text, /\n\nVenture:\nconsultancy\n\nName:\nMindd/);
  assert.match(text, /\n\nDream:\nBuild calm around complex choices\./);
  assert.match(text, /\n\nStrategy:\n• Focus on trusted advisory\n• Win on clarity/);
  assert.match(text, /\n\nProducts and Services:\n• Strategy sessions\n• Decision frameworks/);
  assert.match(text, /\n\nRules of the Game:\n• Tell the truth\n• Keep it practical/);
});

test("presentation make route logs privacy-minimized usage analytics on success", async () => {
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map((value) => String(value)).join(" "));
  };

  try {
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
        renderFreeTextTurnPolicy,
        validateRenderedContractOrRecover: ({ rendered, state }: { rendered: any; state: any }) => ({
          rendered,
          state,
          violation: null,
        }),
        applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
          state.__ui_phase_by_step = { ...(state.__ui_phase_by_step || {}), [stepId]: contractId };
        },
        ensureUiStrings: async (state: Record<string, unknown>) => state as any,
        buildContractId: () => "",
      },
      step0: {
        ensureStartState: async () => ({ state: getDefaultState(), interactiveReady: true }),
        parseStep0Final: () => ({ name: "Mindd" }),
        hasValidStep0Final: () => true,
        inferStep0SeedFromInitialMessage: () => null,
        step0ReadinessQuestion: () => "",
        step0CardDescForState: () => "",
        step0QuestionForState: () => "",
      },
      presentation: {
        generatePresentationAssets: () => ({
          pdfUrl: "https://cdn.example.com/mindd.pdf",
          pngUrl: "https://cdn.example.com/mindd.png",
          baseName: "mindd-presentation",
          assetFingerprint: "asset-123",
        }),
        uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
        uiDefaultString: (_key: string, fallback = "") => fallback,
      },
      specialist: {
        callSpecialistStrictSafe: async () => {
          throw new Error("callSpecialistStrictSafe should not be called");
        },
        buildRoutingContext: () => ({}),
        rememberLlmCall: () => {},
      },
      response: {
        attachRegistryPayload: (payload: Record<string, unknown>) => payload,
        finalizeResponse: (payload: Record<string, unknown>) => payload,
        turnResponseEngine: {
          renderValidateRecover: (params: { state: any; specialist: any; previousSpecialist?: any }) => {
            const rendered = renderFreeTextTurnPolicy({
              stepId: "presentation",
              state: params.state,
              specialist: params.specialist,
              previousSpecialist: params.previousSpecialist || {},
            });
            return {
              ok: true,
              value: {
                state: {
                  ...params.state,
                  last_specialist_result: rendered.specialist,
                },
                specialist: rendered.specialist,
                renderedStatus: rendered.status,
                actionCodes: rendered.uiActionCodes,
                renderedActions: rendered.uiActions,
                contractMeta: {
                  contractId: rendered.contractId,
                  contractVersion: rendered.contractVersion,
                  textKeys: rendered.textKeys,
                },
              },
            };
          },
          attachAndFinalize: () => {
            throw new Error("attachAndFinalize should not be called for this route");
          },
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
    const state = getDefaultState();
    (state as any).current_step = "presentation";
    (state as any).active_specialist = "Presentation";
    (state as any).__session_turn_index = 7;
    (state as any).last_specialist_result = {
      action: "ASK",
      message: "summary visible",
      question: "",
      refined_formulation: "Summary",
      presentation_brief: "Summary",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };

    await helpers.handleSpecialRouteRegistry({
      routing: {
        userMessage: "__ROUTE__PRESENTATION_MAKE__",
        actionCodeRaw: "ACTION_PRESENTATION_MAKE",
        responseUiFlags: null,
        inputMode: "widget",
        wordingChoiceEnabled: true,
        languageResolvedThisTurn: true,
        isBootstrapPollCall: false,
        motivationQuotesEnabled: true,
      },
      rendering: {
        uiI18nTelemetry: {},
        lang: "en",
        ensureUiStrings: async (value: Record<string, unknown>) => value as any,
      },
      state: {
        state,
        transientPendingScores: null,
        submittedUserText: "",
        rawNormalized: "__ROUTE__PRESENTATION_MAKE__",
        pristineAtEntry: false,
      },
      specialist: {
        model: "gpt-test",
        decideOrchestration: () => ({} as any),
        rememberLlmCall: () => {},
      },
    } as any);
  } finally {
    console.log = originalConsoleLog;
  }

  const event = captured
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "app_usage_presentation_generated");

  assert.ok(event);
  assert.equal(event.analytics_schema, "bsc_app_usage_v1");
  assert.equal(event.session_turn_index, 7);
  assert.deepEqual(event.output_formats, ["pptx", "pdf", "png"]);
  assert.equal(event.base_name, undefined);
});

test("presentation make route logs privacy-minimized usage analytics on failure", async () => {
  const capturedWarn: string[] = [];
  const capturedError: string[] = [];
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  console.warn = (...args: unknown[]) => {
    capturedWarn.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    capturedError.push(args.map((value) => String(value)).join(" "));
  };

  try {
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
        renderFreeTextTurnPolicy,
        validateRenderedContractOrRecover: ({ rendered, state }: { rendered: any; state: any }) => ({
          rendered,
          state,
          violation: null,
        }),
        applyUiPhaseByStep: (state: Record<string, unknown>, stepId: string, contractId: string) => {
          state.__ui_phase_by_step = { ...(state.__ui_phase_by_step || {}), [stepId]: contractId };
        },
        ensureUiStrings: async (state: Record<string, unknown>) => state as any,
        buildContractId: () => "",
      },
      step0: {
        ensureStartState: async () => ({ state: getDefaultState(), interactiveReady: true }),
        parseStep0Final: () => ({ name: "Mindd" }),
        hasValidStep0Final: () => true,
        inferStep0SeedFromInitialMessage: () => null,
        step0ReadinessQuestion: () => "",
        step0CardDescForState: () => "",
        step0QuestionForState: () => "",
      },
      presentation: {
        generatePresentationAssets: () => {
          throw new Error("boom");
        },
        uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
        uiDefaultString: (_key: string, fallback = "") => fallback,
      },
      specialist: {
        callSpecialistStrictSafe: async () => {
          throw new Error("callSpecialistStrictSafe should not be called");
        },
        buildRoutingContext: () => ({}),
        rememberLlmCall: () => {},
      },
      response: {
        attachRegistryPayload: (payload: Record<string, unknown>) => payload,
        finalizeResponse: (payload: Record<string, unknown>) => payload,
        turnResponseEngine: {
          renderValidateRecover: (params: { state: any; specialist: any; previousSpecialist?: any }) => {
            const rendered = renderFreeTextTurnPolicy({
              stepId: "presentation",
              state: params.state,
              specialist: params.specialist,
              previousSpecialist: params.previousSpecialist || {},
            });
            return {
              ok: true,
              value: {
                state: {
                  ...params.state,
                  last_specialist_result: rendered.specialist,
                },
                specialist: rendered.specialist,
                renderedStatus: rendered.status,
                actionCodes: rendered.uiActionCodes,
                renderedActions: rendered.uiActions,
                contractMeta: {
                  contractId: rendered.contractId,
                  contractVersion: rendered.contractVersion,
                  textKeys: rendered.textKeys,
                },
              },
            };
          },
          attachAndFinalize: () => {
            throw new Error("attachAndFinalize should not be called for this route");
          },
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
    const state = getDefaultState();
    (state as any).current_step = "presentation";
    (state as any).active_specialist = "Presentation";
    (state as any).__session_turn_index = 8;
    (state as any).last_specialist_result = {
      action: "ASK",
      message: "summary visible",
      question: "",
      refined_formulation: "Summary",
      presentation_brief: "Summary",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };

    await helpers.handleSpecialRouteRegistry({
      routing: {
        userMessage: "__ROUTE__PRESENTATION_MAKE__",
        actionCodeRaw: "ACTION_PRESENTATION_MAKE",
        responseUiFlags: null,
        inputMode: "widget",
        wordingChoiceEnabled: true,
        languageResolvedThisTurn: true,
        isBootstrapPollCall: false,
        motivationQuotesEnabled: true,
      },
      rendering: {
        uiI18nTelemetry: {},
        lang: "en",
        ensureUiStrings: async (value: Record<string, unknown>) => value as any,
      },
      state: {
        state,
        transientPendingScores: null,
        submittedUserText: "",
        rawNormalized: "__ROUTE__PRESENTATION_MAKE__",
        pristineAtEntry: false,
      },
      specialist: {
        model: "gpt-test",
        decideOrchestration: () => ({} as any),
        rememberLlmCall: () => {},
      },
    } as any);
  } finally {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }

  const event = capturedWarn
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "app_usage_presentation_generation_failed");

  assert.ok(event);
  assert.equal(event.analytics_schema, "bsc_app_usage_v1");
  assert.equal(event.session_turn_index, 8);
  assert.equal(event.failure_stage, "asset_generation");
  assert.ok(capturedError.some((line) => line.includes("[presentation] Generation failed")));
});
