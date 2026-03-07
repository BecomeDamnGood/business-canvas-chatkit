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

test("dream_switch_to_self clears staged dream value and avoids refine path even when candidate exists", async () => {
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
});
